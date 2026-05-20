import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from lib.ai.analyze_lead import analyze_lead
from schemas import ChatRequest, ChatResponse, OrderFileOut
from services.ai_settings import get_ai_settings

router = APIRouter()
logger = logging.getLogger(__name__)
CHAT_UPLOAD_DIR = Path("/app/uploads/chat-files")
CHAT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    try:
        settings = await get_ai_settings(db)
        content = await analyze_lead(settings, messages)
        return ChatResponse(content=content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


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
