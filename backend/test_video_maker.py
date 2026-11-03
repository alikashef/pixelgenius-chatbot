import subprocess
from pathlib import Path

import unittest

try:
    import pytest
except ImportError:  # the server's deploy gate runs plain unittest, where pytest is not installed
    raise unittest.SkipTest("pytest is not installed")

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


def test_voice_preview_never_uses_fallback_and_remembers_failures(tmp_path, monkeypatch):
    monkeypatch.setattr(video_maker, "BUNDLED_PREVIEWS", tmp_path / "none")
    video_maker._preview_failed.clear()
    calls = []
    monkeypatch.setattr(video_maker, "_kaya_tts", lambda text, voice: calls.append(voice) or b"mp3data")
    first = video_maker.voice_preview("male_warm", tmp_path)
    assert video_maker.voice_preview("male_warm", tmp_path) == first and first.read_bytes() == b"mp3data" and calls == ["male_warm"]

    def down(text, voice):
        calls.append(voice)
        raise video_maker.VideoError("down")

    monkeypatch.setattr(video_maker, "_kaya_tts", down)
    monkeypatch.setattr(video_maker, "_openai_tts", lambda text, voice: pytest.fail("previews never use the fallback"))
    for _ in range(3):
        with pytest.raises(video_maker.VideoError):
            video_maker.voice_preview("female_formal", tmp_path)
    assert calls.count("female_formal") == 1
    with pytest.raises(video_maker.VideoError):
        video_maker.voice_preview("nobody", tmp_path)


def test_bundled_voice_preview_makes_no_request(tmp_path, monkeypatch):
    (tmp_path / "male_warm.mp3").write_bytes(b"bundled")
    monkeypatch.setattr(video_maker, "BUNDLED_PREVIEWS", tmp_path)
    monkeypatch.setattr(video_maker, "_kaya_tts", lambda text, voice: pytest.fail("no request expected"))
    assert video_maker.voice_preview("male_warm", tmp_path / "cache").read_bytes() == b"bundled"


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


def test_agent_price_scales_with_length_and_stays_above_cost():
    settings = video_maker.clean_settings({})
    scenario = video_maker.normalize_scenario(SCENARIO, 1)
    longer = {**scenario, "scenes": [{**scene, "duration": scene["duration"] * 3} for scene in scenario["scenes"]]}
    short_cost = video_maker.estimate_cost({"settings": settings, "scenario": scenario})
    long_cost = video_maker.estimate_cost({"settings": settings, "scenario": longer})
    assert long_cost["total"] > short_cost["total"]
    assert short_cost["total"] >= 2260


def test_agent_spend_is_tallied_and_capped(monkeypatch):
    from services import video_agent
    video_agent._spend.set({"usd": 0.0, "in": 0, "out": 0})
    video_agent._record_spend("claude-opus-5-5", {"prompt_tokens": 1_000_000, "completion_tokens": 100_000})
    assert round(video_agent._spend.get()["usd"], 2) == 6.0
    monkeypatch.setattr(video_agent, "MAX_RENDER_USD", 2.0)
    try:
        video_agent._check_budget()
        raise AssertionError("cap not enforced")
    except video_agent.AgentError:
        pass


def test_quota_probe_blocks_only_on_insufficient_quota(monkeypatch):
    from services import video_agent

    class Reply:
        def __init__(self, status, text):
            self.status_code, self.text = status, text

    monkeypatch.setattr(video_agent, "_base_urls", lambda: ["https://gateway.test/v1"])
    for status, text, expected in ((403, '{"error":{"code":"insufficient_user_quota"}}', False), (200, "{}", True), (500, "oops", True)):
        video_agent._quota_probe.update(at=0.0, ok=True)
        monkeypatch.setattr(video_agent.httpx, "post", lambda *a, _r=Reply(status, text), **k: _r)
        assert video_agent.check_quota() is expected
    video_agent._quota_probe.update(at=0.0, ok=True)


def test_patches_apply_only_when_unique_and_keep_the_document_valid():
    from services import video_agent
    html = "<html><body><h1>One</h1><script>function seek(t){}</script></body></html>"
    patched, applied = video_agent._apply_patches(html, "<<<<<<< SEARCH\n<h1>One</h1>\n=======\n<h1>Two</h1>\n>>>>>>> REPLACE")
    assert applied == 1 and "<h1>Two</h1>" in patched
    assert video_agent._apply_patches(html, "<<<<<<< SEARCH\nmissing\n=======\nx\n>>>>>>> REPLACE") == (html, 0)
    assert video_agent._apply_patches(html, "<<<<<<< SEARCH\nfunction seek(t){}\n=======\nnothing\n>>>>>>> REPLACE")[1] == 0


def test_library_keeps_designs_but_never_a_customers_own_words(tmp_path, monkeypatch):
    from services import video_agent
    monkeypatch.setattr(video_agent, "LIBRARY", tmp_path / "lib")
    scenario = video_maker.normalize_scenario(SCENARIO, 1)
    settings = video_maker.clean_settings({"style": "typography"})
    finger = video_agent._fingerprint(scenario, settings, video_maker.FORMATS[settings["format"]], 0)
    own_words = scenario["scenes"][0]["narration"]
    video_agent._library_save(f"<html>{own_words} seek</html>", finger, scenario, {})
    assert video_agent._library_pick(finger) is None
    video_agent._library_save("<html>design only seek</html>", finger, scenario, {})
    assert video_agent._library_pick(finger) == "<html>design only seek</html>"
    assert video_agent._library_pick({**finger, "scenes": finger["scenes"] + 1}) is None


def test_svg_logo_is_sanitized_but_keeps_the_drawing():
    clean = video_maker.sanitize_svg(b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="x()"><script>alert(1)</script>'
                                     b'<foreignObject><div/></foreignObject><a href="javascript:alert(1)"><path d="M0 0L10 10" fill="#7c3aed"/></a>'
                                     b'<image href="https://evil.test/x.png"/><style>@import url(http://evil.test/a.css); .a{fill:red}</style></svg>').decode()
    assert "<path" in clean and "#7c3aed" in clean and ".a{fill:red}" in clean
    for bad in ("script", "foreignObject", "onload", "javascript:", "evil.test"):
        assert bad not in clean
    for broken in (b"<html></html>", b"not xml", b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', b'<!DOCTYPE svg [<!ENTITY a "b">]><svg viewBox="0 0 1 1"/>'):
        try:
            video_maker.sanitize_svg(broken)
            raise AssertionError(broken)
        except video_maker.VideoError:
            pass


def test_sound_bed_and_final_mix_cover_the_whole_video(tmp_path):
    from services import video_agent
    scenes = [{"index": i, "start": i * 3.0, "end": (i + 1) * 3.0} for i in range(3)]
    narration = tmp_path / "narration.m4a"
    subprocess.run(["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=f=200:d=9", "-c:a", "aac", str(narration)], check=True, capture_output=True)
    mix = video_agent._final_audio(scenes, narration, 9.0, tmp_path)
    assert (tmp_path / "bed.wav").exists() and mix.name == "mix.m4a"
    assert abs(video_maker.probe(mix)["duration"] - 9.0) < 0.6


def test_frames_are_shot_in_parallel_chunks_without_gaps(tmp_path, monkeypatch):
    from services import video_agent
    shot = []

    class FakePage:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): pass
        def shot(self, t, path, quality=90): shot.append(path.name); path.write_bytes(b"x")

    monkeypatch.setattr(video_agent, "_Page", FakePage)
    monkeypatch.setattr(video_agent, "WORKERS", 3)
    video_agent._render_frames(tmp_path, (10, 10), 100, tmp_path / "frames")
    assert sorted(shot) == [f"{n:06d}.jpg" for n in range(100)]
