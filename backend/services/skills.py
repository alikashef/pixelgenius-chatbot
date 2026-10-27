import asyncio
import hashlib
import io
import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from config.default_skills import DEFAULT_SKILLS, SKILL_CATEGORIES
from database import SessionLocal
from models import AISkill, AISkillChunk
from prompts.knowledge_base import _embed, _idea_text, _normalize, _user_texts, _cosine

logger = logging.getLogger(__name__)

CATEGORY_KEYS = [c["key"] for c in SKILL_CATEGORIES]
CATEGORY_LABELS = {c["key"]: c["label"] for c in SKILL_CATEGORIES}
ALLOWED_EXTENSIONS = {".md", ".markdown", ".txt", ".json", ".csv", ".pdf"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
CHUNK_CHARS = 1100
CHUNK_OVERLAP = 150
MAX_CONTEXT_CHARS = 6000
DEFAULT_TOP_K = 2
EMBED_BATCH = 32

_query_vectors: dict[str, list[float]] = {}
_pending: dict[str, asyncio.Task] = {}


def extract_text(filename: str, data: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n\n".join((page.extract_text() or "") for page in reader.pages).strip()
    text = data.decode("utf-8", errors="ignore")
    if name.endswith(".json"):
        try:
            text = json.dumps(json.loads(text), ensure_ascii=False, indent=2)
        except ValueError:
            pass
    return text.replace("\x00", "").strip()


def chunk_text(text: str, size: int = CHUNK_CHARS, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """Split on markdown headings and paragraphs, then pack into ~size-char chunks with a small overlap."""
    blocks = [b.strip() for b in re.split(r"\n{2,}|(?=^#{1,3} )", text, flags=re.MULTILINE) if b.strip()]
    chunks: list[str] = []
    current = ""
    for block in blocks:
        while len(block) > size:
            cut = max(block.rfind(". ", 0, size), block.rfind("\n", 0, size), block.rfind("؛", 0, size))
            cut = cut + 1 if cut > size // 2 else size
            if current:
                chunks.append(current)
                current = ""
            chunks.append(block[:cut].strip())
            block = block[max(cut - overlap, 0):].strip() if cut > overlap else block[cut:].strip()
        if current and len(current) + len(block) + 2 > size:
            chunks.append(current)
            current = current[-overlap:] + "\n\n" + block if overlap else block
        else:
            current = f"{current}\n\n{block}" if current else block
    if current.strip():
        chunks.append(current.strip())
    return chunks


def parse_keywords(raw) -> list[str]:
    if isinstance(raw, str):
        raw = re.split(r"[,،\n]", raw)
    return [k.strip() for k in (raw or []) if isinstance(k, str) and k.strip()][:30]


def build_skill(category: str, title: str, content: str, keywords, source_name: str | None = None, builtin: bool = False) -> AISkill:
    skill = AISkill(
        category=category,
        title=title.strip()[:200],
        source_name=source_name,
        content=content,
        keywords=parse_keywords(keywords),
        builtin=builtin,
    )
    skill.chunks = [AISkillChunk(position=i, text=t) for i, t in enumerate(chunk_text(content))]
    return skill


async def seed_default_skills() -> None:
    async with SessionLocal() as db:
        existing = (await db.execute(select(AISkill.id).limit(1))).first()
        if existing:
            return
        for item in DEFAULT_SKILLS:
            db.add(build_skill(item["category"], item["title"], item["content"], item["keywords"], builtin=True))
        await db.commit()


async def embed_missing(base_urls: list[str], api_key: str, skill_id: str | None = None) -> int:
    """Embed every chunk that has no vector yet. Failures leave chunks keyword-only; they are retried on the next call."""
    if not api_key:
        return 0
    async with SessionLocal() as db:
        query = select(AISkillChunk)
        if skill_id:
            query = query.where(AISkillChunk.skill_id == skill_id)
        # a JSON column can hold SQL NULL or a JSON null, so filter in Python instead of IS NULL
        pending = [c for c in (await db.execute(query)).scalars().all() if not c.embedding]
        done = 0
        for start in range(0, len(pending), EMBED_BATCH):
            batch = pending[start:start + EMBED_BATCH]
            try:
                vectors = await _embed([c.text for c in batch], base_urls, api_key)
            except Exception as e:
                logger.warning("Skill embedding failed, keyword retrieval only: %s", e)
                break
            for chunk, vector in zip(batch, vectors):
                chunk.embedding = vector
            await db.commit()
            done += len(batch)
        return done


async def clear_embeddings(db) -> None:
    for chunk in (await db.execute(select(AISkillChunk))).scalars().all():
        chunk.embedding = None
    await db.commit()
    _query_vectors.clear()


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"\w+", _normalize(text)) if len(t) >= 3}


def _keyword_score(query_text: str, query_tokens: set[str], skill: AISkill, chunk: AISkillChunk) -> float:
    score = sum(3.0 for k in skill.keywords or [] if _normalize(k) in query_text)
    if query_tokens:
        score += 5.0 * len(query_tokens & _tokens(f"{skill.title} {chunk.text}")) / (len(query_tokens) ** 0.5 * 10)
    return score


async def _fill_query_vector(key: str, idea: str, base_urls: list[str], api_key: str) -> None:
    try:
        _query_vectors[key] = (await _embed([idea], base_urls, api_key))[0]
        if len(_query_vectors) > 300:
            _query_vectors.pop(next(iter(_query_vectors)))
    except Exception as e:
        logger.warning("Skill query embedding failed, using keywords: %s", e)
    finally:
        _pending.pop(key, None)


def _format(picked: dict[str, list[tuple[AISkill, AISkillChunk]]]) -> str:
    parts: list[str] = []
    used = 0
    for category in CATEGORY_KEYS:
        for skill, chunk in picked.get(category, []):
            piece = f"### [{CATEGORY_LABELS[category]}] {skill.title}\n{chunk.text.strip()}"
            if used + len(piece) > MAX_CONTEXT_CHARS:
                continue
            parts.append(piece)
            used += len(piece)
    if not parts:
        return ""
    return (
        "مهارت‌ها و دانش فنی تخصصی (راهنمای داخلی؛ متن را کپی نکن، فقط در تصمیم‌های طراحی، استک و داده لحاظ کن):\n\n"
        + "\n\n".join(parts)
    )


async def retrieve_skills(
    settings: dict, messages: list[dict], base_urls: list[str], api_key: str, wait: bool = False
) -> str:
    """Pick the best chunks per category for this conversation.

    Keyword scoring runs inline. The query embedding is computed once per project idea in the background
    (the gateway can take seconds), so the first turn uses keywords and later turns add vector similarity.
    """
    if settings.get("skills_enabled", True) is False:
        return ""
    top_k = int(settings.get("skills_top_k") or DEFAULT_TOP_K)

    async with SessionLocal() as db:
        rows = (
            await db.execute(select(AISkill).where(AISkill.enabled.is_(True)).options(selectinload(AISkill.chunks)))
        ).scalars().all()
    if not rows:
        return ""

    query_text = _normalize(" ".join(_user_texts(messages)[-6:]))
    query_tokens = _tokens(query_text)
    query_vector = None
    idea = _idea_text(messages)
    if idea and api_key:
        key = hashlib.sha1(_normalize(idea).encode()).hexdigest()
        query_vector = _query_vectors.get(key)
        if query_vector is None:
            task = _pending.get(key)
            if task is None:
                task = asyncio.create_task(_fill_query_vector(key, idea, base_urls, api_key))
                _pending[key] = task
            if wait:
                await asyncio.shield(task)
                query_vector = _query_vectors.get(key)

    picked: dict[str, list[tuple[AISkill, AISkillChunk]]] = {}
    for category in CATEGORY_KEYS:
        scored: list[tuple[float, AISkill, AISkillChunk]] = []
        for skill in rows:
            if skill.category != category:
                continue
            for chunk in skill.chunks:
                score = _keyword_score(query_text, query_tokens, skill, chunk)
                if query_vector is not None and chunk.embedding:
                    score += 10.0 * max(_cosine(query_vector, chunk.embedding) - 0.55, 0.0)
                if category == "general" and chunk.position == 0:
                    score += 1.0
                scored.append((score, skill, chunk))
        scored.sort(key=lambda item: -item[0])
        picked[category] = [(s, c) for score, s, c in scored[:top_k] if score >= 1.0]
    return _format(picked)
