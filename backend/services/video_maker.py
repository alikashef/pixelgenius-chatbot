import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import time
from pathlib import Path

import httpx

from lib.ai.analyze_lead import _base_urls, SONNET_MODEL

# The scenario/revision agent is where video quality is decided, so it runs on the strongest model; Sonnet is the safety net.
AI_MODELS = [m for m in (os.getenv("VIDEO_AI_MODEL") or "claude-opus-5-5", SONNET_MODEL) if m]

logger = logging.getLogger(__name__)

FPS = 30
FORMATS = {"9:16": (1080, 1920), "4:5": (1080, 1350), "1:1": (1080, 1080), "16:9": (1920, 1080)}
# Visual styles, taken from the categories of motion-design galleries that FFmpeg + ASS can render faithfully.
# "clips" = how many of the user's own clips the style needs; "credits" = extra price on top of the base cost.
STYLE_CATALOG = {
    "typography": {"label": "تایپوگرافی سریع", "hint": "متن درشت کلمه‌به‌کلمه روی پس‌زمینه‌ی ساده", "credits": 0, "clips": 0, "category": "Kinetic type"},
    "shapes": {"label": "اشکال هندسی متحرک", "hint": "دایره و حلقه‌های شناور پشت متن؛ حس برند و مدرن", "credits": 40, "clips": 0, "category": "Shapes"},
    "particles": {"label": "ذرات شناور", "hint": "ذره‌های نورانی که آرام بالا می‌روند؛ حس آرام و حرفه‌ای", "credits": 40, "clips": 0, "category": "Particles"},
    "waveform": {"label": "موج صدا", "hint": "موج زنده‌ی صدای گوینده؛ مناسب آموزش و محتوای صوتی", "credits": 30, "clips": 0, "category": "Music"},
    "steps": {"label": "مراحل و دیاگرام", "hint": "نشانگر مرحله‌ها بالای صفحه؛ مناسب «سه دلیل»، آموزش و فرآیند", "credits": 30, "clips": 0, "category": "Diagrams"},
    "clips": {"label": "کلیپ‌های تو و راوی", "hint": "صدای گوینده روی کلیپ‌هایی که فرستادی", "credits": 20, "clips": 1, "category": "Photos"},
    "phone": {"label": "قاب موبایل", "hint": "کلیپ یا اسکرین‌رکورد تو داخل قاب گوشی؛ مناسب نمایش سایت و اپ", "credits": 50, "clips": 1, "category": "Phone / Product UI"},
    "before_after": {"label": "قبل و بعد", "hint": "مقایسه‌ی دو کلیپ در صفحه‌ی تقسیم‌شده", "credits": 30, "clips": 2, "category": "Product UI"},
}
STYLES = tuple(STYLE_CATALOG)
# ElevenLabs premade voices (George, Rachel, Adam); the OpenAI names are the fallback provider's equivalents
VOICES = {"male_warm": "JBFqnCBsd6RMkjVDRZzb", "female_formal": "21m00Tcm4TlvDq8ikWAM", "male_energetic": "pNInz6obpgDQGcFmaJgB"}
FALLBACK_VOICES = {"male_warm": "onyx", "female_formal": "nova", "male_energetic": "echo"}
VOICE_LABELS = {"male_warm": "گوینده‌ی مرد · گرم و صمیمی", "female_formal": "گوینده‌ی زن · رسمی و شفاف", "male_energetic": "گوینده‌ی مرد · پرانرژی"}
PREVIEW_TEXT = "سلام! من گوینده‌ی ویدیوی شما هستم. چرا سایتت بازدید داره، ولی کسی نمی‌خره؟"
KAYA_URL = "https://kayaai.ir/api/v1"
KAYA_MODEL = "elevenlabs/eleven-v3"
VOICE_STYLE = {
    "male_warm": "warm, friendly and relaxed",
    "female_formal": "formal, clear and professional",
    "male_energetic": "energetic, upbeat and punchy",
}
SPEEDS = {"slow": 0.9, "normal": 1.0, "fast": 1.15}
SUBTITLE_MODES = ("word", "sentence")
SUBTITLE_POSITIONS = ("top", "middle", "bottom")
DURATIONS = (15, 30, 45, 60)
TTS_MODEL = "gpt-4o-mini-tts"
STT_MODEL = "whisper-1"
INCLUDED_EDITS = 4

DEFAULT_SETTINGS = {
    "format": "9:16", "style": "typography", "voice": "male_warm", "speed": "normal",
    "subtitle_mode": "word", "subtitle_pos": "bottom", "cover_title": "", "duration": 30,
}

# Starting prices in credits; change here (or move to the admin panel later), nothing downstream hardcodes them.
CREDIT_PRICES = {"script": 80, "narration_per_30s": 120, "subtitles": 40, "cover": 60, "render": 40, "extra_edit": 120}

FONTS_DIR = Path(__file__).resolve().parent.parent / "fonts"
FONT_BOLD = "Yekan Bakh FaNum"
FONT_BLACK = "Yekan Bakh FaNum Black"
MAX_SCENES = 10
MIN_SCENE, MAX_SCENE = 1.5, 12.0
PALETTES = ["0x15171c", "0x1e1b2e", "0x241b3a", "0x12202b"]
HIGHLIGHT = "&H0000D7FF&"  # BGR of #ffd700

AGENT_PROMPT = """You are the scenario agent of PixelGenius Video Maker. You talk with a Persian-speaking user and write a short-video scenario together.
Reply ONLY with one JSON object, no markdown:
{
 "reply": "your message in Persian (friendly, short, one question at a time)",
 "quick_replies": ["up to 3 short Persian answer suggestions for your question, or []"],
 "info": {"brand": null or string, "cta": null or string, "format": null or "9:16"|"4:5"|"1:1"|"16:9", "format_reason": null or string, "style": null or "typography"|"shapes"|"particles"|"waveform"|"steps"|"clips"|"phone"|"before_after", "style_reason": null or string},
 "scenario": null or {"title": "hook headline, the question the video opens with", "scenes": [{"kind": "hook|body|cta", "title": "short scene label", "text": "on-screen headline, max 10 words, use \\n for line breaks", "highlight": "one word from text", "narration": "what the narrator says, 1-2 sentences", "duration": seconds, "asset": null or uploaded clip index}]},
 "ready": true or false
}
Process: first learn what the video is for and what the viewer should do. Required to finish: brand name and the call to action. The logo is optional (ask once if missing). Detect the format from the user's words (reel/story => 9:16, feed post => 4:5, YouTube/site => 16:9) and say so in format_reason; do not ask about it.
As soon as you know the goal, write the full scenario (3-6 scenes, total close to the requested duration, first scene a hook, last scene the CTA) and keep refining it as the user answers. Set ready=true only when brand and cta are known and the scenario exists.
Narration length must fit the scene: at most 2.3 words per second of the scene duration, and the scene durations must add up to the requested duration. Narration must be natural, standard spoken Persian that a text-to-speech voice can read correctly: full words, no slang contractions, numbers as words.
Pick style from the situation: "typography" (big word-by-word text), "shapes" (floating geometric shapes, modern brand feel), "particles" (soft rising particles, calm professional feel), "waveform" (live voice waveform, educational/audio content), "steps" (step indicator, good for "three reasons"/how-to), all needing no footage; "clips" (narration over the user's uploaded clips) and "phone" (a clip inside a phone frame, good for showing a website or app) need 1+ uploaded clips; "before_after" (split screen) needs 2+ clips. Never pick a style whose clips are missing. Explain the choice in style_reason in one sentence without claiming research you did not do.
Never invent facts, prices, results or customer claims the user did not give. Never claim you analysed trending videos."""

REVISE_PROMPT = """You edit an existing Persian short-video scenario for a user. Reply ONLY with one JSON object, no markdown:
{"reply": "one short Persian sentence saying what you changed",
 "scenario": null or the FULL updated scenario in the same shape as the current one (only when text, order, timing or narration must change; change as little as possible and keep untouched scenes byte-identical),
 "settings": {} or a patch with any of: "voice": male_warm|female_formal|male_energetic, "speed": slow|normal|fast, "subtitle_mode": word|sentence, "subtitle_pos": top|middle|bottom, "cover_title": string, "style": typography|shapes|particles|waveform|steps|clips|phone|before_after}
If the request is impossible with these options, set scenario null, settings {} and explain in reply. Never invent facts the user did not give."""


class VideoError(Exception):
    pass


def _clamp_scene(raw: dict, clip_count: int) -> dict:
    text = str(raw.get("text", "")).strip()
    narration = str(raw.get("narration", "")).strip()
    if not text and not narration:
        raise VideoError("متن یکی از صحنه‌ها خالی است")
    try:
        duration = float(raw.get("duration", 4))
    except (TypeError, ValueError):
        duration = 4.0
    asset = raw.get("asset")
    if not isinstance(asset, int) or isinstance(asset, bool) or not 0 <= asset < clip_count:
        asset = None
    kind = raw.get("kind") if raw.get("kind") in ("hook", "body", "cta") else "body"
    return {
        "kind": kind,
        "title": str(raw.get("title", ""))[:60],
        "text": text[:200],
        "highlight": str(raw.get("highlight") or "").strip()[:60],
        "narration": narration[:400],
        "duration": round(min(MAX_SCENE, max(MIN_SCENE, duration)), 1),
        "asset": asset,
    }


def normalize_scenario(data: dict, clip_count: int) -> dict:
    scenes = data.get("scenes") if isinstance(data, dict) else None
    if not isinstance(scenes, list) or not scenes:
        raise VideoError("سناریو معتبر نیست")
    return {
        "title": str(data.get("title", ""))[:120],
        "scenes": [_clamp_scene(s, clip_count) for s in scenes[:MAX_SCENES] if isinstance(s, dict)],
    }


def clean_settings(patch: dict, current: dict | None = None) -> dict:
    """Keep only valid values; anything else is dropped so a model slip never reaches the renderer."""
    out = dict(current or DEFAULT_SETTINGS)
    rules = {"format": FORMATS, "style": STYLES, "voice": VOICES, "speed": SPEEDS, "subtitle_mode": SUBTITLE_MODES, "subtitle_pos": SUBTITLE_POSITIONS}
    for key, allowed in rules.items():
        if patch.get(key) in allowed:
            out[key] = patch[key]
    if isinstance(patch.get("duration"), int) and patch["duration"] in DURATIONS:
        out["duration"] = patch["duration"]
    if isinstance(patch.get("cover_title"), str):
        out["cover_title"] = patch["cover_title"].strip()[:80]
    return out


async def _ask_json(system: str, user: str, history: list[dict] | None = None) -> dict:
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        raise VideoError("کلید هوش مصنوعی تنظیم نشده است")
    for model in dict.fromkeys(AI_MODELS):
        payload = {
            "model": model,
            "messages": [{"role": "system", "content": system}, *(history or []), {"role": "user", "content": user}],
            "temperature": 0.7,
            "max_tokens": 3000,
        }
        for base_url in _base_urls():
            try:
                async with httpx.AsyncClient(timeout=150) as client:
                    response = await client.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=payload)
                    response.raise_for_status()
                    content = response.json()["choices"][0]["message"]["content"]
                return json.loads(re.search(r"\{.*\}", content, re.S).group(0))
            except (httpx.HTTPError, KeyError, IndexError, ValueError, AttributeError) as exc:
                logger.warning("AI call to %s failed via %s: %s", model, base_url, exc)
    raise VideoError("ارتباط با دستیار برقرار نشد، دوباره تلاش کنید")


def _state_for_prompt(project: dict) -> str:
    clips = [{"index": c["index"], "name": c["name"], "seconds": c["duration"]} for c in project["clips"]]
    return json.dumps({
        "requested_duration_seconds": project["settings"]["duration"],
        "uploaded_clips": clips,
        "logo_uploaded": bool(project.get("logo")),
        "known_info": project["info"],
        "current_scenario": project["scenario"],
    }, ensure_ascii=False)


async def chat_turn(project: dict, message: str) -> dict:
    """One agent turn: returns reply, quick replies, info patch, updated scenario (or None) and readiness."""
    history = [{"role": m["role"], "content": m["content"]} for m in project["messages"][-16:]]
    data = await _ask_json(AGENT_PROMPT + "\n\nCurrent state:\n" + _state_for_prompt(project), message, history)
    reply = str(data.get("reply", "")).strip()
    if not reply:
        raise VideoError("پاسخ دستیار خالی بود، دوباره تلاش کنید")
    scenario = None
    if isinstance(data.get("scenario"), dict):
        try:
            scenario = normalize_scenario(data["scenario"], len(project["clips"]))
        except VideoError:
            scenario = None
    info_in = data.get("info") if isinstance(data.get("info"), dict) else {}
    info = {k: info_in[k] for k in ("brand", "cta", "format_reason", "style_reason") if isinstance(info_in.get(k), str) and info_in[k].strip()}
    for key, allowed in (("format", FORMATS), ("style", STYLES)):
        if info_in.get(key) in allowed:
            info[key] = info_in[key]
    quick = [str(q)[:60] for q in data.get("quick_replies", []) if isinstance(q, str)][:3]
    return {"reply": reply, "quick_replies": quick, "info": info, "scenario": scenario}


async def revise(project: dict, request: str) -> dict:
    data = await _ask_json(REVISE_PROMPT + "\n\nCurrent state:\n" + _state_for_prompt(project) + "\nCurrent settings: " + json.dumps(project["settings"]), request)
    scenario = None
    if isinstance(data.get("scenario"), dict):
        scenario = normalize_scenario(data["scenario"], len(project["clips"]))
    patch = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    return {"reply": str(data.get("reply", "")).strip(), "scenario": scenario, "settings": clean_settings(patch, project["settings"])}


def estimate_seconds(scenario: dict | None) -> float:
    if not scenario:
        return 0.0
    total = 0.0
    for scene in scenario["scenes"]:
        words = len(scene["narration"].split())
        total += max(scene["duration"], words / 2.4 + 0.4) if words else scene["duration"]
    return round(total, 1)


def estimate_cost(project: dict) -> dict:
    prices, settings = CREDIT_PRICES, project["settings"]
    seconds = estimate_seconds(project["scenario"])
    lines = [
        {"label": "تحلیل و نوشتن سناریو", "credits": prices["script"]},
        {"label": f"صدای گوینده · {round(seconds)} ثانیه", "credits": round(prices["narration_per_30s"] * max(seconds, 1) / 30)},
        {"label": "زیرنویس", "credits": prices["subtitles"]},
        {"label": "کاور", "credits": prices["cover"]},
        {"label": "رندر نهایی", "credits": prices["render"]},
    ]
    style = STYLE_CATALOG[settings["style"]]
    if style["credits"]:
        lines.append({"label": f"سبک «{style['label']}»", "credits": style["credits"]})
    return {"format": settings["format"], "seconds": seconds, "lines": lines, "total": sum(line["credits"] for line in lines),
            "included_edits": INCLUDED_EDITS, "extra_edit": prices["extra_edit"]}


# --- narration ---------------------------------------------------------------------------------

def _post_audio(path: str, **kwargs) -> httpx.Response:
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        raise VideoError("کلید هوش مصنوعی تنظیم نشده است")
    last = "ساخت صدای گوینده ناموفق بود"
    for base_url in _base_urls():
        try:
            response = httpx.post(f"{base_url}{path}", headers={"Authorization": f"Bearer {api_key}"}, timeout=120, **kwargs)
            response.raise_for_status()
            return response
        except httpx.HTTPError as exc:
            logger.warning("Audio call %s failed via %s: %s", path, base_url, exc)
    raise VideoError(last)


def _kaya_tts(text: str, voice: str) -> bytes:
    key = os.getenv("KAYA_API_KEY", "")
    if not key:
        raise VideoError("کلید Kaya تنظیم نشده است")
    url = (os.getenv("KAYA_BASE_URL") or KAYA_URL).rstrip("/") + "/audio/speech"
    for attempt in range(4):
        try:
            response = httpx.post(url, headers={"Authorization": f"Bearer {key}"}, timeout=120,
                                  json={"model": KAYA_MODEL, "voice": VOICES[voice], "input": text})
        except httpx.HTTPError as exc:
            if attempt < 2:  # connection hiccups are common on this route; retry before falling back
                time.sleep(2)
                continue
            raise VideoError(f"Kaya: {exc}")
        if response.status_code == 429 and attempt < 3:  # low-balance accounts are limited to 10 requests a minute
            time.sleep(15)
            continue
        if response.status_code != 200 or not response.content:
            raise VideoError(f"Kaya: HTTP {response.status_code}")
        return response.content
    raise VideoError("Kaya: rate limited")


def _openai_tts(text: str, voice: str) -> bytes:
    body = {"model": TTS_MODEL, "voice": FALLBACK_VOICES[voice], "input": text, "response_format": "mp3",
            "instructions": f"Speak natural standard Persian (Farsi), {VOICE_STYLE[voice]}, clear diction, steady pace."}
    return _post_audio("/audio/speech", json=body).content


def tts_bytes(text: str, voice: str) -> bytes:
    """ElevenLabs v3 through Kaya; if that provider is unavailable the same voice role is read by the fallback model."""
    try:
        return _kaya_tts(text, voice)
    except VideoError as exc:
        logger.warning("Primary TTS failed (%s); using fallback", exc)
        return _openai_tts(text, voice)


def voice_preview(voice: str, cache_dir: Path) -> Path:
    """A short sample of one narrator. Only the primary voice is cached; a fallback sample is served once and never stored."""
    if voice not in VOICES:
        raise VideoError("گوینده پیدا نشد")
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / f"{voice}.mp3"
    if out.exists():
        return out
    try:
        data, cache = _kaya_tts(PREVIEW_TEXT, voice), True
    except VideoError as exc:
        logger.warning("Primary TTS failed for preview (%s); serving fallback sample uncached", exc)
        data, cache = _openai_tts(PREVIEW_TEXT, voice), False
    target = out if cache else cache_dir / f"{voice}.fallback.mp3"
    tmp = target.with_suffix(".tmp")
    tmp.write_bytes(data)
    tmp.replace(target)
    return target


def stt_words(audio: Path) -> list[dict]:
    with audio.open("rb") as f:
        response = _post_audio("/audio/transcriptions", data={"model": STT_MODEL, "language": "fa", "response_format": "verbose_json", "timestamp_granularities[]": "word"},
                               files={"file": (audio.name, f, "audio/mpeg")})
    return [{"start": float(w["start"]), "end": float(w["end"])} for w in response.json().get("words", [])]


def _run(cmd: list[str], timeout: int = 300) -> None:
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout, text=True)
    except subprocess.TimeoutExpired:
        raise VideoError("زمان ساخت ویدیو از حد مجاز بیشتر شد")
    if result.returncode != 0:
        logger.error("ffmpeg failed: %s", result.stderr[-2000:])
        raise VideoError("ساخت ویدیو با خطا روبه‌رو شد")


def probe(path: Path) -> dict:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", str(path)],
        capture_output=True, text=True, timeout=30,
    )
    if out.returncode != 0:
        raise VideoError("فایل ویدیو قابل خواندن نیست")
    data = json.loads(out.stdout)
    video = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    if video is None:
        return {"width": 0, "height": 0, "fps": 0, "duration": float(data["format"].get("duration", 0)), "has_audio": True}
    num, den = video["r_frame_rate"].split("/")
    return {
        "width": video["width"], "height": video["height"],
        "fps": round(int(num) / int(den or 1), 2),
        "duration": float(data["format"]["duration"]),
        "has_audio": any(s["codec_type"] == "audio" for s in data["streams"]),
    }


def narrate(text: str, voice: str, speed: str, cache: Path) -> dict:
    """Spoken audio for one scene: {path, duration, words:[(word,start,end)]}. Cached by content so unchanged scenes are never re-synthesised."""
    key = hashlib.sha256(f"{voice}|{speed}|{text}".encode()).hexdigest()[:20]
    audio, meta = cache / f"{key}.mp3", cache / f"{key}.json"
    if audio.exists() and meta.exists():
        return {"path": audio, **json.loads(meta.read_text())}
    cache.mkdir(parents=True, exist_ok=True)
    raw = cache / f"{key}.raw.mp3"
    raw.write_bytes(tts_bytes(text, voice))
    _run(["ffmpeg", "-y", "-i", str(raw), "-filter:a", f"atempo={SPEEDS[speed]}", "-ar", "44100", "-ac", "2", "-b:a", "160k", str(audio)], timeout=60)
    raw.unlink(missing_ok=True)
    duration = probe(audio)["duration"]
    words = text.split()
    heard = stt_words(audio)
    if len(heard) == len(words):
        timing = heard
    else:  # the recogniser split words differently: spread the script's words over the voiced span by length
        start, end = (heard[0]["start"], heard[-1]["end"]) if heard else (0.0, duration)
        weights = [max(len(w), 1) for w in words]
        cursor, timing = start, []
        for weight in weights:
            span = (end - start) * weight / sum(weights)
            timing.append({"start": cursor, "end": cursor + span})
            cursor += span
    result = {"duration": duration, "words": [{"w": w, **t} for w, t in zip(words, timing)]}
    meta.write_text(json.dumps(result, ensure_ascii=False))
    return {"path": audio, **result}


# --- subtitles / ASS -----------------------------------------------------------------------------

def _ass_time(seconds: float) -> str:
    return f"{int(seconds // 3600)}:{int(seconds % 3600 // 60):02d}:{seconds % 60:05.2f}"


def _highlight_line(line: str, highlight: str) -> str:
    # libass lays colour-override runs out left-to-right even in RTL text, so the runs are emitted in reverse order
    if not highlight or highlight not in line:
        return line
    before, after = line.split(highlight, 1)

    # an RLM inside each run keeps edge punctuation on the correct side of its own run
    def run(part: str) -> str:
        return f"\u200f{part}\u200f" if part else ""

    # edge spaces must be hard spaces sitting outside the runs where they meet in the emitted string
    gap_before = "\\h" if before.endswith(" ") else ""
    gap_after = "\\h" if after.startswith(" ") else ""
    return f"{run(after.strip(' '))}{gap_after}{{\\c{HIGHLIGHT}}}{run(highlight)}{{\\c&HFFFFFF&}}{gap_before}{run(before.strip(' '))}"


def _headline(scene: dict) -> str:
    text = scene["text"].replace("\r", "")
    return "\\N".join(_highlight_line(line, scene["highlight"]) for line in text.split("\n"))


def _subtitle_events(scene: dict, words: list[dict], mode: str, duration: float, lead: float) -> list[tuple[float, float, str, str]]:
    """(start, end, style, text) events following the narrator; word mode shows one word at a time."""
    if not words:
        return []
    events = []
    if mode == "word":
        for i, w in enumerate(words):
            start = lead + w["start"]
            end = lead + words[i + 1]["start"] if i + 1 < len(words) else lead + w["end"] + 0.25
            events.append((start, min(end, duration), "Word", f"\u200f{w['w']}\u200f"))
    else:
        groups = [words[i:i + 4] for i in range(0, len(words), 4)]
        for i, g in enumerate(groups):
            start = lead + g[0]["start"]
            end = lead + groups[i + 1][0]["start"] if i + 1 < len(groups) else lead + g[-1]["end"] + 0.3
            events.append((start, min(end, duration), "Line", "\u200f" + " ".join(x["w"] for x in g) + "\u200f"))
    return events


_CIRCLE = "m 0 50 b 0 22 22 0 50 0 b 78 0 100 22 100 50 b 100 78 78 100 50 100 b 22 100 0 78 0 50"
BRAND_BGR, GOLD_BGR = "&HED3A7C&", "&H00D7FF&"


def _rand(seed: int):
    state = seed * 2654435761 % 2**32 or 1

    def nxt() -> float:
        nonlocal state
        state = (state * 1664525 + 1013904223) % 2**32
        return state / 2**32

    return nxt


def _style_extras(style: str, index: int, total: int, width: int, height: int, duration: float) -> str:
    """ASS drawing events for the decorative styles; they sit on layer 0, under all text."""
    unit = min(width, height) / 1080
    end, ms = _ass_time(duration), round(duration * 1000)
    rnd = _rand(index + 7)
    out = ""
    if style == "shapes":
        for i in range(7):
            size = round((140 + rnd() * 380) * unit)
            x1, y1 = rnd() * width, rnd() * height
            x2, y2 = x1 + (rnd() - 0.5) * 260 * unit, y1 + (rnd() - 0.5) * 260 * unit
            ring = i % 2 == 1
            colour = BRAND_BGR if i % 3 else GOLD_BGR
            fill = f"\\1a&HFF&\\3c{colour}\\bord{round(8 * unit)}\\3a&H90&" if ring else f"\\1c{colour}\\1a&HC8&\\bord0"
            out += f"Dialogue: 0,{_ass_time(0)},{end},Tag,,0,0,0,,{{\\an5\\p1{fill}\\shad0\\blur6\\fscx{size}\\fscy{size}\\move({x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f},0,{ms})}}{_CIRCLE}{{\\p0}}\n"
    elif style == "particles":
        for i in range(30):
            size = round((8 + rnd() * 16) * unit)
            x = rnd() * width
            t1 = round(rnd() * ms * 0.45)
            t2 = min(ms, t1 + round(ms * (0.55 + rnd() * 0.45)))
            colour = GOLD_BGR if i % 4 == 0 else "&HFFFFFF&"
            alpha = f"&H{round(60 + rnd() * 120):02X}&"
            out += (f"Dialogue: 0,{_ass_time(0)},{end},Tag,,0,0,0,,{{\\an5\\p1\\1c{colour}\\1a{alpha}\\bord0\\shad0\\blur2\\fscx{size}\\fscy{size}"
                    f"\\move({x:.0f},{height + 30},{x + (rnd() - 0.5) * 120 * unit:.0f},-30,{t1},{t2})}}{_CIRCLE}{{\\p0}}\n")
    elif style == "steps":
        gap, dot = round(70 * unit), round(34 * unit)
        left = width / 2 + (total - 1) * gap / 2
        for i in range(total):
            x = left - i * gap  # right-to-left: step one sits on the right
            if i == index:
                fill = f"\\1c{GOLD_BGR}\\1a&H00&\\bord0"
            elif i < index:
                fill = f"\\1c{BRAND_BGR}\\1a&H00&\\bord0"
            else:
                fill = f"\\1a&HFF&\\3c&HA0A0A0&\\bord{max(round(4 * unit), 2)}"
            size = round(dot * (1.35 if i == index else 1))
            out += f"Dialogue: 0,{_ass_time(0)},{end},Tag,,0,0,0,,{{\\an5\\p1{fill}\\shad0\\fscx{size}\\fscy{size}\\pos({x:.0f},{round(height * 0.06)})}}{_CIRCLE}{{\\p0}}\n"
    return out


def _scene_ass(scene: dict, size: tuple[int, int], settings: dict, words: list[dict], duration: float, labels: tuple[str, str] | None = None, index: int = 0, total: int = 1) -> str:
    width, height = size
    unit = min(width, height) / 1080
    sub_y = {"top": 0.10, "middle": 0.5, "bottom": 0.80}[settings["subtitle_pos"]]
    sub_an = 8 if settings["subtitle_pos"] == "top" else 5
    word_size = round((110 if settings["style"] == "typography" else 92) * unit)
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Head,{FONT_BLACK},{round(96 * unit)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{round(6 * unit)},2,5,80,80,0,1
Style: Word,{FONT_BLACK},{word_size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{round(6 * unit)},2,5,80,80,0,1
Style: Line,{FONT_BOLD},{round(70 * unit)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{round(5 * unit)},2,5,80,80,0,1
Style: Tag,{FONT_BOLD},{round(48 * unit)},&H00FFD700,&H00FFD700,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{round(4 * unit)},2,5,80,80,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    pop = "{\\fad(250,200)\\fscx85\\fscy85\\t(0,300,\\fscx100\\fscy100)}"
    out = header + _style_extras(settings["style"], index, total, width, height, duration)
    head_y = 0.32 if settings["subtitle_pos"] != "middle" else 0.22
    if settings["style"] == "phone":
        head_y = 0.11
    if scene["text"]:
        out += f"Dialogue: 1,{_ass_time(0)},{_ass_time(duration)},Head,,0,0,0,,{{\\pos({width // 2},{round(height * head_y)})}}{pop}{_headline(scene)}\n"
    for start, end, style, text in _subtitle_events(scene, words, settings["subtitle_mode"], duration, 0.15):
        out += f"Dialogue: 2,{_ass_time(start)},{_ass_time(end)},{style},,0,0,0,,{{\\an{sub_an}\\pos({width // 2},{round(height * sub_y)})}}{text}\n"
    if labels:
        out += f"Dialogue: 3,{_ass_time(0)},{_ass_time(duration)},Tag,,0,0,0,,{{\\an7\\pos({round(40 * unit)},{round(40 * unit)})}}{labels[0]}\n"
        out += f"Dialogue: 3,{_ass_time(0)},{_ass_time(duration)},Tag,,0,0,0,,{{\\an7\\pos({round(40 * unit)},{height // 2 + round(40 * unit)})}}{labels[1]}\n"
    return out


# --- rendering -----------------------------------------------------------------------------------

def _background(scene: dict, index: int, size: tuple[int, int], style: str, clips: list[Path], split: bool) -> tuple[list[str], str]:
    """(ffmpeg input args, filter chain that outputs [bg])"""
    width, height = size
    fit = lambda w, h: f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},setsar=1,fps={FPS},eq=brightness=-0.28:saturation=0.8"
    if style == "before_after" and split and len(clips) >= 2:
        if width >= height:
            half, stack = (width // 2, height), "hstack"
        else:
            half, stack = (width, height // 2), "vstack"
        args = ["-stream_loop", "-1", "-i", str(clips[0]), "-stream_loop", "-1", "-i", str(clips[1])]
        return args, f"[0:v]{fit(*half)}[a];[1:v]{fit(*half)}[b];[a][b]{stack}[bg]"
    if style == "phone" and clips:
        asset = scene["asset"] if scene["asset"] is not None else index % len(clips)
        if height >= width:
            sw = round(width * 0.40)
            sh = round(sw * 16 / 9)
        else:
            sh = round(height * 0.6)
            sw = round(sh * 9 / 16)
        edge = 14
        args = ["-f", "lavfi", "-i", f"color=c={PALETTES[index % len(PALETTES)]}:s={width}x{height}:r={FPS}", "-stream_loop", "-1", "-i", str(clips[asset])]
        graph = (f"[1:v]scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={sw}:{sh},setsar=1,fps={FPS},pad={sw + 2 * edge}:{sh + 2 * edge}:{edge}:{edge}:color=0x2a2a33[ph];"
                 f"[0:v][ph]overlay=(W-w)/2:{round(height * 0.22)}[bg]")
        return args, graph
    if style in ("clips", "before_after") and clips:
        asset = scene["asset"] if scene["asset"] is not None else index % len(clips)
        return ["-stream_loop", "-1", "-i", str(clips[asset])], f"[0:v]{fit(width, height)}[bg]"
    return ["-f", "lavfi", "-i", f"color=c={PALETTES[index % len(PALETTES)]}:s={width}x{height}:r={FPS}"], "[0:v]null[bg]"


def _render_scene(index: int, scene: dict, narration: dict | None, settings: dict, size: tuple[int, int], clips: list[Path], logo: Path | None, work: Path, total: int = 1) -> tuple[Path, float]:
    duration = round(narration["duration"] + 0.5, 2) if narration else scene["duration"]
    duration = max(duration, MIN_SCENE)
    split = settings["style"] == "before_after" and scene["kind"] == "body" and len(clips) >= 2
    ass = work / f"scene{index}.ass"
    ass.write_text(_scene_ass(scene, size, settings, narration["words"] if narration else [], duration, ("بعد", "قبل") if split else None, index, total), encoding="utf-8")
    out = work / f"scene{index}.mp4"
    fade = f"fade=t=in:d=0.2,fade=t=out:st={max(duration - 0.2, 0):.2f}:d=0.2"
    inputs, graph = _background(scene, index, size, settings["style"], clips, split)
    n = len([a for a in inputs if a == "-i"])
    chain = graph
    last = "bg"
    if logo is not None and scene["kind"] == "cta":
        inputs += ["-i", str(logo)]
        side = round(min(size) * 0.28)
        chain += f";[{n}:v]scale={side}:{side}:force_original_aspect_ratio=decrease,format=rgba[lg];[{last}][lg]overlay=(W-w)/2:H*0.62:format=auto[bgl]"
        last, n = "bgl", n + 1
    if narration:
        inputs += ["-i", str(narration["path"])]
        audio = f"[{n}:a]adelay=150|150,apad,aresample=44100"
        if settings["style"] == "waveform":
            wave_h = round(size[1] * 0.14)
            chain += (f";{audio},asplit=2[a][aw];[aw]volume=3,showwaves=s={size[0]}x{wave_h}:mode=cline:rate={FPS}:colors=0xffd700,format=rgba,colorkey=0x000000:0.15:0.1[wv];"
                      f"[{last}][wv]overlay=0:{round(size[1] * 0.56)}:format=auto[bgw]")
            last = "bgw"
        else:
            chain += f";{audio}[a]"
        audio_map = ["-map", "[a]"]
    else:
        inputs += ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]
        audio_map = ["-map", f"{n}:a"]
    chain += f";[{last}]ass={ass.resolve()}:fontsdir={FONTS_DIR}:shaping=complex,{fade},format=yuv420p[v]"
    _run(["ffmpeg", "-y", *inputs, "-t", str(duration), "-filter_complex", chain, "-map", "[v]", *audio_map,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-r", str(FPS), "-c:a", "aac", "-ar", "44100", "-b:a", "160k", "-shortest", str(out)], timeout=240)
    return out, duration


def make_cover(title: str, size: tuple[int, int], logo: Path | None, work: Path) -> Path:
    width, height = size
    unit = min(width, height) / 1080
    ass = work / "cover.ass"
    body = "\\N".join(title.split("\n"))
    ass.write_text(f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cover,{FONT_BLACK},{round(130 * unit)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,{round(7 * unit)},2,5,90,90,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:05.00,Cover,,0,0,0,,{{\\pos({width // 2},{round(height * 0.42)})}}{body}
""", encoding="utf-8")
    out = work / "cover.jpg"
    inputs = ["-f", "lavfi", "-i", f"color=c={PALETTES[1]}:s={width}x{height}:r=1"]
    chain = "[0:v]null[bg]"
    last = "bg"
    if logo is not None:
        inputs += ["-i", str(logo)]
        side = round(min(size) * 0.2)
        chain += f";[1:v]scale={side}:{side}:force_original_aspect_ratio=decrease,format=rgba[lg];[bg][lg]overlay=(W-w)/2:H*0.74:format=auto[bgl]"
        last = "bgl"
    chain += f";[{last}]ass={ass.resolve()}:fontsdir={FONTS_DIR}:shaping=complex[v]"
    _run(["ffmpeg", "-y", *inputs, "-filter_complex", chain, "-map", "[v]", "-frames:v", "1", "-q:v", "2", str(out)], timeout=60)
    return out


def validate(path: Path, expected_duration: float, size: tuple[int, int], need_audio: bool = True) -> dict:
    info = probe(path)
    problems = []
    if (info["width"], info["height"]) != size:
        problems.append("ابعاد ویدیو درست نیست")
    if abs(info["fps"] - FPS) > 0.5:
        problems.append("نرخ فریم درست نیست")
    if abs(info["duration"] - expected_duration) > 1.0:
        problems.append("مدت ویدیو با برنامه فاصله دارد")
    if need_audio and not info["has_audio"]:
        problems.append("ویدیو صدا ندارد")
    decode = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"], capture_output=True, text=True, timeout=180)
    if decode.returncode != 0 or decode.stderr.strip():
        problems.append("فایل خروجی کامل خوانده نمی‌شود")
    if problems:
        raise VideoError("؛ ".join(problems))
    return info


def render(scenario: dict, settings: dict, clips: list[Path], logo: Path | None, work: Path, audio_cache: Path, narrate_fn=narrate) -> dict:
    """Render scenario to work/final.mp4 with narration, subtitles, poster and cover; returns validation info."""
    work = work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    size = FORMATS[settings["format"]]
    if STYLE_CATALOG[settings["style"]]["clips"] > len(clips):
        settings = {**settings, "style": "typography"}
    parts, total = [], 0.0
    for i, scene in enumerate(scenario["scenes"]):
        narration = narrate_fn(scene["narration"], settings["voice"], settings["speed"], audio_cache.resolve()) if scene["narration"] else None
        part, duration = _render_scene(i, scene, narration, settings, size, clips, logo, work, len(scenario['scenes']))
        parts.append(part)
        total += duration
    listing = work / "list.txt"
    listing.write_text("".join(f"file '{p}'\n" for p in parts))
    final = work / "final.mp4"
    _run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(final)])
    info = validate(final, total, size)
    _run(["ffmpeg", "-y", "-ss", "0.8", "-i", str(final), "-frames:v", "1", "-q:v", "3", str(work / "poster.jpg")], timeout=60)
    make_cover(settings["cover_title"] or scenario["title"] or scenario["scenes"][0]["text"], size, logo, work)
    return info


def style_preview(style: str, cache_dir: Path) -> Path:
    """One frame of a sample scene rendered in the given style, so the user can choose by eye; cached on disk."""
    if style not in STYLE_CATALOG:
        raise VideoError("سبک پیدا نشد")
    cache_dir.mkdir(parents=True, exist_ok=True)
    out = cache_dir / f"style_{style}.jpg"
    if out.exists():
        return out
    work = cache_dir / f"_work_{style}"
    work.mkdir(exist_ok=True)
    try:
        clip, tone = cache_dir / "sample_clip.mp4", cache_dir / "sample_tone.mp3"
        if not clip.exists():
            _run(["ffmpeg", "-y", "-f", "lavfi", "-i", "gradients=s=640x360:d=4:c0=0x0ea5e9:c1=0xf97316:speed=0.03,format=yuv420p", str(clip)], timeout=60)
        if not tone.exists():
            _run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=180:duration=3", "-af", "tremolo=f=4:d=0.9", "-q:a", "5", str(tone)], timeout=30)
        words = "این یک زیرنویس نمونه است".split()
        narration = {"path": tone, "duration": 2.5, "words": [{"w": w, "start": i * 0.5, "end": i * 0.5 + 0.45} for i, w in enumerate(words)]}
        scene = {"kind": "body", "title": "", "text": "نمونه‌ی متن\nروی ویدیو", "highlight": "متن", "narration": "x", "duration": 3, "asset": None}
        settings = {**DEFAULT_SETTINGS, "style": style, "format": "9:16"}
        clips = [clip, clip] if STYLE_CATALOG[style]["clips"] else []
        part, _ = _render_scene(1, scene, narration, settings, (540, 960), clips, None, work, 4)
        _run(["ffmpeg", "-y", "-ss", "1.2", "-i", str(part), "-frames:v", "1", "-q:v", "4", str(out)], timeout=30)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return out
