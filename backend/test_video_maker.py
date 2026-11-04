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


def test_split_draft_assembles_director_shell_and_parallel_scenes():
    from services import video_agent
    scenes = [{"kind": "hook", "title": "a", "text": "t0", "visual": "v0", "start": 0, "end": 3}, {"kind": "cta", "title": "b", "text": "t1", "visual": "v1", "start": 3, "end": 6}]
    shell = "<html><body><script>window.SCENES={};\n/*SCENES*/\nwindow.seek=function(t){SCENES[0](t,0)}</script></body></html>"
    seen = []

    def ask(messages, system, models=None, max_tokens=24000):
        if system is video_agent.DIRECTOR_SYSTEM:
            seen.append(("director", models))
            return f"```html\n{shell}\n```\n<scenes>[\"note zero\", \"note one\"]</scenes>"
        seen.append(("scene", models))
        i = 0 if "scene 0 of" in messages[0]["content"] else 1
        assert ("note zero" if i == 0 else "note one") in messages[0]["content"]
        return f"```js\nSCENES[{i}] = function(t, k) {{ /* scene {i} */ }};\n```"

    html = video_agent._split_draft("brief", scenes, ask)
    assert "SCENES[0] =" in html and "SCENES[1] =" in html and "/*SCENES*/" not in html
    assert seen[0] == ("director", None) and all(models == video_agent.vm.REVIEW_MODELS for kind, models in seen[1:])

    def broken(messages, system, models=None, max_tokens=24000):
        return "```html\n<html>seek</html>\n```" if system is video_agent.DIRECTOR_SYSTEM else "no code"
    try:
        video_agent._split_draft("brief", scenes, broken)
        raise AssertionError("a shell without the marker must be refused")
    except video_agent.AgentError:
        pass


def test_spend_is_counted_across_worker_threads():
    from concurrent.futures import ThreadPoolExecutor
    from contextvars import copy_context
    from services import video_agent
    video_agent._spend.set({"usd": 0.0, "in": 0, "out": 0})
    with ThreadPoolExecutor(max_workers=4) as pool:
        for future in [pool.submit(copy_context().run, video_agent._record_spend, "claude-sonnet-5-5", {"prompt_tokens": 1000, "completion_tokens": 1000}) for _ in range(8)]:
            future.result()
    assert video_agent._spend.get()["in"] == 8000


def test_json_reply_is_parsed_even_with_fences_and_prose():
    assert video_maker._parse_json_object('Sure!\n```json\n{"reply": "ok", "n": {"a": 1}}\n```\nbye') == {"reply": "ok", "n": {"a": 1}}
    for bad in ("no object here", "[1, 2]"):
        try:
            video_maker._parse_json_object(bad)
            raise AssertionError(bad)
        except ValueError:
            pass


def test_trim_keeps_whole_sentences():
    text = "جمله‌ی اول کوتاه است. جمله‌ی دوم خیلی بلندتر از حد مجاز است و باید بریده شود"
    assert video_maker._trim(text, 40).endswith(".") and video_maker._trim("کوتاه", 40) == "کوتاه"


def _scene(kind, text, narration, duration, visual="نمودار یک قیف که بازدیدها را می‌ریزد"):
    return {"kind": kind, "title": "t", "text": text, "highlight": "", "narration": narration, "duration": duration, "asset": None, "visual": visual}


def test_scenario_linter_flags_what_the_prompt_promises():
    good = {"title": "x", "grammar": "", "scenes": [_scene("hook", "چرا نمی‌خرند", "چرا سایتت بازدید دارد ولی کسی نمی‌خرد", 5), _scene("body", "مشکل از مسیر است", "مشکل معمولاً از مسیر خرید است", 10), _scene("cta", "همین الان", "همین الان مشاوره بگیر", 15)]}
    assert video_maker.lint_scenario(good, 30) == []
    bad = {"title": "x", "grammar": "", "scenes": [_scene("body", "یک دو سه چهار پنج شش هفت هشت نه ده یازده", "سلام " + "کلمه " * 30 + "۱۲۳ 45", 3, "متن روی صفحه"), _scene("body", "ب", "ب", 3)]}
    found = " | ".join(video_maker.lint_scenario(bad, 30))
    for expect in ("3 to 6 scenes", "first scene must have kind hook", "last scene must have kind cta", "add up to", "narration words", "digits", "more than 10 words", "concrete image", "greeting"):
        assert expect in found, expect


def test_layout_audit_measures_clipped_and_off_frame_text(tmp_path):
    import os
    if not os.getenv("CHROMIUM_PATH"):
        return
    from services import video_agent
    comp = tmp_path / "comp"
    comp.mkdir()
    (comp / "index.html").write_text('<!doctype html><html><body style="margin:0;width:540px;height:960px;overflow:hidden">'
                                     '<h1 id="a" style="position:absolute;left:700px;top:100px;font-size:60px">خارج از کادر</h1>'
                                     '<h1 id="b" style="position:absolute;left:20px;top:450px;font-size:40px">داخل کادر</h1>'
                                     '<h1 id="c" style="position:absolute;left:20px;top:870px;font-size:40px;margin:0">زیر منوی برنامه</h1>'
                                     '<script>window.seek=function(t){}</script></body></html>')
    frames, errors, layout = video_agent._sample(comp, (540, 960), [0.0, 1.0])
    joined = " | ".join(layout)
    assert "outside the frame" in joined and "خارج از کادر" in joined and "covered by the app UI" in joined
    assert "داخل کادر" not in joined and "identical" in joined  # a static page is flagged as not changing over time


def test_library_prefers_the_script_with_the_closest_meaning(tmp_path, monkeypatch):
    from services import video_agent
    monkeypatch.setattr(video_agent, "LIBRARY", tmp_path / "lib")
    scenario = video_maker.normalize_scenario(SCENARIO, 1)
    settings = video_maker.clean_settings({"style": "typography"})
    base = video_agent._fingerprint(scenario, settings, video_maker.FORMATS[settings["format"]], 0)
    video_agent._library_save("<html>about shops seek</html>", {**base, "text": "shop", "vec": [1.0, 0.0]}, scenario, {})
    video_agent._library_save("<html>about cooking seek</html>", {**base, "text": "cook", "vec": [0.0, 1.0]}, scenario, {})
    assert video_agent._library_pick({**base, "vec": [0.9, 0.1]}) == "<html>about shops seek</html>"
    assert video_agent._library_pick({**base, "vec": [0.1, 0.9]}) == "<html>about cooking seek</html>"
    assert video_agent._library_pick(base) in ("<html>about shops seek</html>", "<html>about cooking seek</html>")  # no vector: structure only


def test_embedding_failure_never_breaks_the_build(monkeypatch):
    from services import video_agent
    monkeypatch.setattr(video_agent, "_base_urls", lambda: ["https://gateway.test/v1"])

    def boom(*a, **k):
        raise video_agent.httpx.ConnectError("down")
    monkeypatch.setattr(video_agent.httpx, "post", boom)
    assert video_agent._embed("text") is None
    assert abs(video_agent._cosine([1, 0], [1, 0]) - 1) < 1e-9 and video_agent._cosine([0, 0], [1, 0]) == 0.0


def test_progress_is_monotonic_reaches_the_end_and_learns_durations(tmp_path, monkeypatch):
    from services import video_agent
    monkeypatch.setattr(video_agent, "STATS_FILE", tmp_path / "stats.json")
    events = []
    tracker = video_agent._Progress(lambda percent, label, eta: events.append((percent, label, eta)))
    with tracker.stage("voice"):
        for i in range(3):
            tracker.fraction(i + 1, 3)
    tracker.skip("design")
    with tracker.stage("review"):
        pass
    with tracker.stage("frames"):
        tracker.fraction(0.5, 1)
        tracker.fraction(1, 1)
    tracker.finish()
    percents = [e[0] for e in events]
    assert percents == sorted(percents) and percents[-1] == 100 and max(p for p in percents[:-1]) <= 99
    assert events[-1][2] == 0 and all(e[2] >= 5 for e in events[:-1])
    assert "design" not in tracker.plan and (tmp_path / "stats.json").exists()


def test_new_videos_are_designed_from_scratch_and_avoid_recent_concepts(tmp_path):
    from services import video_agent
    assert video_agent.REUSE is False and "#7c3aed" not in video_agent.SYSTEM_PROMPT
    file = tmp_path / "_recent_concepts.json"
    for n in range(5):
        video_agent._remember_concept(file, f"<brief>concept {n}</brief>```html```")
    video_agent._remember_concept(file, "a reply without a brief")
    assert video_agent._recent_concepts(file) == ["concept 2", "concept 3", "concept 4"]
    assert video_agent._recent_concepts(tmp_path / "missing.json") == []


def test_a_patch_that_breaks_the_design_is_rolled_back(tmp_path):
    import os
    if not os.getenv("CHROMIUM_PATH"):
        return
    from services import video_agent
    html = '<!doctype html><html><body style="background:#123;color:#fff"><h1 id="a">x</h1><script>window.seek=function(t){document.getElementById("a").style.opacity=t}</script></body></html>'
    calls = []

    def ask(messages, system, models=None, max_tokens=48000):
        calls.append(bool(models))
        return "<<<<<<< SEARCH\nwindow.seek=function(t){\n=======\nwindow.seek=function(t){{{\n>>>>>>> REPLACE" if models else f"```html\n{html}\n```"

    scenario = video_maker.normalize_scenario(SCENARIO, 1)
    work = tmp_path / "customer" / "project" / "v1"
    result = video_agent.build(scenario, video_maker.clean_settings({"style": "typography"}), [], None, work, tmp_path / "audio", narrate_fn=lambda *a, **k: None, ask=ask)
    assert result["has_audio"] and "{{{" not in (work / "comp" / "index.html").read_text() and calls == [False, True]


def _plain_scenario(narration="مسیر خرید تو گم شده است", text="مشکل از مسیر است"):
    return {"title": "x", "grammar": "", "scenes": [_scene("hook", "چرا نمی‌خرند", "چرا کسی از سایتت نمی‌خرد", 5), _scene("body", text, narration, 10), _scene("cta", "همین الان", "همین الان مشاوره بگیر", 15)]}


def test_numbers_the_customer_never_gave_are_flagged():
    said = "فروشم سی درصد بالا رفت و ۵ میلیون تومان درآمد داشتم، ۱۲۰۰ مشتری دارم"
    ok = _plain_scenario("فروش سی درصد بالا رفت و پنج میلیون تومان درآمد آمد", "۱۲۰۰ مشتری، ۳۰٪ رشد")
    assert video_maker.lint_scenario(ok, 30, said) == []
    bad = " | ".join(video_maker.lint_scenario(_plain_scenario("فروش هفتاد درصد بالا رفت و ده هزار نفر خریدند", "۹۰٪ رشد"), 30, said))
    assert "70" in bad and "90" in bad and "not given" in bad
    assert video_maker.lint_scenario(_plain_scenario("سه دلیل دارد و یک روز خوب می‌آید", "۳ دلیل"), 30, said) == []
    assert video_maker.lint_scenario(_plain_scenario("فروش هفتاد درصد بالا رفت"), 30, None) == []  # files were attached: numbers may come from them


def test_written_prose_in_narration_is_flagged():
    assert "written prose" in " ".join(video_maker.lint_scenario(_plain_scenario("همچنین مسیر خرید مهم است"), 30))


def _turn(scenario, brand="برند", cta="تماس"):
    return {"reply": "باشه", "quick_replies": [], "info": {"brand": brand, "cta": cta}, "scenario": scenario, "ready": True}


def _project():
    return {"clips": [], "logo": None, "info": {}, "messages": [], "scenario": None, "settings": video_maker.clean_settings({})}


def test_weak_scorecard_triggers_one_rewrite_and_strong_one_none(monkeypatch):
    import asyncio
    better = _plain_scenario("حالا مسیر خرید را کوتاه کن")
    for card, expected_calls, expected in (
        ({"hook": 4, "payoff": 8, "spoken": 8, "cta": 8, "fixes": ["hook را تیزتر کن"]}, 3, "حالا مسیر خرید را کوتاه کن"),
        ({"hook": 8, "payoff": 8, "spoken": 8, "cta": 8, "fixes": []}, 2, "مسیر خرید تو گم شده است"),
    ):
        calls = []

        async def ask(system, user, history=None, temperature=0.7):
            calls.append(system)
            if system == video_maker.SCORE_PROMPT:
                assert temperature == 0.2
                return card
            return _turn(better if len(calls) > 1 else _plain_scenario())

        monkeypatch.setattr(video_maker, "_ask_json", ask)
        result = asyncio.run(video_maker.chat_turn(_project(), "طراحی سایت دارم"))
        assert len(calls) == expected_calls and result["scenario"]["scenes"][1]["narration"] == expected


def test_no_scorecard_until_brand_and_cta_are_known(monkeypatch):
    import asyncio
    calls = []

    async def ask(system, user, history=None, temperature=0.7):
        calls.append(system)
        return {"reply": "برندت چیه؟", "quick_replies": [], "info": {}, "scenario": _plain_scenario()}

    monkeypatch.setattr(video_maker, "_ask_json", ask)
    asyncio.run(video_maker.chat_turn(_project(), "طراحی سایت دارم"))
    assert video_maker.SCORE_PROMPT not in calls and len(calls) == 1


def test_invented_claims_are_removed_and_the_reply_is_not_about_the_rewrite(monkeypatch):
    import asyncio
    prompts = []

    async def ask(system, user, history=None, temperature=0.7):
        prompts.append(user)
        if system == video_maker.SCORE_PROMPT:
            assert "طراحی سایت دارم" in user
            return {"hook": 9, "payoff": 9, "spoken": 9, "cta": 9, "invented": ["عطر کارامل"], "fixes": []}
        if len(prompts) == 1:
            return _turn(_plain_scenario("عطر کارامل دارد"))
        return {**_turn(_plain_scenario("مسیر را کوتاه کن")), "reply": "طبق نکاتت اصلاح کردم"}

    monkeypatch.setattr(video_maker, "_ask_json", ask)
    result = asyncio.run(video_maker.chat_turn(_project(), "طراحی سایت دارم"))
    assert "remove this claim" in prompts[2] and result["reply"] == "باشه" and result["scenario"]["scenes"][1]["narration"] == "مسیر را کوتاه کن"
