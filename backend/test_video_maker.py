import subprocess
from pathlib import Path

import pytest

from services import video_maker

SCENARIO = {
    "title": "چرا سایتت بازدید داره، ولی کسی نمی‌خره؟",
    "scenes": [
        {"kind": "hook", "title": "هوک", "text": "سایتت بازدید داره\nولی فروش نه؟", "highlight": "فروش", "narration": "سایتت بازدید دارد ولی فروش ندارد", "duration": 3, "asset": None},
        {"kind": "body", "title": "مشکل", "text": "مشکل تبلیغات نیست", "highlight": "تبلیغات", "narration": "مشکل معمولا تبلیغات نیست", "duration": 3, "asset": 0},
        {"kind": "cta", "title": "دعوت", "text": "سایتت رو برام بفرست", "highlight": "بفرست", "narration": "همین حالا سایتت را برای من بفرست", "duration": 3, "asset": None},
    ],
}


def fake_tts(text: str, voice: str) -> bytes:
    out = Path("/tmp") / "fake_tts.mp3"
    seconds = max(len(text.split()) * 0.45, 1)
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"sine=frequency=220:duration={seconds}", "-q:a", "5", str(out)], check=True, capture_output=True)
    return out.read_bytes()


def fake_stt(audio: Path) -> list[dict]:
    duration = video_maker.probe(audio)["duration"]
    return [{"start": 0.1, "end": duration - 0.1}]  # one blob: forces the proportional fallback


@pytest.fixture
def stubbed_voice(monkeypatch):
    monkeypatch.setattr(video_maker, "tts_bytes", fake_tts)
    monkeypatch.setattr(video_maker, "stt_words", fake_stt)


def _clip(tmp_path):
    clip = tmp_path / "clip.mp4"
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=s=1280x720:r=25:d=4", "-pix_fmt", "yuv420p", str(clip)], check=True, capture_output=True)
    return clip


@pytest.mark.parametrize("fmt", ["9:16", "1:1", "16:9"])
def test_render_narrated_reel_in_each_format(tmp_path, stubbed_voice, fmt):
    settings = {**video_maker.DEFAULT_SETTINGS, "format": fmt, "style": "clips"}
    info = video_maker.render(SCENARIO, settings, [_clip(tmp_path)], None, tmp_path / "out", tmp_path / "audio")
    assert (info["width"], info["height"]) == video_maker.FORMATS[fmt]
    assert info["has_audio"]
    for name in ("poster.jpg", "cover.jpg"):
        assert (tmp_path / "out" / name).stat().st_size > 1000


def test_narration_is_cached_per_scene(tmp_path, stubbed_voice, monkeypatch):
    calls = []
    monkeypatch.setattr(video_maker, "tts_bytes", lambda t, v: calls.append(t) or fake_tts(t, v))
    settings = dict(video_maker.DEFAULT_SETTINGS)
    video_maker.render(SCENARIO, settings, [], None, tmp_path / "a", tmp_path / "audio")
    changed = {**SCENARIO, "scenes": [{**SCENARIO["scenes"][0], "narration": "متن تازه برای صحنه اول"}, *SCENARIO["scenes"][1:]]}
    video_maker.render(changed, settings, [], None, tmp_path / "b", tmp_path / "audio")
    assert len(calls) == 4  # 3 first time, only the edited scene afterwards


def test_logo_on_cta_and_before_after(tmp_path, stubbed_voice):
    logo = tmp_path / "logo.png"
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=red:s=200x200", "-frames:v", "1", str(logo)], check=True, capture_output=True)
    clip = _clip(tmp_path)
    settings = {**video_maker.DEFAULT_SETTINGS, "style": "before_after", "subtitle_mode": "sentence", "subtitle_pos": "middle"}
    info = video_maker.render(SCENARIO, settings, [clip, clip], logo, tmp_path / "out", tmp_path / "audio")
    assert (info["width"], info["height"]) == (1080, 1920)


def test_highlight_runs_keep_rtl_reading_order_and_edge_spaces():
    line = video_maker._highlight_line("مشکل تقریباً هیچ‌وقت", "تقریباً")
    assert line.index("هیچ‌وقت") < line.index("تقریباً") < line.index("مشکل")
    assert "\\h" in line and line.count("{\\c") == 2
    assert video_maker._highlight_line("بدون هایلایت", "") == "بدون هایلایت"


def test_settings_patch_drops_invalid_values_and_estimate_adds_up():
    clean = video_maker.clean_settings({"format": "3:1", "voice": "female_formal", "duration": 99, "speed": "fast"})
    assert clean["format"] == "9:16" and clean["voice"] == "female_formal" and clean["speed"] == "fast" and clean["duration"] == 30
    cost = video_maker.estimate_cost({"settings": clean, "scenario": video_maker.normalize_scenario(SCENARIO, 1)})
    assert cost["total"] == sum(line["credits"] for line in cost["lines"]) and cost["included_edits"] == 4


def test_primary_voice_failure_falls_back_to_second_provider(monkeypatch):
    seen = []

    def kaya(text, voice):
        seen.append(("kaya", voice))
        raise video_maker.VideoError("down")

    monkeypatch.setattr(video_maker, "_kaya_tts", kaya)
    monkeypatch.setattr(video_maker, "_openai_tts", lambda text, voice: seen.append(("openai", voice)) or b"audio")
    assert video_maker.tts_bytes("سلام", "female_formal") == b"audio"
    assert seen == [("kaya", "female_formal"), ("openai", "female_formal")]


def test_voice_preview_is_cached_only_for_the_primary_provider(tmp_path, monkeypatch):
    calls = []
    monkeypatch.setattr(video_maker, "_kaya_tts", lambda text, voice: calls.append(voice) or b"mp3data")
    first = video_maker.voice_preview("male_warm", tmp_path)
    assert video_maker.voice_preview("male_warm", tmp_path) == first and first.read_bytes() == b"mp3data" and calls == ["male_warm"]

    def down(text, voice):
        raise video_maker.VideoError("down")

    monkeypatch.setattr(video_maker, "_kaya_tts", down)
    monkeypatch.setattr(video_maker, "_openai_tts", lambda text, voice: b"fallback")
    sample = video_maker.voice_preview("female_formal", tmp_path)
    assert sample.read_bytes() == b"fallback" and not (tmp_path / "female_formal.mp3").exists()
    with pytest.raises(video_maker.VideoError):
        video_maker.voice_preview("nobody", tmp_path)


def test_empty_kaya_base_url_env_uses_the_default(monkeypatch):
    seen = {}

    class Reply:
        status_code, content = 200, b"audio"

    monkeypatch.setenv("KAYA_API_KEY", "k")
    monkeypatch.setenv("KAYA_BASE_URL", "")
    monkeypatch.setattr(video_maker.httpx, "post", lambda url, **kw: seen.update(url=url) or Reply())
    assert video_maker._kaya_tts("سلام", "male_warm") == b"audio" and seen["url"] == "https://kayaai.ir/api/v1/audio/speech"


@pytest.mark.parametrize("style", list(video_maker.STYLE_CATALOG))
def test_every_style_renders_a_valid_narrated_video(tmp_path, stubbed_voice, style):
    clips = [_clip(tmp_path), _clip(tmp_path)] if video_maker.STYLE_CATALOG[style]["clips"] else []
    settings = {**video_maker.DEFAULT_SETTINGS, "style": style}
    info = video_maker.render(SCENARIO, settings, clips, None, tmp_path / "out", tmp_path / "audio")
    assert (info["width"], info["height"]) == (1080, 1920) and info["has_audio"]


def test_style_needing_missing_clips_falls_back_to_typography(tmp_path, stubbed_voice):
    settings = {**video_maker.DEFAULT_SETTINGS, "style": "phone"}
    assert video_maker.render(SCENARIO, settings, [], None, tmp_path / "out", tmp_path / "audio")["has_audio"]


def test_style_preview_is_cached_and_unknown_style_rejected(tmp_path):
    first = video_maker.style_preview("shapes", tmp_path)
    assert first.stat().st_size > 1000 and video_maker.style_preview("shapes", tmp_path) == first
    with pytest.raises(video_maker.VideoError):
        video_maker.style_preview("nope", tmp_path)


def test_style_price_is_added_to_estimate():
    base = {"settings": dict(video_maker.DEFAULT_SETTINGS), "scenario": video_maker.normalize_scenario(SCENARIO, 1)}
    phone = {**base, "settings": {**base["settings"], "style": "phone"}}
    assert video_maker.estimate_cost(phone)["total"] - video_maker.estimate_cost(base)["total"] == video_maker.STYLE_CATALOG["phone"]["credits"]


def test_kaya_connection_hiccup_is_retried_before_falling_back(monkeypatch):
    attempts = []

    class Reply:
        status_code, content = 200, b"audio"

    def post(url, **kw):
        attempts.append(1)
        if len(attempts) < 3:
            raise video_maker.httpx.ConnectError("eof")
        return Reply()

    monkeypatch.setenv("KAYA_API_KEY", "k")
    monkeypatch.setattr(video_maker.httpx, "post", post)
    monkeypatch.setattr(video_maker.time, "sleep", lambda s: None)
    assert video_maker._kaya_tts("سلام", "male_warm") == b"audio" and len(attempts) == 3
