import logging
import base64
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from lib.ai.analyze_lead import analyze_lead
from models import ChatSession
from schemas import ChatAttachmentIn, ChatRequest, ChatResponse, ChatSessionCreateOut, ChatSessionUpdateIn, OrderFileOut
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


def _extract_attachment_text(path: Path, attachment: ChatAttachmentIn) -> str:
    ext = path.suffix.lower()
    content_type = attachment.content_type or ""
    if ext in TEXT_EXTENSIONS or content_type.startswith("text/"):
        return path.read_text(encoding="utf-8", errors="ignore").strip()
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
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    try:
        settings = await get_ai_settings(db)
        content = await analyze_lead(settings, _merge_attachments(messages, request.attachments))
        return ChatResponse(content=content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/session", response_model=ChatSessionCreateOut, status_code=201)
async def create_session(db: AsyncSession = Depends(get_db)):
    session = ChatSession()
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
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    return OrderFileOut(
        id=file_id,
        name=original_name,
        url=f"/uploads/chat-files/{dest.name}",
        size=dest.stat().st_size,
        content_type=file.content_type,
        uploaded_by="customer",
        uploaded_at=datetime.now(timezone.utc),
    )
