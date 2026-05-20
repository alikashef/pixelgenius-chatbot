from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
import os
import json

from config.default_ai_settings import DEFAULT_AI_SETTINGS

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/freelance_intake")
# Convert psycopg2 URL to asyncpg
ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://")

engine = create_async_engine(ASYNC_DATABASE_URL, echo=False)
SessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with SessionLocal() as session:
        yield session


async def create_tables():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name VARCHAR(80)"))
        await conn.execute(text("ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name VARCHAR(80)"))
        await conn.execute(text("ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type VARCHAR(120)"))
        await conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS chat_history JSON"))
        await conn.execute(text("UPDATE orders SET chat_history = '[]'::json WHERE chat_history IS NULL"))
        await conn.execute(text("ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_files JSON"))
        await conn.execute(text("UPDATE orders SET order_files = '[]'::json WHERE order_files IS NULL"))
        for key, value in DEFAULT_AI_SETTINGS.items():
            await conn.execute(
                text(
                    """
                    INSERT INTO ai_configs (key, value, updated_at)
                    VALUES (:key, CAST(:value AS JSON), NOW())
                    ON CONFLICT (key) DO NOTHING
                    """
                ),
                {"key": key, "value": json.dumps(value, ensure_ascii=False)},
            )
