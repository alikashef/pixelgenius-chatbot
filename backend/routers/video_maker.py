import asyncio
import base64
import json
import logging
import os
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

from starlette.concurrency import run_in_threadpool
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import ALGORITHM, JWT_SECRET, get_current_customer, normalize_phone
from database import get_db
from services import credits
from models import Customer
from services import video_agent, video_maker

router = APIRouter(prefix="/video", tags=["video"])
logger = logging.getLogger(__name__)

ROOT = Path(os.getenv("UPLOADS_DIR", "/app/uploads") + "/video")
ROOT.mkdir(parents=True, exist_ok=True)
MAX_CLIP_BYTES = 200 * 1024 * 1024
MAX_LOGO_BYTES = 5 * 1024 * 1024
MAX_CLIPS = 8
CLIP_SUFFIXES = {".mp4", ".mov", ".m4v"}
LOGO_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".svg"}
MEDIA_TTL = 3600
MEDIA_FILES = {"final.mp4", "poster.jpg", "cover.jpg"}
MAX_ATTACH_BYTES = 20 * 1024 * 1024
MAX_IMAGE_BYTES = 5 * 1024 * 1024
FILE_TTL = 60 * 60 * 24 * 30
ATTACH_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg",
    ".mp4", ".mov", ".m4v", ".mp3", ".wav", ".m4a",
    ".pdf", ".doc", ".docx", ".txt", ".csv", ".zip", ".rar", ".ppt", ".pptx", ".xls", ".xlsx",
}
VISION_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
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


class AttachmentIn(BaseModel):
    name: str = Field(default="file", max_length=150)
    url: str
    size: int | None = None
    content_type: str | None = None


class ChatIn(BaseModel):
    message: str = Field(default="", max_length=2000)
    attachments: list[AttachmentIn] = Field(default_factory=list)


class CoverIn(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    ai: bool = False


class CoverChoiceIn(BaseModel):
    file: str = Field(max_length=80)


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


def _sign_file(customer_id: str, project_id: str, rel: str) -> str:
    return jwt.encode({"scope": "video-file", "sub": customer_id, "p": project_id, "f": rel, "exp": int(time.time()) + FILE_TTL}, JWT_SECRET, algorithm=ALGORITHM)


async def _clean_svg(target: Path) -> None:
    try:
        target.write_bytes(video_maker.sanitize_svg(target.read_bytes()))
    except video_maker.VideoError as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc))


def _attachment_file(path: Path, attachment: "AttachmentIn") -> Path:
    return path / "files" / attachment.url.split("/")[-1].split("?")[0]


async def _adopt_logo(path: Path, project: dict, attachment: "AttachmentIn") -> bool:
    """Make an image the customer sent in the chat the project's logo, with the same checks as the upload endpoint."""
    source = _attachment_file(path, attachment)
    suffix = source.suffix.lower()
    if suffix not in LOGO_SUFFIXES or not source.exists() or source.stat().st_size > MAX_LOGO_BYTES:
        return False
    target = path / f"logo{suffix}"
    await asyncio.to_thread(shutil.copyfile, source, target)
    if suffix == ".svg":
        try:
            target.write_bytes(video_maker.sanitize_svg(target.read_bytes()))
            info = {"width": 1}
        except video_maker.VideoError:
            info = {"width": 0}
    else:
        try:
            info = await asyncio.to_thread(video_maker.probe, target)
        except video_maker.VideoError:
            info = {"width": 0}
    if not info["width"]:
        target.unlink(missing_ok=True)
        return False
    if project.get("logo") and project["logo"] != target.name:
        (path / project["logo"]).unlink(missing_ok=True)
    project["logo"], project["logo_name"] = target.name, (attachment.name or "logo")[:80]
    return True


def _attachment_content(path: Path, message: str, attachments: list["AttachmentIn"]) -> str | list[dict]:
    """Plain text for the model, plus base64 image parts (OpenAI vision format) for any image attachment."""
    if not attachments:
        return message
    notes = []
    image_parts = []
    for number, a in enumerate(attachments[:6], 1):
        notes.append(f"{number}) {a.name}" + (" (فایل برداری SVG؛ دیده نمی‌شود ولی قابل استفاده به‌عنوان لوگو است)" if a.name.lower().endswith(".svg") else ""))
        if (a.content_type or "") in VISION_IMAGE_TYPES:
            fpath = _attachment_file(path, a)
            if fpath.exists() and fpath.stat().st_size <= MAX_IMAGE_BYTES:
                data = base64.b64encode(fpath.read_bytes()).decode("ascii")
                image_parts.append({"type": "image_url", "image_url": {"url": f"data:{a.content_type};base64,{data}"}})
    note_line = "فایل‌های پیوست‌شده: " + "، ".join(notes)
    text = f"{message}\n\n{note_line}" if message else note_line
    return [{"type": "text", "text": text}] + image_parts if image_parts else text


def _is_ready(project: dict) -> bool:
    return bool(project["scenario"] and project["info"].get("brand") and project["info"].get("cta"))


def _reference_source(path: Path, project: dict) -> tuple[Path, float] | None:
    """The customer's own footage a cover can be built from: their first clip, else the latest finished video."""
    for clip in project["clips"]:
        file = path / "clips" / clip["file"]
        if file.exists():
            return file, min(1.0, max(float(clip.get("duration") or 1) * 0.3, 0.1))
    for version in reversed(project["versions"]):
        file = path / f"v{version['n']}" / "final.mp4"
        if version["status"] == "done" and file.exists():
            return file, 1.2
    return None


def _reference_frame(path: Path, project: dict) -> Path | None:
    source = _reference_source(path, project)
    if source is None:
        return None
    out = path / "covers" / "_reference.jpg"
    out.parent.mkdir(exist_ok=True)
    video_maker._run(["ffmpeg", "-y", "-ss", f"{source[1]:.2f}", "-i", str(source[0]), "-frames:v", "1", "-q:v", "2", str(out)], timeout=60)
    return out if out.exists() else None


def _public(customer: dict, project: dict) -> dict:
    def media(rel: str) -> str:
        return f"/api/video/media/{project['id']}/{rel}?t={_sign(customer['sub'], project['id'], rel)}"

    has_reference = _reference_source(ROOT / customer["sub"] / project["id"], project) is not None
    versions = [
        {**v, "video_url": media(f"v{v['n']}/final.mp4"), "poster_url": media(f"v{v['n']}/poster.jpg"), "cover_url": media(f"v{v['n']}/cover.jpg")}
        for v in project["versions"] if v["status"] == "done"
    ]
    failed = [v for v in project["versions"] if v["status"] == "failed"]
    keys = ("id", "title", "settings", "info", "messages", "quick_replies", "scenario", "clips", "status", "stage", "error", "created_at", "updated_at")
    return {
        **{k: project[k] for k in keys},
        "has_logo": bool(project.get("logo")),
        "progress": project.get("progress") if project["status"] == "rendering" else None,
        "covers": {"title": (project.get("covers") or {}).get("title", ""), "chosen": (project.get("covers") or {}).get("chosen"), "price": video_maker.CREDIT_PRICES["cover_ai_ref" if has_reference else "cover_ai"], "has_reference": has_reference,
                   "options": [{"file": o["file"], "label": o["label"], "url": media(f"covers/{o['file']}")} for o in (project.get("covers") or {}).get("options", [])]},
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
        raise HTTPException(status_code=400, detail="لوگو باید PNG، JPG یا SVG باشد")
    target = path / f"logo{suffix}"
    await _store(file, target, MAX_LOGO_BYTES, "حجم لوگو بیشتر از ۵ مگابایت است")
    if suffix == ".svg":
        await _clean_svg(target)
        info = {"width": 1}  # a vector has no pixel size to probe; the sanitizer already checked it parses
    else:
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


@router.post("/projects/{project_id}/files")
async def upload_file(project_id: str, file: UploadFile = File(...), customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ATTACH_SUFFIXES:
        raise HTTPException(status_code=400, detail="این نوع فایل پشتیبانی نمی‌شود")
    (path / "files").mkdir(exist_ok=True)
    target = path / "files" / f"{uuid.uuid4().hex}{suffix}"
    await _store(file, target, MAX_ATTACH_BYTES, "حجم فایل بیشتر از ۲۰ مگابایت است")
    if suffix == ".svg":
        await _clean_svg(target)
    rel = f"files/{target.name}"
    return {
        "name": (file.filename or "file")[:150],
        "size": target.stat().st_size,
        "content_type": file.content_type,
        "url": f"/api/video/file/{project_id}/{target.name}?t={_sign_file(customer['sub'], project_id, rel)}",
    }


@router.get("/file/{project_id}/{name}")
async def get_file(project_id: str, name: str, t: str = Query(...)):
    try:
        claims = jwt.decode(t, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=403, detail="لینک منقضی شده است")
    rel = f"files/{name}"
    if claims.get("scope") != "video-file" or claims.get("p") != project_id or claims.get("f") != rel:
        raise HTTPException(status_code=403, detail="دسترسی مجاز نیست")
    file = ROOT / claims["sub"] / _id(project_id) / "files" / name
    if not file.exists():
        raise HTTPException(status_code=404, detail="فایل پیدا نشد")
    return FileResponse(file)


@router.post("/projects/{project_id}/chat")
async def chat(project_id: str, body: ChatIn, customer: dict = Depends(video_customer)):
    message = body.message.strip()
    if not message and not body.attachments:
        raise HTTPException(status_code=400, detail="متن یا فایلی برای ارسال لازم است")
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    content = _attachment_content(path, message, body.attachments)
    try:
        turn = await video_maker.chat_turn(project, content)
    except video_maker.VideoError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    project = _load(path)
    user_msg = {"role": "user", "content": message}
    if body.attachments:
        user_msg["attachments"] = [a.model_dump() for a in body.attachments]
    reply = turn["reply"]
    info = turn["info"]
    images = [a for a in body.attachments[:6] if (a.content_type or "") in VISION_IMAGE_TYPES or a.name.lower().endswith(".svg")]
    pick = info.get("logo_attachment")
    if pick is None and len(images) == 1 and not project.get("logo") and re.search(r"لوگو|آرم|logo", message, re.I):
        pick = body.attachments.index(images[0]) + 1  # the customer called it the logo even if the model did not mark it
    if isinstance(pick, int) and 1 <= pick <= len(body.attachments[:6]) and not await _adopt_logo(path, project, body.attachments[pick - 1]):
        reply += "\n\n(این فایل به‌عنوان لوگو خوانده نشد؛ لطفاً لوگو را به‌صورت PNG یا JPG زیر ۵ مگابایت بفرست.)"
    project["messages"] += [user_msg, {"role": "assistant", "content": reply}]
    project["quick_replies"] = turn["quick_replies"]
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


def _progress_writer(path: Path):
    last = {"percent": -1, "at": 0.0}

    def write(percent: int, label: str, eta: int | None) -> None:
        if percent == last["percent"] and time.time() - last["at"] < 6:
            return
        last.update(percent=percent, at=time.time())
        project = _load(path)
        project["progress"] = {"percent": percent, "label": label, "eta": eta}
        _save(path, project)
    return write


def _render_job(path: Path, number: int) -> None:
    started = time.time()
    logger.info("Render job v%d for project %s waiting for a slot", number, path.name[:8])
    try:
        with RENDER_SLOTS:
            logger.info("Render job v%d started", number)
            project = _load(path)
            clips = [path / "clips" / c["file"] for c in project["clips"]]
            logo = path / project["logo"] if project.get("logo") else None
            version = next(v for v in project["versions"] if v["n"] == number)
            previous = next((path / f"v{v['n']}" / "comp" / "index.html" for v in reversed(project["versions"]) if v["n"] < number and v["status"] == "done"
                             and (path / f"v{v['n']}" / "comp" / "index.html").exists()), None)
            info = video_agent.build(project["scenario"], project["settings"], clips, logo, path / f"v{number}", path / "audio",
                                     note=version["note"] if version["kind"] == "edit" else "", base_html=previous.read_text(encoding="utf-8") if previous else None,
                                     info=project.get("info"), progress=_progress_writer(path), cover_file=(path / "covers" / chosen) if (chosen := (project.get("covers") or {}).get("chosen")) else None)
        project = _load(path)
        next(v for v in project["versions"] if v["n"] == number).update(status="done", info=info, finished_at=int(time.time()))
        project.update(status="ready", stage=None, error=None, progress=None)
        logger.info("Render job v%d finished in %.0fs", number, time.time() - started)
    except video_maker.VideoError as exc:
        logger.warning("Render job v%d failed after %.0fs: %s", number, time.time() - started, exc)
        project = _fail(path, number, str(exc))
    except Exception:
        logger.exception("Video render crashed")
        project = _fail(path, number, "خطای غیرمنتظره در ساخت ویدیو")
    _save(path, project)


def _fail(path: Path, number: int, message: str) -> dict:
    project = _load(path)
    version = next(v for v in project["versions"] if v["n"] == number)
    version.update(status="failed", error=message)
    if version.get("charged") and not version.get("refunded"):
        try:
            credits.refund_in_thread(version["customer"], version["charged"], f"بازگشت کردیت ویدیو · نسخه {number}", f"{path.name}:v{number}")
            version["refunded"] = True
        except Exception:
            logger.exception("Video credit refund failed")
    project.update(status="failed", stage=None, error=message, progress=None)
    return project


def _begin_render(path: Path, project: dict, kind: str, note: str = "", charged: int = 0, customer_id: str = "") -> None:
    number = len(project["versions"]) + 1
    project["versions"].append({"n": number, "kind": kind, "note": note, "status": "rendering", "scenario": project["scenario"],
                                "settings": project["settings"], "created_at": int(time.time()), "charged": charged, "customer": customer_id})
    project.update(status="rendering", stage="rendering", error=None, progress={"percent": 1, "label": "در صف ساخت", "eta": None})
    _save(path, project)
    threading.Thread(target=_render_job, args=(path, number), daemon=True).start()


async def _pay(db: AsyncSession, customer: dict, amount: int, reason: str, project_id: str) -> None:
    if amount > 0 and not await run_in_threadpool(video_agent.check_quota):
        raise HTTPException(status_code=503, detail=video_agent.QUOTA_MESSAGE)
    try:
        await credits.charge(db, customer["sub"], amount, "video", reason, project_id)
    except credits.InsufficientCredits as exc:
        raise HTTPException(status_code=402, detail=f"موجودی کافی نیست: {exc.need} کردیت لازم است و {exc.have} داری. کیف پولت را شارژ کن")


@router.post("/projects/{project_id}/render")
async def start_render(project_id: str, customer: dict = Depends(video_customer), db: AsyncSession = Depends(get_db)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    if not _is_ready(project):
        raise HTTPException(status_code=400, detail="اول با دستیار سناریو را کامل کنید (نام برند و دعوت به اقدام لازم است)")
    cost = video_maker.estimate_cost(project)["total"]
    await _pay(db, customer, cost, f"ساخت ویدیو «{(project.get('scenario') or {}).get('title', '')[:60]}»", project_id)
    _begin_render(path, project, "initial", "ساخت اولیه", cost, customer["sub"])
    return _public(customer, project)


@router.post("/projects/{project_id}/revise")
async def revise(project_id: str, body: ReviseIn, customer: dict = Depends(video_customer), db: AsyncSession = Depends(get_db)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    if not project["versions"]:
        raise HTTPException(status_code=400, detail="اول ویدیو را بسازید")
    edit_cost = video_maker.CREDIT_PRICES["extra_edit"]
    if not await credits.has_credits(db, customer["sub"], edit_cost):
        raise HTTPException(status_code=402, detail=f"برای ویرایش {edit_cost} کردیت لازم است؛ کیف پولت را شارژ کن")
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
    await _pay(db, customer, edit_cost, "ویرایش ویدیو با دستیار", project_id)
    _begin_render(path, project, "edit", result["reply"] or body.request.strip(), edit_cost, customer["sub"])
    return _public(customer, project)


@router.post("/projects/{project_id}/covers")
async def make_covers(project_id: str, body: CoverIn, customer: dict = Depends(video_customer), db: AsyncSession = Depends(get_db)):
    path = _dir(customer, project_id)
    project = _load(path)
    _busy(project)
    if not project["scenario"]:
        raise HTTPException(status_code=400, detail="اول سناریو را کامل کنید")
    title = body.title.strip()
    logo = path / project["logo"] if project.get("logo") else None
    batch = uuid.uuid4().hex[:8]
    reference = await asyncio.to_thread(_reference_frame, path, project)
    if not body.ai:  # the no-AI cover is free and needs the customer's own footage
        if reference is None:
            raise HTTPException(status_code=400, detail="برای کاور رایگان یک کلیپ بفرست یا اول ویدیو را بساز؛ یا طرح هوش مصنوعی را بزن")
        try:
            options = [await asyncio.to_thread(video_agent.make_frame_cover, project, title, logo, reference, path / "covers", batch)]
        except video_maker.VideoError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        keep = [o for o in (project.get("covers") or {}).get("options", []) if o["model"] != "frame"]
    else:
        price = video_maker.CREDIT_PRICES["cover_ai_ref" if reference is not None else "cover_ai"]
        await _pay(db, customer, price, "ساخت کاور با هوش مصنوعی", project_id)
        try:
            options = await asyncio.to_thread(video_agent.make_cover_options, project, title, logo, path / "covers", batch, reference)
        except video_maker.VideoError as exc:
            try:
                credits.refund_in_thread(customer["sub"], price, "بازگشت کردیت ساخت کاور", project_id)
            except Exception:
                logger.exception("Cover credit refund failed")
            raise HTTPException(status_code=502, detail=str(exc))
        keep = [o for o in (project.get("covers") or {}).get("options", []) if o["model"] == "frame"]
    project = _load(path)
    chosen = (project.get("covers") or {}).get("chosen")
    merged = [*keep, *options]
    project["covers"] = {"title": title, "options": merged, "chosen": chosen if chosen in [o["file"] for o in merged] else None}
    project["settings"] = video_maker.clean_settings({"cover_title": title}, project["settings"])
    _save(path, project)
    return _public(customer, project)


@router.post("/projects/{project_id}/covers/choose")
async def choose_cover(project_id: str, body: CoverChoiceIn, customer: dict = Depends(video_customer)):
    path = _dir(customer, project_id)
    project = _load(path)
    covers = project.get("covers") or {}
    if body.file not in [o["file"] for o in covers.get("options", [])]:
        raise HTTPException(status_code=404, detail="کاور پیدا نشد")
    covers["chosen"] = body.file
    project["covers"] = covers
    done = [v for v in project["versions"] if v["status"] == "done"]
    if done:  # the video already exists: swap its cover right away
        shutil.copy(path / "covers" / body.file, path / f"v{done[-1]['n']}" / "cover.jpg")
    _save(path, project)
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
    if not (re.fullmatch(r"v\d+", version) and name in MEDIA_FILES) and not (version == "covers" and re.fullmatch(r"cover_[0-9a-f]+_(?:\d|f)\.jpg", name)):
        raise HTTPException(status_code=404, detail="فایل پیدا نشد")
    file = ROOT / claims["sub"] / _id(project_id) / version / name
    if not file.exists():
        raise HTTPException(status_code=404, detail="فایل پیدا نشد")
    download_name = f"pixelgenius-{version}-{name}" if download else None
    return FileResponse(file, media_type="video/mp4" if name.endswith(".mp4") else "image/jpeg", filename=download_name)
