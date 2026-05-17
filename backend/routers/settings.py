from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_admin
from database import get_db
from schemas import AISettingsOut, AISettingsUpdateIn
from services.ai_settings import get_ai_settings, update_ai_settings

router = APIRouter()


@router.get("/settings/ai", response_model=AISettingsOut)
async def read_ai_settings(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    return AISettingsOut(settings=await get_ai_settings(db))


@router.put("/settings/ai", response_model=AISettingsOut)
async def save_ai_settings(
    body: AISettingsUpdateIn,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    return AISettingsOut(settings=await update_ai_settings(db, body.settings))
