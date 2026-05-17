from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.default_ai_settings import DEFAULT_AI_SETTINGS
from models import AIConfig


async def get_ai_settings(db: AsyncSession) -> dict:
    settings = dict(DEFAULT_AI_SETTINGS)
    result = await db.execute(select(AIConfig))
    for row in result.scalars().all():
        settings[row.key] = row.value
    return settings


async def update_ai_settings(db: AsyncSession, settings: dict) -> dict:
    current = await get_ai_settings(db)
    merged = {**current, **settings}

    for key, value in settings.items():
        row = await db.get(AIConfig, key)
        if row:
            row.value = value
        else:
            db.add(AIConfig(key=key, value=value))

    await db.commit()
    return merged
