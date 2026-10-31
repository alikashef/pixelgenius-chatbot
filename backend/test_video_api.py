import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from routers import video_maker as router_module
from services import video_maker
from test_video_maker import SCENARIO, fake_stt, fake_tts, _clip


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(router_module, "ROOT", tmp_path / "store")
    (tmp_path / "store").mkdir()
    app = FastAPI()
    app.include_router(router_module.router, prefix="/api")
    state = {"sub": "a" * 32}
    app.dependency_overrides[router_module.video_customer] = lambda: {"sub": state["sub"], "role": "customer"}
    monkeypatch.setattr(video_maker, "tts_bytes", fake_tts)
    monkeypatch.setattr(video_maker, "stt_words", fake_stt)
    turns = iter([
        {"reply": "برندت چیه؟", "quick_replies": [], "info": {"format": "9:16", "format_reason": "ریل گفتی"}, "scenario": video_maker.normalize_scenario(SCENARIO, 1)},
        {"reply": "عالی، آخرش چی‌کار کنن؟", "quick_replies": ["ثبت درخواست"], "info": {"brand": "pixelgenius", "style": "clips"}, "scenario": None},
        {"reply": "نوشتم.", "quick_replies": [], "info": {"cta": "ثبت درخواست در چت‌بات"}, "scenario": None},
    ])

    async def fake_turn(project, message):
        return next(turns)

    async def fake_revise(project, request):
        scenario = video_maker.normalize_scenario({**project["scenario"], "scenes": [{**project["scenario"]["scenes"][0], "narration": "متن جدید گوینده برای صحنه اول"}, *project["scenario"]["scenes"][1:]]}, 1)
        return {"reply": "صحنه اول عوض شد", "scenario": scenario, "settings": video_maker.clean_settings({"voice": "female_formal"}, project["settings"])}

    monkeypatch.setattr(video_maker, "chat_turn", fake_turn)
    monkeypatch.setattr(video_maker, "revise", fake_revise)
    c = TestClient(app)
    c.state = state
    return c


def _wait(client, pid):
    for _ in range(240):
        project = client.get(f"/api/video/projects/{pid}").json()
        if project["status"] in ("ready", "failed"):
            return project
        time.sleep(0.5)
    raise AssertionError("render timed out")


def test_scenario_chat_to_narrated_video_with_edit_and_isolation(client, tmp_path):
    pid = client.post("/api/video/projects", json={}).json()["id"]
    assert client.post(f"/api/video/projects/{pid}/render").status_code == 400  # brand and CTA still missing
    with _clip(tmp_path).open("rb") as f:
        client.post(f"/api/video/projects/{pid}/clips", files={"file": ("in.mp4", f, "video/mp4")})
    assert client.post(f"/api/video/projects/{pid}/logo", files={"file": ("l.gif", b"x", "image/gif")}).status_code == 400
    for text in ("طراح سایتم، ریل می‌خوام", "برندم pixelgenius ـه", "ثبت درخواست در چت‌بات"):
        project = client.post(f"/api/video/projects/{pid}/chat", json={"message": text}).json()
    assert project["ready"] and project["settings"]["format"] == "9:16" and project["settings"]["style"] == "clips"
    assert len(project["messages"]) == 7 and project["estimate"]["total"] > 0
    client.put(f"/api/video/projects/{pid}/settings", json={"voice": "male_energetic", "subtitle_mode": "sentence"})
    assert client.put(f"/api/video/projects/{pid}/settings", json={"style": "before_after"}).status_code == 400
    client.post(f"/api/video/projects/{pid}/render")
    done = _wait(client, pid)
    assert done["status"] == "ready" and done["edits"]["used"] == 0
    video = client.get(done["versions"][0]["video_url"])
    assert video.status_code == 200 and video.content[4:8] == b"ftyp"
    assert client.get(done["versions"][0]["cover_url"]).status_code == 200
    client.post(f"/api/video/projects/{pid}/revise", json={"request": "صدا رو عوض کن"})
    done = _wait(client, pid)
    assert len(done["versions"]) == 2 and done["edits"]["used"] == 1 and done["settings"]["voice"] == "female_formal"
    assert done["versions"][1]["note"] == "صحنه اول عوض شد"
    rolled = client.post(f"/api/video/projects/{pid}/rollback/1").json()
    assert rolled["settings"]["voice"] == "male_energetic"
    assert client.get(done["versions"][0]["video_url"].split("?")[0] + "?t=bad").status_code == 403
    client.state["sub"] = "b" * 32
    assert client.get(f"/api/video/projects/{pid}").status_code == 404


def test_voice_list_and_preview(client, monkeypatch):
    monkeypatch.setattr(video_maker, "_kaya_tts", lambda text, voice: b"ID3fake-mp3")
    voices = client.get("/api/video/voices").json()
    assert [v["value"] for v in voices] == ["male_warm", "female_formal", "male_energetic"]
    sample = client.get("/api/video/voices/female_formal/preview")
    assert sample.status_code == 200 and sample.headers["content-type"] == "audio/mpeg" and sample.content == b"ID3fake-mp3"
    assert client.get("/api/video/voices/nobody/preview").status_code == 404


def test_style_catalog_in_project_and_clip_requirements(client, tmp_path):
    project = client.post("/api/video/projects", json={}).json()
    values = [s["value"] for s in project["styles"]]
    assert {"typography", "shapes", "particles", "waveform", "steps", "clips", "phone", "before_after"} <= set(values)
    pid = project["id"]
    assert client.put(f"/api/video/projects/{pid}/settings", json={"style": "waveform"}).json()["settings"]["style"] == "waveform"
    assert client.put(f"/api/video/projects/{pid}/settings", json={"style": "phone"}).status_code == 400
    preview = client.get("/api/video/styles/steps/preview")
    assert preview.status_code == 200 and preview.headers["content-type"] == "image/jpeg"
    assert client.get("/api/video/styles/nope/preview").status_code == 404


def test_access_is_limited_to_the_allowed_phone(monkeypatch):
    from types import SimpleNamespace
    import asyncio

    class Db:
        async def get(self, model, key):
            return SimpleNamespace(phone={"yes": "09912031272", "no": "09120000000", "plus": "+989912031272"}.get(key))

    check = lambda key: asyncio.run(router_module._has_access({"sub": key}, Db()))
    assert check("yes") and check("plus") and not check("no") and not check("missing")
    monkeypatch.setattr(router_module, "VIDEO_PHONES", {"09120000000"})
    assert check("no") and not check("yes")

    with pytest.raises(router_module.HTTPException) as denied:
        asyncio.run(router_module.video_customer({"sub": "yes"}, Db()))
    assert denied.value.status_code == 403
