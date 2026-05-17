import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from lib.ai.analyze_lead import analyze_lead
from schemas import ChatRequest, ChatResponse
from services.ai_settings import get_ai_settings

router = APIRouter()
logger = logging.getLogger(__name__)


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
