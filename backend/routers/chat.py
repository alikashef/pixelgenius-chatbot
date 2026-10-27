import logging
import base64
import re
import shutil
import uuid
import stat
import time
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from zipfile import ZipFile, BadZipFile
from urllib.parse import urlsplit

from fastapi import APIRouter, Body, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from lib.ai.analyze_lead import analyze_lead
from models import ChatSession, Freelancer
from services import workspace
from schemas import ChatAttachmentIn, ChatRequest, ChatResponse, ChatSessionCreateIn, ChatSessionCreateOut, ChatSessionUpdateIn, OrderFileOut
from services.ai_settings import get_ai_settings

router = APIRouter()
logger = logging.getLogger(__name__)
CHAT_UPLOAD_DIR = Path("/app/uploads/chat-files")
CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_ROOT = Path("/app/uploads")
MAX_TEXT_CHARS = 20000
MAX_IMAGE_BYTES = 5 * 1024 * 1024
TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".log", ".xml", ".html", ".css", ".js", ".ts", ".tsx", ".py", ".svg"}
VISION_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}



_chat_progress: dict[str, tuple[str, float]] = {}
PROGRESS_TTL_SECONDS = 600


def _set_progress(progress_id: str | None, stage: str) -> None:
    if not progress_id:
        return
    now = time.monotonic()
    for key in [key for key, (_, updated) in _chat_progress.items() if now - updated > PROGRESS_TTL_SECONDS]:
        _chat_progress.pop(key, None)
    if progress_id not in _chat_progress and len(_chat_progress) >= 1000:
        _chat_progress.pop(next(iter(_chat_progress)))
    _chat_progress[progress_id] = (stage, now)


@router.get("/chat/progress/{progress_id}")
async def chat_progress(progress_id: uuid.UUID):
    entry = _chat_progress.get(str(progress_id))
    if not entry or time.monotonic() - entry[1] > PROGRESS_TTL_SECONDS:
        raise HTTPException(404, "وضعیت درخواست در دسترس نیست")
    from fastapi.responses import JSONResponse
    return JSONResponse({"stage": entry[0]}, headers={"Cache-Control": "no-store"})

def _attachment_path(attachment: ChatAttachmentIn) -> Path | None:
    if not attachment.url.startswith("/uploads/"):
        return None
    relative = attachment.url.removeprefix("/uploads/")
    path = (UPLOAD_ROOT / relative).resolve()
    if UPLOAD_ROOT.resolve() not in path.parents and path != UPLOAD_ROOT.resolve():
        return None
    return path if path.exists() and path.is_file() else None


def _extract_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        text = "\n".join(page.extract_text() or "" for page in reader.pages[:10])
        return text.strip()
    except Exception as e:
        logger.warning("PDF text extraction failed for %s: %s", path, e)
        return ""


def _extract_docx_text(path: Path) -> str:
    try:
        with ZipFile(path) as docx:
            xml = docx.read("word/document.xml").decode("utf-8", errors="ignore")
        xml = xml.replace("</w:p>", "\n").replace("<w:tab/>", "\t").replace("<w:br/>", "\n")
        return re.sub(r"<[^>]+>", "", xml).strip()
    except Exception as e:
        logger.warning("DOCX text extraction failed for %s: %s", path, e)
        return ""



MAX_SOURCE_ZIP_BYTES = 12 * 1024 * 1024


def _source_zip_entries(archive: ZipFile):
    entries = archive.infolist()
    if not any(not entry.is_dir() for entry in entries) or len(entries) > 400:
        raise ValueError("فایل ZIP باید حداکثر ۴۰۰ فایل و پوشه داشته باشد")
    if sum(entry.file_size for entry in entries) > MAX_SOURCE_ZIP_BYTES:
        raise ValueError("حجم سورس پس از بازشدن ZIP باید حداکثر ۱۲ مگابایت باشد")
    for entry in entries:
        path = PurePosixPath(entry.filename)
        if path.is_absolute() or ".." in path.parts or "\\" in entry.filename or stat.S_ISLNK(entry.external_attr >> 16) or entry.flag_bits & 1:
            raise ValueError("ZIP باید بدون رمز و شامل فایل‌های سورس با مسیرهای معتبر باشد")
    return entries


def _source_zip_context(path: Path) -> str:
    with ZipFile(path) as archive:
        entries = _source_zip_entries(archive)
        names = [entry.filename for entry in entries if not entry.is_dir()]
        blocks = ["فهرست فایل‌های سورس ZIP:\n" + "\n".join(names)[:5000]]
        priority = {"package.json", "requirements.txt", "pyproject.toml", "Dockerfile", "README.md", "compose.yml", "docker-compose.yml"}
        remaining = MAX_TEXT_CHARS
        for entry in sorted(entries, key=lambda e: (PurePosixPath(e.filename).name not in priority, e.filename)):
            parts = PurePosixPath(entry.filename).parts
            name = parts[-1] if parts else ""
            if entry.is_dir() or any(part in {"node_modules", ".git", ".next", "__MACOSX"} for part in parts) or name == ".env" or name.startswith(".env."):
                continue
            if name not in priority and PurePosixPath(name).suffix.lower() not in TEXT_EXTENSIONS:
                continue
            if remaining <= 0:
                break
            with archive.open(entry) as source:
                text = source.read(min(remaining, 6000)).decode("utf-8", errors="replace")
            blocks.append(f"فایل {entry.filename}:\n{text}")
            remaining -= len(text)
        return "\n\n".join(blocks)


def validate_project_source(source_type: str | None, source_url: str, source_file: ChatAttachmentIn | None) -> str:
    kind = source_type or ("github" if source_url else "zip" if source_file else None)
    if kind == "github":
        workspace.url(source_url)
        parsed = urlsplit(source_url)
        if parsed.scheme != "https" or parsed.hostname not in ("github.com", "www.github.com") or len(parsed.path.strip("/").split("/")) < 2:
            raise HTTPException(422, "لینک معتبر مخزن GitHub را وارد کنید")
    elif kind == "zip":
        if not source_file or not source_file.name.lower().endswith(".zip"):
            raise HTTPException(422, "فایل ZIP سورس را بارگذاری کنید")
        path = _attachment_path(source_file)
        if not path or path.stat().st_size > MAX_SOURCE_ZIP_BYTES:
            raise HTTPException(422, "فایل ZIP معتبر و حداکثر ۱۲ مگابایت لازم است")
        try:
            with ZipFile(path) as archive:
                _source_zip_entries(archive)
        except (BadZipFile, ValueError, OSError) as exc:
            raise HTTPException(422, str(exc) if isinstance(exc, ValueError) else "فایل ZIP معتبر نیست") from exc
    else:
        raise HTTPException(422, "لینک GitHub یا فایل ZIP سورس را مشخص کنید")
    return kind

def _extract_attachment_text(path: Path, attachment: ChatAttachmentIn) -> str:
    ext = path.suffix.lower()
    content_type = attachment.content_type or ""
    if ext in TEXT_EXTENSIONS or content_type.startswith("text/"):
        return path.read_text(encoding="utf-8", errors="ignore").strip()
    if ext == ".zip":
        return _source_zip_context(path)
    if ext == ".pdf" or content_type == "application/pdf":
        return _extract_pdf_text(path)
    if ext == ".docx" or content_type.endswith("wordprocessingml.document"):
        return _extract_docx_text(path)
    return ""


def _build_attachment_context(attachments: list[ChatAttachmentIn]) -> tuple[str, list[dict]]:
    text_blocks: list[str] = []
    image_parts: list[dict] = []

    for attachment in attachments[:6]:
        path = _attachment_path(attachment)
        if not path:
            text_blocks.append(f"فایل {attachment.name}: فایل روی سرور پیدا نشد یا مسیر نامعتبر است.")
            continue

        content_type = attachment.content_type or ""
        if content_type in VISION_IMAGE_TYPES and path.stat().st_size <= MAX_IMAGE_BYTES:
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            image_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{content_type};base64,{data}"},
                }
            )
            text_blocks.append(f"تصویر پیوست شده: {attachment.name}")
            continue

        extracted = _extract_attachment_text(path, attachment)
        if extracted:
            text_blocks.append(f"محتوای فایل {attachment.name}:\n{extracted[:MAX_TEXT_CHARS]}")
        else:
            text_blocks.append(
                f"فایل پیوست شده: {attachment.name} ({content_type or 'unknown'}). متن قابل استخراج از این فایل پیدا نشد."
            )

    if not text_blocks and not image_parts:
        return "", []

    context = "کاربر همراه این پیام فایل فرستاده است. از محتوای زیر و تصاویر پیوست برای پاسخ استفاده کن:\n\n"
    return context + "\n\n---\n\n".join(text_blocks), image_parts


def _merge_attachments(messages: list[dict], attachments: list[ChatAttachmentIn]) -> list[dict]:
    if not attachments or not messages:
        return messages

    attachment_text, image_parts = _build_attachment_context(attachments)
    if not attachment_text and not image_parts:
        return messages

    merged = [dict(message) for message in messages]
    for index in range(len(merged) - 1, -1, -1):
        if merged[index].get("role") == "user":
            original = str(merged[index].get("content") or "")
            content = f"{original}\n\n{attachment_text}" if attachment_text else original
            if image_parts:
                merged[index]["content"] = [{"type": "text", "text": content}] + image_parts
            else:
                merged[index]["content"] = content
            break
    return merged


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    if request.mode == "designer" and not request.bot_token and not request.project_path:
        raise HTTPException(422, "ابتدا مسیر پروژه را انتخاب کنید")
    workspace.url(request.source_url)
    source_kind = None
    source_attachments = list(request.attachments)
    if request.mode == "designer" and request.project_path == "source" and not request.bot_token:
        source_kind = validate_project_source(request.source_type, request.source_url, request.source_file)
        if source_kind == "zip":
            source_attachments = [request.source_file, *[item for item in source_attachments if item.url != request.source_file.url]]
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    progress_id = str(request.progress_id) if request.progress_id else None
    _set_progress(progress_id, "thinking")
    try:
        settings = await get_ai_settings(db)
        if request.mode == "designer" and not request.bot_token:
            settings["project_path"] = request.project_path
            settings["project_source_url"] = request.source_url if source_kind == "github" else ""
            settings["project_source_type"] = source_kind
        if request.bot_token:
            result = await db.execute(select(Freelancer).where(Freelancer.bot_token == request.bot_token))
            freelancer = result.scalar_one_or_none()
            if freelancer:
                settings.update({
                    "freelancer_name": freelancer.name or "",
                    "freelancer_position": freelancer.position or "",
                    "freelancer_services": freelancer.services or "",
                    "freelancer_price_range": freelancer.price_range or "",
                    "freelancer_timeline": freelancer.timeline or "",
                    "freelancer_note": freelancer.note or "",
                })
        if source_attachments:
            _set_progress(progress_id, "working")
        content = await analyze_lead(settings, _merge_attachments(messages, source_attachments), request.mode, request.finalize, on_stage=lambda stage: _set_progress(progress_id, stage))
        _set_progress(progress_id, "done")
        return ChatResponse(content=content)
    except HTTPException:
        _set_progress(progress_id, "error")
        raise
    except Exception as e:
        _set_progress(progress_id, "error")
        logger.error("Chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/session", response_model=ChatSessionCreateOut, status_code=201)
async def create_session(
    body: ChatSessionCreateIn | None = Body(default=None),
    db: AsyncSession = Depends(get_db),
):
    freelancer_id = None
    if body and body.bot_token:
        result = await db.execute(select(Freelancer).where(Freelancer.bot_token == body.bot_token))
        f = result.scalar_one_or_none()
        if f:
            freelancer_id = f.id
    session = ChatSession(freelancer_id=freelancer_id)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return ChatSessionCreateOut(id=session.id)


@router.patch("/chat/session/{session_id}", status_code=204)
async def update_session(
    session_id: str,
    body: ChatSessionUpdateIn,
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(ChatSession, session_id)
    if not session:
        return
    session.messages = [m.model_dump() for m in body.messages]
    if body.phone is not None:
        session.phone = body.phone
    if body.converted is not None:
        session.converted = body.converted
    if body.order_id is not None:
        session.order_id = body.order_id
    await db.commit()


@router.post("/chat/files", response_model=OrderFileOut)
async def upload_chat_file(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    original_name = Path(file.filename or "file").name
    ext = Path(original_name).suffix
    dest = CHAT_UPLOAD_DIR / f"{file_id}{ext}"
    try:
        with dest.open("wb") as f:
            if ext.lower() == ".zip":
                total = 0
                while chunk := file.file.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_SOURCE_ZIP_BYTES:
                        raise HTTPException(413, "حجم فایل ZIP باید حداکثر ۱۲ مگابایت باشد")
                    f.write(chunk)
            else:
                shutil.copyfileobj(file.file, f)
        if ext.lower() == ".zip":
            with ZipFile(dest) as archive:
                _source_zip_entries(archive)
                if archive.testzip():
                    raise ValueError("فایل ZIP خراب است")
    except (BadZipFile, ValueError, OSError, RuntimeError, HTTPException) as exc:
        dest.unlink(missing_ok=True)
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(422, str(exc) if isinstance(exc, ValueError) else "فایل ZIP معتبر نیست") from exc

    return OrderFileOut(
        id=file_id,
        name=original_name,
        url=f"/uploads/chat-files/{dest.name}",
        size=dest.stat().st_size,
        content_type=file.content_type,
        uploaded_by="customer",
        uploaded_at=datetime.now(timezone.utc),
    )
