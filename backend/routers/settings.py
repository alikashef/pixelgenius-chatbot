import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_admin
from database import get_db
from schemas import AISettingsOut, AISettingsUpdateIn
from services.ai_settings import get_ai_settings, update_ai_settings
from services.images import generate_image, image_config

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


class ImageTestIn(BaseModel):
    prompt: str


@router.post("/settings/ai/test-image")
async def test_image_generation(
    body: ImageTestIn,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    from lib.ai.analyze_lead import _base_urls

    config = image_config(await get_ai_settings(db))
    url = await generate_image(body.prompt, config, _base_urls(), os.getenv("GAPGPT_API_KEY", ""))
    if not url:
        raise HTTPException(status_code=502, detail="تولید تصویر ناموفق بود؛ مدل و کلید API را بررسی کنید")
    return {"url": url, "model": config["model"]}
