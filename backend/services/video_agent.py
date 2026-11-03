"""Agentic video renderer.

Like a coding agent, the model writes the video itself: one HTML/CSS/JS composition that is a pure function of time.
A headless Chromium captures it frame by frame, the model looks at sample frames and fixes what is wrong,
and FFmpeg muxes the final frames with the narration.
"""
import base64
import html as htmllib
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from contextvars import ContextVar
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from typing import Callable

import httpx

from lib.ai.analyze_lead import _base_urls
from services import credits, video_maker as vm

logger = logging.getLogger(__name__)

MAX_ROUNDS = 2  # patch rounds after the first draft; each round costs a few hundred output tokens
REVIEW_FRAMES = 6
LEAD = 0.15  # seconds of silence before the narrator starts inside a scene
TAIL = 0.5
FONTS = {"Yekan Bakh FaNum": ("YekanBakhFaNum-Bold.ttf", 700), "Yekan Bakh FaNum Black": ("YekanBakhFaNum-Black.ttf", 900)}

RUNTIME_JS = r"""
window.PG = {
  clamp: (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)),
  lerp: (a, b, k) => a + (b - a) * k,
  progress: (t, a, b) => Math.min(1, Math.max(0, (t - a) / Math.max(b - a, 1e-6))),
  ease: {
    out: (k) => 1 - Math.pow(1 - k, 3),
    inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
    back: (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  },
  sceneAt: (t) => { const s = VIDEO.scenes; for (let i = 0; i < s.length; i++) if (t < s[i].end) return s[i]; return s[s.length - 1]; },
  activeWord: (scene, t) => { let idx = -1; scene.words.forEach((w, i) => { if (t >= w.start) idx = i; }); return idx; },
  // Show frame of the user's clip i at time t (clips loop). Await it inside seek().
  clip: async (img, i, t) => {
    const c = VIDEO.clips[i]; if (!c) return;
    const frame = Math.min(c.frames, Math.floor((t % c.loop) * VIDEO.fps) + 1);
    const src = "clips/c" + i + "/" + String(frame).padStart(5, "0") + ".jpg";
    if (img.getAttribute("src") !== src) { img.src = src; try { await img.decode(); } catch (e) {} }
  },
};
"""

SYSTEM_PROMPT = """You are the motion designer of PixelGenius Video Maker. You build short social videos (reels) for Persian-speaking businesses by writing a single HTML file.
A headless Chromium renders it frame by frame, FFmpeg adds the narration. Your output is judged on how a top motion-design studio's reel would look: bold, polished, modern, with real motion.

# Contract (strict, the renderer depends on it)
- Reply with ONE complete HTML document in a ```html fenced block and nothing else important outside it.
- The page is exactly WIDTH x HEIGHT px (given below). `html, body {margin:0; width:WIDTH; height:HEIGHT; overflow:hidden}`.
- Include `<script src="data.js"></script>` and `<script src="pg.js"></script>` before your own script. `data.js` defines `window.VIDEO`:
  {width, height, fps, duration, format, style, brand, cta, subtitle_mode, subtitle_pos, logo (path or null; PNG/JPG/WebP/SVG), logo_svg (sanitized SVG markup when the logo is an SVG, else null), cover_title,
   scenes: [{index, kind: hook|body|cta, title, text (headline, may contain \\n), highlight (word inside text), narration, visual (storyboard sentence from the scriptwriter: build exactly this image/motion for the scene), start, end, asset (clip index or null),
             words: [{w, start, end}] // absolute seconds of every narrated word}],
   clips: [{index, name, frames, loop, w, h}]}
  All text and timing MUST be read from VIDEO so edits to the script never need a new design. Never hardcode the user's copy.
- Define `window.seek = async (t) => {...}` : it must put the page in the exact visual state for time t seconds. The harness calls it once per frame (t = frame / fps), then screenshots.
  Everything is a pure function of t: no setTimeout/setInterval/requestAnimationFrame, no free-running CSS animations or transitions, no Math.random() without a fixed seed (use a seeded PRNG), no Date.now().
- Helpers in `window.PG`: clamp, lerp, progress(t,a,b), ease.out/inOut/back(k), sceneAt(t), activeWord(scene,t), and `await PG.clip(imgEl, clipIndex, t)` which shows the user's clip frame (never use <video>: it cannot be seeked reliably). Use `object-fit: cover`.
- The user's logo, if any, is at `VIDEO.logo` (an image path). When `VIDEO.logo_svg` is set, inline that markup (innerHTML) instead of using <img>: then you can recolour it (fill/stroke via CSS, `currentColor`), animate its paths (stroke-dashoffset draw-on, staggered reveal of parts) and fit it to the palette. Fonts are loaded for you in `fonts.css` ( `<link rel="stylesheet" href="fonts.css">` ): use `font-family: "Yekan Bakh FaNum"` (700) and `"Yekan Bakh FaNum Black"` (900) for ALL text. They contain Persian letters and digits.
- No network access: no CDN, no external images or fonts, no libraries. Everything is plain HTML/CSS/SVG/canvas and your own JS.
- Code economy (every token you write is billed): no code comments, no decorative whitespace or indentation, short identifiers, shared CSS classes and CSS variables instead of repeated inline styles, data-driven loops and small helper functions instead of copy-pasted blocks per scene or per word. Keep the whole file under about 450 lines; richness comes from motion and layering, not from volume of code.
- Do not add audio. The narration is mixed in by the harness. Total duration = VIDEO.duration; the scene timings are authoritative, never invent your own.

# Craft
- Text is Persian: `direction: rtl`, right-aligned or centred, never letter-spacing. Keep every headline inside the safe area (10% margins; for 9:16 keep the lowest 14% and top 8% free of key text, they are covered by app UI).
- Headlines are huge and legible (at least ~8% of the short side), strong contrast, maximum two accents colours, consistent palette across scenes. Use a dark, premium base unless the art direction says otherwise. Brand purple is #7c3aed, accent amber #f59e0b, ink #1e1b2e.
- Motion: every element enters and exits with eased motion (staggered words, masks, scale/slide, line draws, counters). Scenes connect with a transition (wipe, push, zoom, shape morph) instead of hard cuts. Something is always gently moving (slow zoom, parallax, floating shapes), but never distracts from the headline.
- Subtitles: follow `subtitle_mode`: "word" = the spoken words appear/highlight one by one in sync with `words[].start/end`; "sentence" = whole narration line at once. Position by `subtitle_pos` (top|middle|bottom). The `highlight` word is emphasised in the amber accent.
- The hook scene must grab attention in the first second. The cta scene shows the brand and the call to action large, with the logo if available.
- Follow the requested art direction (style). Clip styles use the user's clip frames as full-bleed or framed media with the animated overlay above them.
- Make it rich: backgrounds with depth (gradients are fine in videos, soft shapes, grids, grain made with SVG), icons drawn with inline SVG. Avoid empty, flat, or template-looking slides.

# Motion-design rules (the difference between a template and a studio piece)
- Before any code, write a short director's brief inside <brief>...</brief> (max 150 words): reference style, palette (3 colours max + neutrals), type scale, per-scene layers, and how every scene hands off to the next. Then the HTML.
- Motion is closed-form and time-driven: springs/eased curves computed from t, staggered by index, never everything moving at once. Vary easing and duration per element; uniform fade-ins and everything-centred layouts read as generic AI output, avoid them.
- Text reveals are masked and word by word (overflow-hidden lines, words rising or sliding into place), with the highlight word getting its own emphasis moment (underline draw, colour flood, scale pop).
- Hand scenes off with shared elements (a shape or colour grows into the next scene's background, a line becomes the next underline) or a colour flood that clears the whole frame. Never a plain crossfade between unrelated slides.
- Keep one hero per moment, strong hierarchy (hero 100%, support 35-45%, decoration 10-20% opacity), generous negative space, and land each key visual on the narration word it belongs to (use `words[].start`).
- Texture beats flatness: SVG noise grain, soft vignettes, subtle parallax between 2-3 depth layers, slow camera drift (scale 1.0 to 1.06 over the scene).
- Be honest: invented numbers or charts must not appear. Only use facts present in the script; if you illustrate with sample data, label it «نمونه».
- A first-second punch: the hook's headline is visible and moving within 0.3s.

# Process
You will be shown sample frames of your own render. Judge them honestly like an art director: overflowing or clipped text, overlaps, low contrast, empty areas, broken Persian shaping, unreadable subtitles, missing clips, weak hierarchy. If everything is excellent reply exactly `OK`. Otherwise reply with the complete corrected HTML again in a ```html fence."""

STYLE_DIRECTION = {
    "cinematic": "Cinematic gold: near-black stage with warm smoke (blurred radial gradients), gold dust particles that gather into the headline, slow dolly-like zoom, spotlit type with a soft gold glow, letterboxed feel. Serif-like weight from Black font, restrained, premium.",
    "one_take": "One continuous take: the whole video is ONE large canvas (a long strip or a layered world) and a virtual camera glides, pans and zooms between scenes with eased paths, never cutting. Each scene is a place on that canvas; elements overlap across scene boundaries. Camera motion is keyed smoothly (e.g. interpolate position and log-scale).",
    "collage": "Paper collage on a desk: warm paper texture (SVG noise), torn-edge paper pieces (clip-path polygons), halftone dot patterns, tape strips, cut-out shapes and stickers pinned at slight rotations, scenes that hard-cut with a paper slam. Hand-made, editorial, a little chaotic but readable.",
    "cartoon": "Animated vector illustration: bold flat shapes with thick outlines, a simple friendly character or mascot built from SVG (blinking eyes, bouncing, arm gestures timed to the narration), props that pop in with squash and stretch, floating doodle background. Playful, colourful but a coherent palette.",
    "poster": "Halftone print poster: old-paper or deep navy base, giant serif-weight type with a misregistered colour offset (duplicate text in a second colour shifted 6-10px), gradient halftone dot fields (radial-gradient patterns), rubber-stamp slams with slight rotation and overshoot, sticker labels.",
    "typography": "Kinetic typography: huge words slamming in, bold type as the hero, minimal decoration.",
    "shapes": "Animated geometric shapes (circles, rings, blobs) drifting behind the type; brand-like and modern.",
    "particles": "Soft glowing particles rising slowly, calm professional atmosphere, elegant type.",
    "waveform": "A live audio waveform driven by the narration timing under the headline (synthesise a believable waveform from the word timings); suited to educational/audio content.",
    "steps": "Step/diagram language: a progress indicator of the scenes at the top, numbered steps, connecting lines drawn as they appear.",
    "clips": "The user's own clips full-bleed behind the type, with dark gradient scrims for legibility; punchy cuts and zooms.",
    "phone": "The user's clip/screen recording inside a realistic phone frame (draw the frame in CSS/SVG), tilting and floating, with callouts around it.",
    "before_after": "Two clips compared with an animated split/wipe reveal and BEFORE/AFTER labels (قبل / بعد).",
}


class AgentError(vm.VideoError):
    pass


class AgentStop(AgentError):
    """Spending must stop now (budget or provider quota); never retried or recovered from."""


_SAMPLE_LOOK = {  # (background css, headline css, decoration html) per agent-only style; static stand-ins for the picker
    "cinematic": ("radial-gradient(circle at 50% 40%, #3a2a0a 0%, #0b0907 65%)", "color:#f5d98a;text-shadow:0 0 40px #d4a017aa", '<i style="position:absolute;inset:0;background:radial-gradient(circle at 20% 30%,#ffd70033 0 2px,transparent 3px) 0 0/90px 90px"></i>'),
    "one_take": ("linear-gradient(120deg,#12202b 0%,#1e1b2e 55%,#241b3a 100%)", "color:#fff", '<i style="position:absolute;left:-10%;right:-10%;top:62%;height:6px;background:#7c3aed;transform:rotate(-8deg)"></i><i style="position:absolute;left:10%;top:18%;width:160px;height:160px;border:6px solid #f59e0b;border-radius:50%"></i>'),
    "collage": ("#e9dfc9", "color:#1e1b2e;background:#fff;padding:10px 24px;transform:rotate(-3deg);box-shadow:8px 8px 0 #1e1b2e", '<i style="position:absolute;right:8%;top:12%;width:150px;height:190px;background:#f59e0b;transform:rotate(8deg);clip-path:polygon(0 4%,100% 0,96% 100%,3% 96%)"></i><i style="position:absolute;left:6%;bottom:14%;width:200px;height:120px;background:radial-gradient(#1e1b2e 22%,transparent 24%) 0 0/16px 16px;transform:rotate(-6deg)"></i>'),
    "cartoon": ("#7c3aed", "color:#fff;-webkit-text-stroke:3px #1e1b2e;paint-order:stroke fill", '<i style="position:absolute;left:50%;bottom:10%;margin-left:-70px;width:140px;height:140px;border-radius:50%;background:#f59e0b;border:6px solid #1e1b2e"></i><i style="position:absolute;right:10%;top:12%;width:90px;height:90px;border-radius:24px;background:#fff;border:6px solid #1e1b2e;transform:rotate(12deg)"></i>'),
    "poster": ("#f2e8d5", "color:#1e1b2e;text-shadow:8px 6px 0 #7c3aedcc", '<i style="position:absolute;inset:0;background:radial-gradient(#1e1b2e22 28%,transparent 30%) 0 0/18px 18px"></i><i style="position:absolute;right:8%;bottom:12%;border:6px solid #b91c1c;color:#b91c1c;padding:6px 18px;font-size:40px;transform:rotate(-10deg)">جدید</i>'),
}


def style_preview(style: str, cache_dir: Path) -> Path:
    """Static stand-in frame for the style picker; the real video is designed by the agent, so this only conveys the look."""
    if style not in _SAMPLE_LOOK:
        raise vm.VideoError("سبک پیدا نشد")
    out = cache_dir / f"style_{style}.jpg"
    if out.exists():
        return out
    cache_dir.mkdir(parents=True, exist_ok=True)
    background, headline, decoration = _SAMPLE_LOOK[style]
    with tempfile.TemporaryDirectory() as tmp:
        comp = Path(tmp)
        (comp / "fonts").mkdir()
        css = ""
        for family, (file, weight) in FONTS.items():
            shutil.copy(vm.FONTS_DIR / file, comp / "fonts" / file)
            css += f'@font-face{{font-family:"{family}";src:url("fonts/{file}") format("truetype");font-weight:{weight};}}\n'
        (comp / "fonts.css").write_text(css)
        (comp / "index.html").write_text(
            f'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>html,body{{margin:0;width:540px;height:960px;overflow:hidden;background:{background};'
            f'font-family:"Yekan Bakh FaNum Black";direction:rtl}}#h{{position:absolute;top:38%;width:100%;text-align:center;font-size:70px;line-height:1.3}}'
            f'#h span{{display:inline-block;{headline}}}</style></head><body>{decoration}<div id="h"><span>نمونه‌ی متن<br>روی ویدیو</span></div>'
            f'<script>window.seek=async()=>{{}}</script></body></html>', encoding="utf-8")
        with _Page(comp, (540, 960)) as page:
            page.shot(0, out, quality=85)
    return out


def _chromium():
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:  # pragma: no cover
        raise AgentError("موتور رندر ویدیو نصب نیست") from exc
    return sync_playwright


# --- model calls -----------------------------------------------------------------------------------

MAX_RENDER_USD = float(os.getenv("VIDEO_MAX_USD", "2.0"))  # hard cap on provider spend for one build
QUOTA_MESSAGE = "سرویس هوش مصنوعی موقتاً در دسترس نیست، کمی بعد دوباره تلاش کنید"
_spend: ContextVar[dict | None] = ContextVar("video_agent_spend", default=None)
_quota_probe = {"at": 0.0, "ok": True}


def _record_spend(model: str, usage: dict | None) -> None:
    tally = _spend.get()
    if tally is None or not usage:
        return
    tokens_in, tokens_out = usage.get("prompt_tokens") or 0, usage.get("completion_tokens") or 0
    price_in, price_out = next((v for k, v in credits.MODEL_USD_PER_MTOK.items() if k in model.lower()), credits.DEFAULT_USD_PER_MTOK)
    tally["usd"] += (tokens_in * price_in + tokens_out * price_out) / 1_000_000
    tally["in"] += tokens_in
    tally["out"] += tokens_out


def _check_budget() -> None:
    tally = _spend.get()
    if tally is not None and tally["usd"] >= MAX_RENDER_USD:
        logger.error("Video agent stopped: spent $%.2f (cap $%.2f)", tally["usd"], MAX_RENDER_USD)
        raise AgentStop("ساخت این ویدیو بیش از حد طول کشید و متوقف شد، کردیتت برگشت؛ دوباره تلاش کن")


def check_quota() -> bool:
    """Cheap one-token probe so a paid action is refused before charging when the provider account is out of credit. Unknown errors do not block."""
    if time.time() - _quota_probe["at"] < 60:
        return _quota_probe["ok"]
    api_key = os.getenv("GAPGPT_API_KEY", "")
    ok = True
    for base_url in _base_urls():
        try:
            response = httpx.post(f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, timeout=20,
                                  json={"model": vm.SONNET_MODEL, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1})
        except httpx.HTTPError:
            continue
        ok = not (response.status_code == 403 and "insufficient_user_quota" in response.text)
        break
    _quota_probe.update(at=time.time(), ok=ok)
    return ok



def _compact(html: str) -> str:
    """Lossless-enough shrink of what is sent back and forth: HTML comments, indentation and blank lines carry no meaning."""
    html = re.sub(r"<!--(?!\[).*?-->", "", html, flags=re.S)
    return "\n".join(line.strip() for line in html.splitlines() if line.strip())


def _extract_html(text: str) -> str | None:
    match = re.search(r"```html\s*(.*?)```", text, re.S) or re.search(r"(<!doctype html.*</html>)", text, re.S | re.I)
    html = match.group(1).strip() if match else ""
    return html if "<html" in html.lower() and "seek" in html else None


# --- cheap review: patches instead of rewrites, and a library of finished compositions --------------

REVIEW_SYSTEM = SYSTEM_PROMPT + """

# Review and patch mode
You receive the current composition and frames rendered from it. Do NOT rewrite the file.
Reply `OK` alone if the video is excellent and there were no errors. Otherwise reply only with SEARCH/REPLACE blocks that fix what is wrong, in exactly this format:
<<<<<<< SEARCH
exact text copied from the file (unique in it, as short as possible)
=======
replacement text
>>>>>>> REPLACE
At most 8 blocks, no explanations, no other text."""

_PATCH = re.compile(r"<<<<<<< SEARCH\r?\n(.*?)\r?\n=======\r?\n(.*?)\r?\n>>>>>>> REPLACE", re.S)
REUSE = os.getenv("VIDEO_REUSE", "1") != "0"
LIBRARY = Path(os.getenv("UPLOADS_DIR", "/app/uploads")) / "video" / "_library"


def _apply_patches(html: str, reply: str) -> tuple[str, int]:
    applied = 0
    for old, new in _PATCH.findall(reply):
        if old and html.count(old) == 1:
            html, applied = html.replace(old, new, 1), applied + 1
    return (html, applied) if "<html" in html.lower() and "seek" in html else (html, 0)


def _fingerprint(scenario: dict, settings: dict, size: tuple[int, int], clips: int) -> dict:
    return {"style": settings["style"], "format": settings["format"], "scenes": len(scenario["scenes"]), "clips": min(clips, 1), "size": list(size),
            "seconds": round(sum(sc.get("duration", 0) for sc in scenario["scenes"]), 1)}


def _library_pick(finger: dict) -> str | None:
    """Nearest finished composition for the same style and format and the same scene structure; the vector is (scenes, clips, seconds)."""
    best, best_score = None, None
    for meta_file in LIBRARY.glob("*.json") if LIBRARY.exists() else []:
        try:
            meta = json.loads(meta_file.read_text(encoding="utf-8"))
        except ValueError:
            continue
        if any(meta.get(k) != finger[k] for k in ("style", "format", "scenes", "clips")):
            continue
        score = abs(meta.get("seconds", 0) - finger["seconds"])
        if best_score is None or score < best_score:
            html_file = meta_file.with_suffix(".html")
            if html_file.exists():
                best, best_score = html_file, score
    return best.read_text(encoding="utf-8") if best else None


def _library_save(html: str, finger: dict, scenario: dict, info: dict | None) -> None:
    """Keep a finished design for later videos, unless it carries this customer's own words."""
    words = [str(v) for sc in scenario["scenes"] for v in (sc.get("narration"), sc.get("text"), sc.get("title")) if v]
    words += [str(v) for v in ((info or {}).get("brand"), (info or {}).get("cta"), scenario.get("title")) if v]
    if any(len(w.strip()) >= 4 and w.strip() in html for w in words):
        return
    LIBRARY.mkdir(parents=True, exist_ok=True)
    key = f"{finger['style']}_{finger['format'].replace(':', 'x')}_{finger['scenes']}_{finger['clips']}"
    (LIBRARY / f"{key}.html").write_text(html, encoding="utf-8")
    (LIBRARY / f"{key}.json").write_text(json.dumps(finger), encoding="utf-8")



def _ask_html(messages: list[dict], system: str, models: list[str] | None = None, max_tokens: int = 24000) -> str:
    """One model turn; returns raw text. Falls through the configured models and gateways."""
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        raise AgentError("کلید هوش مصنوعی تنظیم نشده است")
    for model in dict.fromkeys(models or vm.AI_MODELS):
        payload = {"model": model, "messages": [{"role": "system", "content": system}, *messages], "temperature": 0.8, "max_tokens": max_tokens, "stream": True,
                   "reasoning": {"effort": "low"}}  # hidden reasoning otherwise eats the whole token budget and leaves no HTML
        for base_url in _base_urls():
            _check_budget()
            try:
                # streamed: a full composition takes minutes and gateways drop silent long-running responses
                parts: list[str] = []
                finish, stray, usage = None, [], None
                started = time.time()
                with httpx.Client(timeout=httpx.Timeout(600, connect=20)) as client:
                    with client.stream("POST", f"{base_url}/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json=payload) as response:
                        if response.status_code == 403 and "insufficient_user_quota" in response.read().decode("utf-8", "ignore"):
                            _quota_probe.update(at=time.time(), ok=False)
                            raise AgentStop(QUOTA_MESSAGE)
                        response.raise_for_status()
                        for line in response.iter_lines():
                            if not line.startswith("data:"):
                                if line.strip() and not line.startswith(":"):
                                    stray.append(line[:300])
                                continue
                            if line.strip() == "data: [DONE]":
                                continue
                            event = json.loads(line[5:])
                            choices = event.get("choices") or [{}]
                            parts.append((choices[0].get("delta") or {}).get("content") or "")
                            finish = choices[0].get("finish_reason") or finish
                            if event.get("usage"):
                                usage = event["usage"]
                            if event.get("error"):
                                stray.append(str(event["error"])[:300])
                _record_spend(model, usage)
                logger.info("AI call %s: %.0fs, %s in / %s out tokens, finish=%s, %d chars, ~$%.3f so far", model, time.time() - started,
                            (usage or {}).get("prompt_tokens"), (usage or {}).get("completion_tokens"), finish, sum(len(x) for x in parts), (_spend.get() or {}).get("usd", 0))
                if "".join(parts).strip():
                    return "".join(parts)
                logger.warning("Video agent call to %s via %s returned no text (finish=%s, %s)", model, base_url, finish, stray[:2])
                if finish == "length":  # the whole budget went to hidden reasoning; another gateway would burn the same
                    raise AgentError("طراحی ویدیو زمان زیادی برد و ناتمام ماند، دوباره تلاش کنید")
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
                logger.warning("Video agent call to %s failed via %s: %s", model, base_url, exc)
    raise AgentError("ارتباط با دستیار طراحی برقرار نشد، دوباره تلاش کنید")


def _image_part(path: Path) -> dict:
    return {"type": "image_url", "image_url": {"url": "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode("ascii")}}


# --- workspace -------------------------------------------------------------------------------------

def _timeline(scenario: dict, settings: dict, narrations: list[dict | None]) -> tuple[list[dict], float]:
    scenes, cursor = [], 0.0
    for i, (scene, narration) in enumerate(zip(scenario["scenes"], narrations)):
        duration = max(round(narration["duration"] + LEAD + TAIL, 2) if narration else scene["duration"], vm.MIN_SCENE)
        words = [{"w": w["w"], "start": round(cursor + LEAD + w["start"], 3), "end": round(cursor + LEAD + w["end"], 3)} for w in (narration["words"] if narration else [])]
        scenes.append({"index": i, "kind": scene["kind"], "title": scene["title"], "text": scene["text"], "highlight": scene.get("highlight", ""),
                       "narration": scene["narration"], "visual": scene.get("visual", ""), "start": round(cursor, 3), "end": round(cursor + duration, 3), "asset": scene.get("asset"), "words": words})
        cursor += duration
    return scenes, round(cursor, 3)


def _extract_clip_frames(clips: list[Path], comp: Path, total: float, size: tuple[int, int]) -> list[dict]:
    info = []
    for i, clip in enumerate(clips):
        out = comp / "clips" / f"c{i}"
        out.mkdir(parents=True, exist_ok=True)
        meta = vm.probe(clip)
        loop = max(0.5, min(meta["duration"] or total, total))
        vm._run(["ffmpeg", "-y", "-i", str(clip), "-t", f"{loop:.2f}", "-vf", f"fps={vm.FPS},scale={max(size)}:{max(size)}:force_original_aspect_ratio=decrease",
                 "-q:v", "4", str(out / "%05d.jpg")], timeout=300)
        frames = len(list(out.glob("*.jpg")))
        info.append({"index": i, "name": clip.name, "frames": frames, "loop": round(frames / vm.FPS, 3), "w": meta["width"], "h": meta["height"]})
    return info


def _prepare(comp: Path, scenario: dict, settings: dict, scenes: list[dict], total: float, clips: list[Path], logo: Path | None, size: tuple[int, int]) -> dict:
    comp.mkdir(parents=True, exist_ok=True)
    (comp / "fonts").mkdir(exist_ok=True)
    css = ""
    for family, (file, weight) in FONTS.items():
        shutil.copy(vm.FONTS_DIR / file, comp / "fonts" / file)
        css += f'@font-face{{font-family:"{family}";src:url("fonts/{file}") format("truetype");font-weight:{weight};}}\n'
    (comp / "fonts.css").write_text(css)
    (comp / "pg.js").write_text(RUNTIME_JS)
    logo_rel, logo_svg = None, None
    if logo is not None:
        logo_rel = "logo" + logo.suffix.lower()
        shutil.copy(logo, comp / logo_rel)
        if logo.suffix.lower() == ".svg":
            markup = logo.read_text(encoding="utf-8", errors="ignore")
            logo_svg = markup if len(markup) <= 40_000 else None
    data = {
        "width": size[0], "height": size[1], "fps": vm.FPS, "duration": total, "format": settings["format"], "style": settings["style"],
        "brand": "", "cta": "", "subtitle_mode": settings["subtitle_mode"], "subtitle_pos": settings["subtitle_pos"], "logo": logo_rel, "logo_svg": logo_svg,
        "cover_title": settings.get("cover_title") or scenario.get("title", ""), "scenes": scenes,
        "clips": _extract_clip_frames(clips, comp, total, size),
    }
    return data


def _write_data(comp: Path, data: dict) -> None:
    (comp / "data.js").write_text("window.VIDEO = " + json.dumps(data, ensure_ascii=False) + ";")


# --- capture ---------------------------------------------------------------------------------------

class _Page:
    """Chromium page over the composition; network is blocked so generated code can only touch its own folder."""

    def __init__(self, comp: Path, size: tuple[int, int], scale: float = 1.0):
        self.comp, self.size, self.scale = comp.resolve(), size, scale
        self.errors: list[str] = []

    def __enter__(self):
        self._pw = _chromium()().start()
        self._browser = self._pw.chromium.launch(executable_path=os.getenv("CHROMIUM_PATH") or None, args=["--font-render-hinting=none", "--disable-gpu", "--no-sandbox"])
        context = self._browser.new_context(viewport={"width": self.size[0], "height": self.size[1]}, device_scale_factor=self.scale)
        root = self.comp.as_uri()
        context.route("**/*", lambda route: route.continue_() if route.request.url.startswith(root) else route.abort())
        self.page = context.new_page()
        self.page.on("pageerror", lambda exc: self.errors.append(f"JS error: {exc}"))
        self.page.on("console", lambda msg: self.errors.append(f"console.{msg.type}: {msg.text}") if msg.type == "error" else None)
        self.page.on("requestfailed", lambda req: self.errors.append(f"failed to load {req.url.replace(root, '')}") if req.url.startswith(root) else None)
        self.page.goto((self.comp / "index.html").as_uri(), wait_until="load")
        self.page.evaluate("document.fonts.ready.then(() => true)")
        if not self.page.evaluate("typeof window.seek === 'function'"):
            raise AgentError("composition has no window.seek")
        return self

    def __exit__(self, *exc):
        for closer in (self._browser.close, self._pw.stop):
            try:
                closer()
            except Exception:  # pragma: no cover
                pass

    def shot(self, t: float, path: Path | None = None, quality: int = 90) -> bytes:
        self.page.evaluate("t => window.seek(t)", t)
        return self.page.screenshot(type="jpeg", quality=quality, path=str(path) if path else None)


def _review_times(scenes: list[dict]) -> list[float]:
    picks = [(s["start"] + s["end"]) / 2 for s in scenes]
    if len(picks) > REVIEW_FRAMES:
        step = len(picks) / REVIEW_FRAMES
        picks = [picks[int(i * step)] for i in range(REVIEW_FRAMES)]
    first = scenes[0]
    picks[0] = first["start"] + min(1.0, (first["end"] - first["start"]) / 2)
    return [round(t, 2) for t in picks]


def _sample(comp: Path, size: tuple[int, int], times: list[float]) -> tuple[list[Path], list[str]]:
    frames = []
    with _Page(comp, size, scale=0.4) as page:
        for i, t in enumerate(times):
            path = comp / f"review{i}.jpg"
            page.shot(t, path, quality=80)
            frames.append(path)
        return frames, page.errors[:8]


def _mux(comp: Path, size: tuple[int, int], total: float, audio: Path, out: Path) -> None:
    frames_total = round(total * vm.FPS)
    cmd = ["ffmpeg", "-y", "-f", "image2pipe", "-framerate", str(vm.FPS), "-c:v", "mjpeg", "-i", "-", "-i", str(audio),
           "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", str(vm.FPS),
           "-c:a", "aac", "-ar", "44100", "-b:a", "192k", "-t", f"{total:.3f}", "-movflags", "+faststart", str(out)]
    ffmpeg = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        with _Page(comp, size) as page:
            for n in range(frames_total):
                ffmpeg.stdin.write(page.shot(n / vm.FPS, quality=92))
        ffmpeg.stdin.close()
        error = ffmpeg.stderr.read().decode("utf-8", "replace")
        if ffmpeg.wait() != 0:
            logger.error("ffmpeg mux failed: %s", error[-2000:])
            raise AgentError("ساخت فایل ویدیو ناموفق بود")
    except BrokenPipeError as exc:
        raise AgentError("ساخت فایل ویدیو ناموفق بود") from exc
    finally:
        if ffmpeg.poll() is None:
            ffmpeg.kill()


def _audio_track(scenes: list[dict], narrations: list[dict | None], work: Path) -> Path:
    parts = []
    for scene, narration in zip(scenes, narrations):
        part = work / f"audio{scene['index']}.m4a"
        duration = scene["end"] - scene["start"]
        if narration:
            vm._run(["ffmpeg", "-y", "-i", str(narration["path"]), "-af", f"adelay={int(LEAD * 1000)}|{int(LEAD * 1000)},apad,aresample=44100", "-t", f"{duration:.3f}",
                     "-ac", "2", "-c:a", "aac", "-b:a", "192k", str(part)], timeout=120)
        else:
            vm._run(["ffmpeg", "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", f"{duration:.3f}", "-c:a", "aac", str(part)], timeout=60)
        parts.append(part)
    listing = work / "audio.txt"
    listing.write_text("".join(f"file '{p.resolve()}'\n" for p in parts))
    track = work / "narration.m4a"
    vm._run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", str(track)], timeout=120)
    return track


# --- orchestration ---------------------------------------------------------------------------------

def _brief(scenario: dict, settings: dict, size: tuple[int, int], data: dict) -> str:
    style = vm.STYLE_CATALOG[settings["style"]]
    return (f"WIDTH={size[0]} HEIGHT={size[1]} ({settings['format']}), duration {data['duration']}s, {len(data['scenes'])} scenes.\n"
            f"Art direction ({settings['style']}): {STYLE_DIRECTION[settings['style']]}\n"
            f"Video title/hook: {scenario.get('title', '')}\nClips available: {len(data['clips'])}\n"
            f"Brand and CTA are in the last scene. Subtitles: mode={settings['subtitle_mode']}, position={settings['subtitle_pos']}.\n"
            f"This is the data.js you will receive (design from it, read it at runtime):\n{json.dumps({k: v for k, v in data.items() if k != 'scenes'}, ensure_ascii=False)}\n"
            f"scenes:\n{json.dumps(data['scenes'], ensure_ascii=False)}")


def build(scenario: dict, settings: dict, clips: list[Path], logo: Path | None, work: Path, audio_cache: Path,
          note: str = "", base_html: str | None = None, info: dict | None = None, cover_file: Path | None = None, narrate_fn: Callable = vm.narrate, ask: Callable = _ask_html) -> dict:
    """Write, review and render the video into work/final.mp4; returns validation info. work/comp/index.html keeps the composition for later edits."""
    work = work.resolve()
    work.mkdir(parents=True, exist_ok=True)
    tally = {"usd": 0.0, "in": 0, "out": 0}
    _spend.set(tally)
    logger.info("Build start: %s, style=%s, format=%s, %d scenes, %d clips, logo=%s", "edit" if base_html else "new video", settings["style"], settings["format"],
                len(scenario["scenes"]), len(clips), (logo.suffix.lower() if logo else "none"))
    size = vm.FORMATS[settings["format"]]
    if vm.STYLE_CATALOG[settings["style"]]["clips"] > len(clips):
        settings = {**settings, "style": "typography"}
    narrations = [narrate_fn(s["narration"], settings["voice"], settings["speed"], audio_cache.resolve()) if s["narration"] else None for s in scenario["scenes"]]
    scenes, total = _timeline(scenario, settings, narrations)
    logger.info("Narration ready: %d/%d scenes voiced, timeline %.1fs", sum(1 for n in narrations if n), len(narrations), total)
    comp = work / "comp"
    data = _prepare(comp, scenario, settings, scenes, total, clips, logo, size)
    data["brand"], data["cta"] = (info or {}).get("brand") or "", (info or {}).get("cta") or ""
    _write_data(comp, data)

    brief = _brief(scenario, settings, size, data)
    times = _review_times(scenes)
    finger = _fingerprint(scenario, settings, size, len(clips))

    def review(html: str) -> str | None:
        """Render frames, let the cheaper model send patches; None when the composition cannot be made to work."""
        for round_no in range(MAX_ROUNDS + 1):
            (comp / "index.html").write_text(html, encoding="utf-8")
            try:
                frames, errors = _sample(comp, size, times)
            except AgentError:
                frames, errors = [], ["The page did not define window.seek as a function."]
            except Exception as exc:
                logger.warning("Sample render failed: %s", exc)
                frames, errors = [], [f"render crashed: {exc}"]
            clean = bool(frames) and not errors
            logger.info("Review round %d: %d frames sampled, %d render errors%s", round_no + 1, len(frames), len(errors), (" (" + "; ".join(errors[:2])[:200] + ")") if errors else "")
            if round_no == MAX_ROUNDS:
                return html if clean else None
            text = (f"{brief}\n\nCurrent composition:\n```html\n{html}\n```\n\nFrames at t = " + ", ".join(f"{t}s" for t in times) + " (in order).\n"
                    + ("Errors captured while rendering:\n" + "\n".join(errors) + "\n" if errors else "No render errors.\n"))
            try:
                reply = ask([{"role": "user", "content": [{"type": "text", "text": text}, *[_image_part(f) for f in frames]]}], REVIEW_SYSTEM, models=vm.REVIEW_MODELS, max_tokens=6000)
            except AgentStop:
                raise
            except AgentError:
                return html if clean else None
            if reply.strip().upper().startswith("OK") and clean:
                logger.info("Review round %d: approved as is", round_no + 1)
                return html
            patched, applied = _apply_patches(html, reply)
            logger.info("Review round %d: %d patch(es) applied of %d sent", round_no + 1, applied, len(_PATCH.findall(reply)))
            if applied:
                html = patched
                continue
            whole = _extract_html(reply)
            if whole:
                logger.info("Review round %d: the model sent a whole new document (%d chars)", round_no + 1, len(whole))
                html = whole
                continue
            if clean:
                return html
            return None
        return None

    def draft() -> str:
        if base_html:
            first = [{"role": "user", "content": f"{brief}\n\nHere is the current composition of this video. Keep its design and apply this change request"
                                                 f" (the data may have changed, make sure everything still reads from VIDEO):\n\nRequest: {note or 'rebuild with the new script'}\n\n```html\n{base_html}\n```"}]
        else:
            first = [{"role": "user", "content": brief + "\n\nWrite the composition now."}]
        messages = list(first)
        extra = {"models": vm.REVIEW_MODELS} if base_html else {}  # only a brand-new design is worth Opus; a failed edit patch is redone by the mid-tier model
        html = _extract_html(ask(messages, SYSTEM_PROMPT, **extra))
        for _ in range(2):
            if html:
                break
            messages.append({"role": "user", "content": "The reply had no valid HTML document with window.seek. Send the complete ```html block."})
            html = _extract_html(ask(messages, SYSTEM_PROMPT, **extra))
        if not html:
            raise AgentError("دستیار طراحی خروجی معتبر نداد، دوباره تلاش کنید")
        return _compact(html)

    base_html = _compact(base_html) if base_html else None
    html = None
    if base_html:  # an edit: the cheaper model tries to apply it as patches first
        try:
            reply = ask([{"role": "user", "content": f"{brief}\n\nCurrent composition:\n```html\n{base_html}\n```\n\nChange request (the data may have changed, everything must still read from VIDEO): {note or 'rebuild with the new script'}"}],
                        REVIEW_SYSTEM.replace("Reply `OK` alone if the video is excellent and there were no errors.", "Reply `OK` alone if no change is needed."), models=vm.REVIEW_MODELS, max_tokens=6000)
            patched, applied = _apply_patches(base_html, reply)
            html = review(patched if applied else base_html) if applied or reply.strip().upper().startswith("OK") else None
        except AgentStop:
            raise
        except AgentError:
            html = None
    elif REUSE and (cached := _library_pick(finger)):
        html = review(cached)
        logger.info("Video agent reused a stored %s composition: %s", finger["style"], "kept" if html else "rejected")
    reused = html is not None
    if html is None:
        logger.info("Drafting a new composition with %s" if not base_html else "Edit could not be patched; rewriting with the mid-tier model", vm.AI_MODELS[0] if not base_html else vm.REVIEW_MODELS[0])
        html = review(draft())
        if html is None:
            raise AgentError("طراحی ویدیو به نتیجه‌ی قابل‌قبول نرسید، دوباره تلاش کنید")
    if not base_html and not reused and REUSE:
        try:
            _library_save(html, finger, scenario, info)
        except OSError:
            logger.warning("Could not store the composition in the library", exc_info=True)

    logger.info("Composition accepted (%d chars); rendering %d frames at %dx%d", len(html), round(total * vm.FPS), size[0], size[1])
    audio = _audio_track(scenes, narrations, work)
    final = work / "final.mp4"
    mux_started = time.time()
    _mux(comp, size, total, audio, final)
    logger.info("Video encoded in %.0fs", time.time() - mux_started)
    result = vm.validate(final, total, size)
    result["ai_cost_usd"] = round(tally["usd"], 3)
    logger.info("Build done: Video agent spend for %s: $%.3f (%d in / %d out tokens)", work.name, tally["usd"], tally["in"], tally["out"])
    vm._run(["ffmpeg", "-y", "-ss", "0.8", "-i", str(final), "-frames:v", "1", "-q:v", "3", str(work / "poster.jpg")], timeout=60)
    if cover_file is not None and cover_file.exists():
        shutil.copy(cover_file, work / "cover.jpg")
    else:
        with _Page(comp, size) as page:
            page.shot(min(1.0, scenes[0]["end"] / 2), work / "cover.jpg", quality=92)
    for leftover in list((comp / "clips").glob("**/*.jpg")):
        leftover.unlink(missing_ok=True)
    return result


# --- AI covers -------------------------------------------------------------------------------------

COVER_MODELS = {
    "gpt-image-2.5-sunburst": "GPT Image 2.5 Sunburst",
    "gpt-image-2.5-flare": "GPT Image 2.5 Flare",
    "gpt-image-2": "GPT Image 2",
}
COVER_API_SIZES = {"9:16": "1024x1536", "4:5": "1024x1536", "1:1": "1024x1024", "16:9": "1536x1024"}
COVER_STYLE_HINT = {
    "typography": "bold graphic poster look, strong geometric forms",
    "shapes": "clean abstract geometric shapes, modern brand identity",
    "particles": "soft glowing particles and light, calm professional mood",
    "waveform": "sound-wave inspired lines and light",
    "steps": "clean diagram-like structure, numbered rhythm",
    "cinematic": "dark cinematic stage, warm gold light and smoke",
    "one_take": "sweeping depth, layered scene with a sense of camera motion",
    "collage": "paper collage with cut-out shapes and halftone texture",
    "cartoon": "friendly flat vector illustration, bold outlines",
    "poster": "halftone print poster, overprinted colours",
    "clips": "photographic, editorial",
    "phone": "product-shot look with a smartphone",
    "before_after": "split composition contrasting old and new",
}


def cover_prompt(project: dict, title: str) -> str:
    scenario = project.get("scenario") or {}
    info = project.get("info") or {}
    idea = " / ".join(scene["narration"] for scene in scenario.get("scenes", [])[:3] if scene.get("narration"))[:500]
    style = COVER_STYLE_HINT.get(project["settings"]["style"], "modern")
    return (f"Background artwork for the cover image of a short promotional video. Topic: {scenario.get('title') or title}. Brand: {info.get('brand') or ''}. "
            f"What the video says: {idea}. Art direction: {style}. Rich, polished, professional advertising quality. "
            "IMPORTANT: no text, no letters, no numbers, no logos or watermarks anywhere in the image. "
            "The cover is shown in an Instagram profile grid, which crops it to its central square: put the focal art in the center and keep the center calm enough for a large headline; the top and bottom edges are only atmosphere.")


def _generate_background(model: str, prompt: str, size: str, reference: Path | None = None) -> bytes:
    """Text-to-image, or an edit of `reference` (a frame of the customer's own footage) so the real product stays in the picture."""
    from openai import OpenAI
    last: Exception | None = None
    for base_url in _base_urls():
        client = OpenAI(base_url=base_url, api_key=os.getenv("GAPGPT_API_KEY", ""), timeout=180)
        for extra in ({"quality": "medium"}, {}):
            try:
                if reference is not None:
                    with reference.open("rb") as image:
                        item = client.images.edit(model=model, image=image, prompt=prompt[:1500], size=size, n=1, **extra).data[0]
                else:
                    item = client.images.generate(model=model, prompt=prompt[:1500], size=size, n=1, **extra).data[0]
                if item.b64_json:
                    return base64.b64decode(item.b64_json)
                if item.url:
                    return httpx.get(item.url, timeout=120, follow_redirects=True).content
            except Exception as exc:
                last = exc
                logger.warning("Cover model %s failed via %s: %s", model, base_url, exc)
    raise AgentError(f"{model}: {last}")


def _compose_cover(background: bytes, title: str, brand: str, logo: Path | None, size: tuple[int, int], out: Path) -> None:
    width, height = size
    unit = min(width, height)
    with tempfile.TemporaryDirectory() as tmp:
        comp = Path(tmp)
        (comp / "fonts").mkdir()
        css = ""
        for family, (file, weight) in FONTS.items():
            shutil.copy(vm.FONTS_DIR / file, comp / "fonts" / file)
            css += f'@font-face{{font-family:"{family}";src:url("fonts/{file}") format("truetype");font-weight:{weight};}}\n'
        (comp / "fonts.css").write_text(css)
        (comp / "bg.png").write_bytes(background)
        logo_tag = ""
        if logo is not None:
            shutil.copy(logo, comp / ("logo" + logo.suffix.lower()))
            logo_tag = f'<img src="logo{logo.suffix.lower()}" style="height:{round(unit * 0.09)}px;max-width:{round(width * 0.4)}px;object-fit:contain">'
        lines = "<br>".join(htmllib.escape(line) for line in title.strip().split("\n"))
        (comp / "index.html").write_text(
            f'<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>'
            f'html,body{{margin:0;width:{width}px;height:{height}px;overflow:hidden;background:#000;direction:rtl;font-family:"Yekan Bakh FaNum Black"}}'
            f'img.bg{{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}}'
            f'.scrim{{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,0,0,.62) 0%,rgba(0,0,0,.38) 45%,rgba(0,0,0,.12) 85%)}}'
            f'.box{{position:absolute;left:50%;top:50%;width:{round(unit * 0.84)}px;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:{round(unit * 0.035)}px;align-items:center;text-align:center}}'
            f'h1{{margin:0;color:#fff;font-size:{round(unit * 0.1)}px;line-height:1.4;text-align:center;text-shadow:0 4px 30px rgba(0,0,0,.6)}}'
            f'.bar{{width:{round(unit * 0.18)}px;height:{round(unit * 0.012)}px;background:#f59e0b;border-radius:99px}}'
            f'.brand{{color:#f5f4f8;font-size:{round(unit * 0.045)}px;opacity:.92}}'
            f'</style></head><body><img class="bg" src="bg.png"><div class="scrim"></div>'
            f'<div class="box">{logo_tag}<div class="bar"></div><h1>{lines}</h1><div class="brand">{htmllib.escape(brand)}</div></div>'
            f'<script>window.seek=async()=>{{}}</script></body></html>', encoding="utf-8")
        with _Page(comp, size) as page:
            page.shot(0, out, quality=92)


def make_frame_cover(project: dict, title: str, logo: Path | None, frame: Path, out_dir: Path, batch: str) -> dict:
    """The no-AI cover: a frame of the customer's own footage with the headline composed over it."""
    out_dir.mkdir(parents=True, exist_ok=True)
    name = f"cover_{batch}_f.jpg"
    brand = (project.get("info") or {}).get("brand") or ""
    _compose_cover(frame.read_bytes(), title, brand, logo, vm.FORMATS[project["settings"]["format"]], out_dir / name)
    return {"model": "frame", "label": "قاب ویدیوی تو", "file": name}


def make_cover_options(project: dict, title: str, logo: Path | None, out_dir: Path, batch: str, reference: Path | None = None) -> list[dict]:
    """AI covers composed at the video's own dimensions. With a reference frame two models edit it (the product stays); without, all three draw from the text."""
    out_dir.mkdir(parents=True, exist_ok=True)
    size = vm.FORMATS[project["settings"]["format"]]
    prompt, api_size = cover_prompt(project, title), COVER_API_SIZES[project["settings"]["format"]]
    if reference is not None:
        prompt = ("Restyle this frame into a polished, professional cover image for the video. Keep the real product/subject and its colours recognisable, "
                  "improve the background, lighting and composition. " + prompt)
    brand = (project.get("info") or {}).get("brand") or ""
    models = list(COVER_MODELS)[: 2 if reference is not None else 3]

    def one(item: tuple[int, str]) -> dict | None:
        index, model = item
        try:
            background = _generate_background(model, prompt, api_size, reference)
            name = f"cover_{batch}_{index}.jpg"
            _compose_cover(background, title, brand, logo, size, out_dir / name)
            return {"model": model, "label": COVER_MODELS[model], "file": name}
        except Exception as exc:
            logger.warning("Cover option %s failed: %s", model, exc)
            return None

    with ThreadPoolExecutor(max_workers=3) as pool:
        options = [o for o in pool.map(one, enumerate(models)) if o]
    if not options:
        raise AgentError("ساخت کاور ناموفق بود، دوباره تلاش کنید")
    return options
