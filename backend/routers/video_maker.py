import asyncio
import json
import logging
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import ALGORITHM, JWT_SECRET, get_current_customer, normalize_phone
from database import get_db
from models import Customer
from services import video_maker

router = APIRouter(prefix="/video", tags=["video"])
logger = logging.getLogger(__name__)

ROOT = Path("/app/uploads/video")
ROOT.mkdir(parents=True, exist_ok=True)
MAX_CLIP_BYTES = 200 * 1024 * 1024
MAX_LOGO_BYTES = 5 * 1024 * 1024
MAX_CLIPS = 8
CLIP_SUFFIXES = {".mp4", ".mov", ".m4v"}
LOGO_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
MEDIA_TTL = 3600
MEDIA_FILES = {"final.mp4", "poster.jpg", "cover.jpg"}
RENDER_SLOTS = threading.BoundedSemaphore(2)
GREETING = "سلام! بگو این ویدیو برای چیه تا سناریوش رو با هم دربیاریم. حوزه‌ی کارت چیه و می‌خوای بیننده بعد از دیدنش چی‌کار کنه؟"
_lock = threading.Lock()


# Early access: only these phone numbers may use the video maker; everyone else sees "coming soon".
VIDEO_PHONES = {normalize_phone(p) for p in (os.getenv("VIDEO_PHONES") or "09912031272").split(",") if p.strip()}


async def _has_access(customer: dict, db: AsyncSession) -> bool:
    row = await db.get(Customer, customer["sub"])
    return bool(row and row.phone and normalize_phone(row.phone) in VIDEO_PHONES)


async def video_customer(customer: dict = Depends(get_current_customer), db: AsyncSession = Depends(get_db)) -> dict:
    if not await _has_access(customer, db):
        raise HTTPException(status_code=403, detail="ویدیوساز به‌زودی برای همه فعال می‌شود")
    return customer


@router.get("/access")
async def access(customer: dict = Depends(get_current_customer), db: AsyncSession = Depends(get_db)):
    return {"allowed": await _has_access(customer, db)}


class ProjectIn(BaseModel):
    title: str = Field(default="ویدیوی جدید", max_length=80)
    duration: int = Field(default=30)


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ReviseIn(BaseModel):
    request: str = Field(min_length=2, max_length=500)


class SceneIn(BaseModel):
    kind: str = "body"
    title: str = Field(default="", max_length=60)
    text: str = Field(default="", max_length=200)
    highlight: str = Field(default="", max_length=60)
    narration: str = Field(default="", max_length=400)
    duration: float = 4
    asset: int | None = None


class ScenarioIn(BaseModel):
    title: str = Field(default="", max_length=120)
    scenes: list[SceneIn] = Field(min_length=1, max_length=video_maker.MAX_SCENES)


class SettingsIn(BaseModel):
    format: str | None = None
    style: str | None = None
    voice: str | None = None
    speed: str | None = None
    subtitle_mode: str | None = None
    subtitle_pos: str | None = None
    cover_title: str | None = None
    duration: int | None = None


def _id(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{32}", value):
        raise HTTPException(status_code=404, detail="پروژه پیدا نشد")
    return value


def _dir(customer: dict, project_id: str) -> Path:
    path = ROOT / customer["sub"] / _id(project_id)
    if not (path / "project.json").exists():
        raise HTTPException(status_code=404, detail="پروژه پیدا نشد")
    return path


def _load(path: Path) -> dict:
    with _lock:
        return json.loads((path / "project.json").read_text(encoding="utf-8"))


def _save(path: Path, project: dict) -> None:
    project["updated_at"] = int(time.time())
    with _lock:
        tmp = path / "project.json.tmp"
        tmp.write_text(json.dumps(project, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path / "project.json")


def _sign(customer_id: str, project_id: str, rel: str) -> str:
    return jwt.encode({"scope": "video-media", "sub": customer_id, "p": project_id, "f": rel, "exp": int(time.time()) + MEDIA_TTL}, JWT_SECRET, algorithm=ALGORITHM)


def _is_ready(project: dict) -> bool:
    return bool(project["scenario"] and project["info"].get("brand") and project["info"].get("cta"))


def _public(customer: dict, project: dict) -> dict:
    def media(rel: str) -> str:
        return f"/api/video/media/{project['id']}/{rel}?t={_sign(customer['sub'], project['id'], rel)}"

    versions = [
        {**v, "video_url": media(f"v{v['n']}/final.mp4"), "poster_url": media(f"v{v['n']}/poster.jpg"), "cover_url": media(f"v{v['n']}/cover.jpg")}
        for v in project["versions"] if v["status"] == "done"
    ]
    failed = [v for v in project["versions"] if v["status"] == "failed"]
    keys = ("id", "title", "settings", "info", "messages", "quick_replies", "scenario", "clips", "status", "stage", "error", "created_at", "updated_at")
    return {
        **{k: project[k] for k in keys},
        "has_logo": bool(project.get("logo")),
        "styles": [{"value": key, **{k: v[k] for k in ("label", "hint", "credits", "clips", "category")}} for key, v in video_maker.STYLE_CATALOG.items()],
        "ready": _is_ready(project),
        "estimate": video_maker.estimate_cost(project),
        "edits": {"used": sum(1 for v in project["versions"] if v.get("kind") == "edit" and v["status"] == "done"), "included": video_maker.INCLUDED_EDITS},
        "versions": versions,
        "last_failure": failed[-1].get("error") if failed else None,
    }


@router.post("/projects")
async def create_project(body: ProjectIn, customer: dict = Depends(video_customer)):
    project_id = uuid.uuid4().hex
    path = ROOT / customer["sub"] / project_id
    (path / "clips").mkdir(parents=True)
    now = int(time.time())
    settings = {**video_maker.DEFAULT_SETTINGS, "duration": body.duration if body.duration in video_maker.DURATIONS else 30}
    project = {"id": project_id, "title": body.title, "settings": settings, "info": {}, "scenario": None, "clips": [], "logo": None,
               "messages": [{"role": "assistant", "content": GREETING}], "quick_replies": [], "versions": [], "status": "draft",
               "stage": None, "error": None, "created_at": now, "updated_at": now}
    _save(path, project)
    return _public(customer, project)


@router.get("/projects")
async def list_projects(customer: dict = Depends(video_customer)):
    base = ROOT / customer["sub"]
    items = []
    if base.exists():
        for p in base.iterdir():
            if (p / "project.json").exists():
                items.append(_public(customer, _load(p)))
    return sorted(items, key=lambda x: x["updated_at"], reverse=True)


@router.get("/projects/{project_id}")
async def get_project(project_id: str, customer: dict = Depends(video_customer)):
    return _public(customer, _load(_dir(customer, project_id)))


def _busy(project: dict) -> None:
    if project["status"] == "rendering":
        raise HTTPException(status_code=409, detail="ویدیو در حال ساخت است")


async def _store(upload: UploadFile, target: Path, limit: int, too_big: str) -> None:
    size = 0
    with target.open("wb") as out:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > limit:
                out.close()
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail=too_big)
            out.write(chunk)


@router.post("/projects/{project_id}/clips")
async def upload_clip(project_id: str, file: UploadFile = File(...), customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in CLIP_SUFFIXES:
        raise HTTPException(status_code=400, detail="فقط فایل MP4 یا MOV پشتیبانی می‌شود")
    if len(project["clips"]) >= MAX_CLIPS:
        raise HTTPException(status_code=400, detail=f"حداکثر {MAX_CLIPS} کلیپ مجاز است")
    index = len(project["clips"])
    target = path / "clips" / f"{index}{suffix}"
    await _store(file, target, MAX_CLIP_BYTES, "حجم کلیپ بیشتر از ۲۰۰ مگابایت است")
    try:
        info = await asyncio.to_thread(video_maker.probe, target)
    except video_maker.VideoError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc))
    if not info["width"]:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="فایل ویدیو قابل خواندن نیست")
    project["clips"].append({"index": index, "name": (file.filename or "clip")[:80], "file": target.name, "width": info["width"], "height": info["height"], "duration": round(info["duration"], 1)})
    _save(path, project)
    return _public(customer, project)


@router.delete("/projects/{project_id}/clips/{index}")
async def delete_clip(project_id: str, index: int, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    if project["versions"]:
        raise HTTPException(status_code=409, detail="بعد از ساخت ویدیو نمی‌شود کلیپ را حذف کرد")
    if not 0 <= index < len(project["clips"]):
        raise HTTPException(status_code=404, detail="کلیپ پیدا نشد")
    (path / "clips" / project["clips"][index]["file"]).unlink(missing_ok=True)
    del project["clips"][index]
    for i, clip in enumerate(project["clips"]):
        old = path / "clips" / clip["file"]
        new = old.with_name(f"{i}{old.suffix}")
        if old != new:
            old.rename(new)
        clip.update(index=i, file=new.name)
    if project["scenario"]:
        for scene in project["scenario"]["scenes"]:
            if scene["asset"] is not None and scene["asset"] >= len(project["clips"]):
                scene["asset"] = None
    _save(path, project)
    return _public(customer, project)


@router.post("/projects/{project_id}/logo")
async def upload_logo(project_id: str, file: UploadFile = File(...), customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in LOGO_SUFFIXES:
        raise HTTPException(status_code=400, detail="لوگو باید PNG یا JPG باشد")
    target = path / f"logo{suffix}"
    await _store(file, target, MAX_LOGO_BYTES, "حجم لوگو بیشتر از ۵ مگابایت است")
    try:
        info = await asyncio.to_thread(video_maker.probe, target)
    except video_maker.VideoError:
        info = {"width": 0}
    if not info["width"]:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="فایل لوگو قابل خواندن نیست")
    if project.get("logo") and project["logo"] != target.name:
        (path / project["logo"]).unlink(missing_ok=True)
    project["logo"] = target.name
    project["logo_name"] = (file.filename or "logo")[:80]
    _save(path, project)
    return _public(customer, project)


@router.post("/projects/{project_id}/chat")
async def chat(project_id: str, body: ChatIn, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    try:
        turn = await video_maker.chat_turn(project, body.message.strip())
    except video_maker.VideoError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    project = _load(path)
    project["messages"] += [{"role": "user", "content": body.message.strip()}, {"role": "assistant", "content": turn["reply"]}]
    project["quick_replies"] = turn["quick_replies"]
    info = turn["info"]
    for key in ("brand", "cta", "format_reason", "style_reason"):
        if key in info:
            project["info"][key] = info[key]
    if "format" in info and "format_set" not in project["info"]:
        project["settings"]["format"] = info["format"]
    if "style" in info and "style_set" not in project["info"]:
        project["settings"]["style"] = info["style"]
    if turn["scenario"]:
        project["scenario"] = turn["scenario"]
        if not project["settings"]["cover_title"]:
            project["info"]["cover_title_auto"] = True
    if video_maker.STYLE_CATALOG[project["settings"]["style"]]["clips"] > len(project["clips"]):
        project["settings"]["style"] = "typography"
    _save(path, project)
    return _public(customer, project)


@router.put("/projects/{project_id}/scenario")
async def edit_scenario(project_id: str, body: ScenarioIn, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    try:
        project["scenario"] = video_maker.normalize_scenario(body.model_dump(), len(project["clips"]))
    except video_maker.VideoError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    _save(path, project)
    return _public(customer, project)


@router.put("/projects/{project_id}/settings")
async def edit_settings(project_id: str, body: SettingsIn, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    patch = body.model_dump(exclude_none=True)
    needs = video_maker.STYLE_CATALOG.get(patch.get("style"), {}).get("clips", 0)
    if needs > len(project["clips"]):
        raise HTTPException(status_code=400, detail=f"این سبک {needs} کلیپ می‌خواهد؛ اول در گفتگو کلیپ بفرستید")
    project["settings"] = video_maker.clean_settings(patch, project["settings"])
    if "format" in patch:
        project["info"]["format_set"] = True
    if "style" in patch:
        project["info"]["style_set"] = True
    _save(path, project)
    return _public(customer, project)


def _render_job(path: Path, number: int) -> None:
    try:
        with RENDER_SLOTS:
            project = _load(path)
            clips = [path / "clips" / c["file"] for c in project["clips"]]
            logo = path / project["logo"] if project.get("logo") else None
            info = video_maker.render(project["scenario"], project["settings"], clips, logo, path / f"v{number}", path / "audio")
        project = _load(path)
        next(v for v in project["versions"] if v["n"] == number).update(status="done", info=info, finished_at=int(time.time()))
        project.update(status="ready", stage=None, error=None)
    except video_maker.VideoError as exc:
        project = _fail(path, number, str(exc))
    except Exception:
        logger.exception("Video render crashed")
        project = _fail(path, number, "خطای غیرمنتظره در ساخت ویدیو")
    _save(path, project)


def _fail(path: Path, number: int, message: str) -> dict:
    project = _load(path)
    next(v for v in project["versions"] if v["n"] == number).update(status="failed", error=message)
    project.update(status="failed", stage=None, error=message)
    return project


def _begin_render(path: Path, project: dict, kind: str, note: str = "") -> None:
    number = len(project["versions"]) + 1
    project["versions"].append({"n": number, "kind": kind, "note": note, "status": "rendering", "scenario": project["scenario"],
                                "settings": project["settings"], "created_at": int(time.time())})
    project.update(status="rendering", stage="rendering", error=None)
    _save(path, project)
    threading.Thread(target=_render_job, args=(path, number), daemon=True).start()


@router.post("/projects/{project_id}/render")
async def start_render(project_id: str, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    if not _is_ready(project):
        raise HTTPException(status_code=400, detail="اول با دستیار سناریو را کامل کنید (نام برند و دعوت به اقدام لازم است)")
    _begin_render(path, project, "initial", "ساخت اولیه")
    return _public(customer, project)


@router.post("/projects/{project_id}/revise")
async def revise(project_id: str, body: ReviseIn, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    if not project["versions"]:
        raise HTTPException(status_code=400, detail="اول ویدیو را بسازید")
    try:
        result = await video_maker.revise(project, body.request.strip())
    except video_maker.VideoError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    if result["scenario"] is None and result["settings"] == project["settings"]:
        raise HTTPException(status_code=422, detail=result["reply"] or "این تغییر با امکانات فعلی ممکن نیست")
    project = _load(path)
    if result["scenario"]:
        project["scenario"] = result["scenario"]
    project["settings"] = result["settings"]
    _begin_render(path, project, "edit", result["reply"] or body.request.strip())
    return _public(customer, project)


@router.post("/projects/{project_id}/rollback/{number}")
async def rollback(project_id: str, number: int, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    version = next((v for v in project["versions"] if v["n"] == number and v["status"] == "done"), None)
    if version is None:
        raise HTTPException(status_code=404, detail="نسخه پیدا نشد")
    project["scenario"], project["settings"] = version["scenario"], version["settings"]
    _save(path, project)
    return _public(customer, project)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    _busy(_load(path))
    shutil.rmtree(path)
    return {"ok": True}


@router.get("/voices")
async def voices(customer: dict = Depends(video_customer)):
    return [{"value": key, "label": label} for key, label in video_maker.VOICE_LABELS.items()]


@router.get("/voices/{voice}/preview")
async def voice_preview(voice: str, customer: dict = Depends(video_customer)):
    try:
        path = await asyncio.to_thread(video_maker.voice_preview, voice, ROOT / "_previews")
    except video_maker.VideoError as exc:
        raise HTTPException(status_code=502 if voice in video_maker.VOICES else 404, detail=str(exc))
    return FileResponse(path, media_type="audio/mpeg")


@router.get("/styles/{style}/preview")
async def style_preview(style: str, customer: dict = Depends(video_customer)):
    try:
        path = await asyncio.to_thread(video_maker.style_preview, style, ROOT / "_previews")
    except video_maker.VideoError as exc:
        raise HTTPException(status_code=404 if style not in video_maker.STYLE_CATALOG else 502, detail=str(exc))
    return FileResponse(path, media_type="image/jpeg")


@router.get("/media/{project_id}/{version}/{name}")
async def media(project_id: str, version: str, name: str, t: str = Query(...), download: bool = False):
    try:
        claims = jwt.decode(t, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=403, detail="لینک منقضی شده است")
    rel = f"{version}/{name}"
    if claims.get("scope") != "video-media" or claims.get("p") != project_id or claims.get("f") != rel:
        raise HTTPException(status_code=403, detail="دسترسی مجاز نیست")
    if not re.fullmatch(r"v\d+", version) or name not in MEDIA_FILES:
        raise HTTPException(status_code=404, detail="فایل پیدا نشد")
    file = ROOT / claims["sub"] / _id(project_id) / version / name
    if not file.exists():
        raise HTTPException(status_code=404, detail="فایل پیدا نشد")
    download_name = f"pixelgenius-{version}-{name}" if download else None
    return FileResponse(file, media_type="video/mp4" if name.endswith(".mp4") else "image/jpeg", filename=download_name)
