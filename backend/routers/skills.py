import os
from datetime import datetime
from pathlib import PurePath

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_admin
from database import get_db
from lib.ai.analyze_lead import _base_urls
from models import AISkill
from services import skills as skills_service
from services.skills import ALLOWED_EXTENSIONS, CATEGORY_KEYS, MAX_UPLOAD_BYTES

router = APIRouter(prefix="/skills")


class SkillOut(BaseModel):
    id: str
    category: str
    title: str
    source_name: str | None
    keywords: list[str]
    enabled: bool
    builtin: bool
    chunk_count: int
    embedded_count: int
    size: int
    preview: str
    created_at: datetime


class SkillDetail(SkillOut):
    content: str


class SkillTextIn(BaseModel):
    category: str
    title: str
    content: str
    keywords: list[str] | str = []


class SkillPatchIn(BaseModel):
    category: str | None = None
    title: str | None = None
    content: str | None = None
    keywords: list[str] | str | None = None
    enabled: bool | None = None


def _out(skill: AISkill, detail: bool = False) -> SkillOut | SkillDetail:
    data = dict(
        id=skill.id,
        category=skill.category,
        title=skill.title,
        source_name=skill.source_name,
        keywords=skill.keywords or [],
        enabled=skill.enabled,
        builtin=skill.builtin,
        chunk_count=len(skill.chunks),
        embedded_count=sum(1 for c in skill.chunks if c.embedding),
        size=len(skill.content),
        preview=skill.content[:200],
        created_at=skill.created_at,
    )
    return SkillDetail(**data, content=skill.content) if detail else SkillOut(**data)


def _check_category(category: str) -> str:
    if category not in CATEGORY_KEYS:
        raise HTTPException(status_code=400, detail="دسته‌بندی نامعتبر است")
    return category


async def _load(db: AsyncSession, skill_id: str) -> AISkill:
    skill = (
        await db.execute(select(AISkill).where(AISkill.id == skill_id).options(selectinload(AISkill.chunks)))
    ).scalar_one_or_none()
    if not skill:
        raise HTTPException(status_code=404, detail="مهارت پیدا نشد")
    return skill


def _schedule_embedding(background: BackgroundTasks, skill_id: str | None = None) -> None:
    background.add_task(skills_service.embed_missing, _base_urls(), os.getenv("GAPGPT_API_KEY", ""), skill_id)


@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    from config.default_skills import SKILL_CATEGORIES

    rows = (await db.execute(select(AISkill.category, AISkill.enabled))).all()
    result = []
    for category in SKILL_CATEGORIES:
        mine = [enabled for key, enabled in rows if key == category["key"]]
        result.append({**category, "count": len(mine), "enabled_count": sum(1 for e in mine if e)})
    return result


@router.get("", response_model=list[SkillOut])
async def list_skills(
    category: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    query = select(AISkill).options(selectinload(AISkill.chunks)).order_by(AISkill.created_at.desc())
    if category:
        query = query.where(AISkill.category == _check_category(category))
    return [_out(s) for s in (await db.execute(query)).scalars().all()]


@router.get("/{skill_id}", response_model=SkillDetail)
async def get_skill(skill_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    return _out(await _load(db, skill_id), detail=True)


@router.post("/upload", response_model=SkillOut)
async def upload_skill(
    background: BackgroundTasks,
    category: str = Form(...),
    file: UploadFile = File(...),
    title: str = Form(""),
    keywords: str = Form(""),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    _check_category(category)
    filename = PurePath(file.filename or "skill.md").name
    if PurePath(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="فرمت فایل مجاز نیست (md, txt, json, csv, pdf)")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="حجم فایل بیشتر از ۵ مگابایت است")
    try:
        text = skills_service.extract_text(filename, data)
    except Exception:
        raise HTTPException(status_code=400, detail="خواندن فایل ممکن نشد")
    if len(text) < 20:
        raise HTTPException(status_code=400, detail="فایل متن قابل استفاده‌ای ندارد")

    skill = skills_service.build_skill(
        category, title.strip() or PurePath(filename).stem, text, keywords, source_name=filename
    )
    db.add(skill)
    await db.commit()
    skill = await _load(db, skill.id)
    _schedule_embedding(background, skill.id)
    return _out(skill)


@router.post("", response_model=SkillOut)
async def create_skill(
    body: SkillTextIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    _check_category(body.category)
    if not body.title.strip() or len(body.content.strip()) < 20:
        raise HTTPException(status_code=400, detail="عنوان و متن (حداقل ۲۰ کاراکتر) لازم است")
    skill = skills_service.build_skill(body.category, body.title, body.content.strip(), body.keywords)
    db.add(skill)
    await db.commit()
    skill = await _load(db, skill.id)
    _schedule_embedding(background, skill.id)
    return _out(skill)


@router.patch("/{skill_id}", response_model=SkillOut)
async def update_skill(
    skill_id: str,
    body: SkillPatchIn,
    background: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    skill = await _load(db, skill_id)
    reembed = False
    if body.category is not None:
        skill.category = _check_category(body.category)
    if body.title is not None and body.title.strip():
        skill.title = body.title.strip()[:200]
    if body.keywords is not None:
        skill.keywords = skills_service.parse_keywords(body.keywords)
    if body.enabled is not None:
        skill.enabled = body.enabled
    if body.content is not None and body.content.strip() != skill.content:
        if len(body.content.strip()) < 20:
            raise HTTPException(status_code=400, detail="متن خیلی کوتاه است")
        skill.content = body.content.strip()
        skill.chunks = skills_service.build_skill(skill.category, skill.title, skill.content, []).chunks
        reembed = True
    await db.commit()
    skill = await _load(db, skill_id)
    if reembed:
        _schedule_embedding(background, skill_id)
    return _out(skill)


@router.delete("/{skill_id}")
async def delete_skill(skill_id: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    await db.delete(await _load(db, skill_id))
    await db.commit()
    return {"ok": True}


@router.post("/reindex/all")
async def reindex_all(
    background: BackgroundTasks, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)
):
    await skills_service.clear_embeddings(db)
    _schedule_embedding(background)
    return {"ok": True}
