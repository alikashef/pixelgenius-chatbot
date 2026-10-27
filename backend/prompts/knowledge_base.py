import asyncio
import hashlib
import json
import logging
import math
import os
import re
from pathlib import Path

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)

KNOWLEDGE_BASE = [
    {
        "id": "landing",
        "keywords": ["لندینگ", "landing", "معرفی", "شرکتی", "رزومه", "نمونه کار", "پورتفولیو", "تک صفحه"],
        "content": (
            "الگوی سایت معرفی/لندینگ: صفحه‌ها Hero، خدمات، نمونه‌کار، نظرات، تماس. استک: Next.js (SSG) + Tailwind، فرم تماس با API سبک "
            "یا سرویس فرم، بدون دیتابیس سنگین؛ اگر مشتری خودش محتوا را تغییر می‌دهد CMS (Strapi/Sanity) یا پنل ساده. "
            "سوال‌های کلیدی: چه کسی محتوا را ویرایش می‌کند؟ فرم تماس به کجا برود (ایمیل/پیامک/CRM)؟ چندزبانه؟ سئو و بلاگ؟"
        ),
    },
    {
        "id": "store",
        "keywords": ["فروشگاه", "فروش آنلاین", "سبد خرید", "محصول", "shop", "store", "ecommerce", "ووکامرس", "woocommerce", "شاپیفای"],
        "content": (
            "الگوی فروشگاه: مدل‌ها User, Product, Category, Variant(رنگ/سایز), Cart, Order, OrderItem, Payment, Address, Coupon. "
            "endpointها: محصولات و فیلتر، سبد، ثبت سفارش، پرداخت و verify، پیگیری سفارش، پنل ادمین (محصول، موجودی، سفارش). "
            "استک: برای محصول کم و نیاز ساده WooCommerce/Shopify؛ برای منطق اختصاصی Next.js + FastAPI/Node + PostgreSQL. "
            "سوال‌های کلیدی: تعداد محصول؟ تنوع (سایز/رنگ)؟ درگاه پرداخت؟ روش ارسال و هزینه پست؟ موجودی و انبار؟ کد تخفیف؟ ورود با موبایل/OTP؟"
        ),
    },
    {
        "id": "booking",
        "keywords": ["رزرو", "نوبت", "نوبت دهی", "کلاس", "ثبت نام", "ثبت‌نام", "booking", "appointment", "باشگاه", "کلینیک", "آرایشگاه", "مشاوره"],
        "content": (
            "الگوی رزرو/نوبت‌دهی: مدل‌ها User, Service, Provider(مربی/پزشک), TimeSlot/Class, Booking(status), Payment. "
            "قوانین: ظرفیت، جلوگیری از رزرو همزمان، لغو و بازگشت وجه، یادآوری پیامکی. endpointها: لیست زمان‌های خالی، رزرو، لغو، پنل ادمین. "
            "استک: Next.js + FastAPI/Node + PostgreSQL، پیامک و درگاه. "
            "سوال‌های کلیدی: رزرو نیاز به پرداخت آنلاین دارد؟ ظرفیت و زمان لغو؟ هر ارائه‌دهنده تقویم جدا دارد؟ نقش‌ها (مشتری/ارائه‌دهنده/ادمین)؟"
        ),
    },
    {
        "id": "dashboard",
        "keywords": ["داشبورد", "پنل", "saas", "crm", "سیستم مدیریت", "گزارش", "dashboard", "ادمین", "اشتراک", "نقش"],
        "content": (
            "الگوی داشبورد/SaaS: احراز هویت (OTP/ایمیل)، نقش‌ها و دسترسی (RBAC)، جدول‌ها با فیلتر و صفحه‌بندی، نمودار و گزارش، اعلان. "
            "مدل‌ها: User, Organization/Workspace, Role, موجودیت‌های اصلی کسب‌وکار, AuditLog. اگر اشتراک دارد: Plan, Subscription, Invoice. "
            "استک: Next.js + FastAPI/Django/Node + PostgreSQL (+Redis برای صف/کش). "
            "سوال‌های کلیدی: چه نقش‌هایی؟ هر نقش چه می‌بیند؟ چند کاربر/سازمان؟ گزارش‌ها و خروجی Excel؟ اتصال به سیستم دیگر؟"
        ),
    },
    {
        "id": "content",
        "keywords": ["بلاگ", "مجله", "خبر", "مقاله", "محتوا", "وردپرس", "wordpress", "سئو", "blog", "cms"],
        "content": (
            "الگوی بلاگ/محتوا: برای تولید محتوای زیاد و سئو، WordPress یا headless CMS + Next.js. مدل‌ها Post, Category, Tag, Author, Comment. "
            "سوال‌های کلیدی: چند نویسنده؟ تایید قبل از انتشار؟ نظرات؟ خبرنامه؟ حجم محتوای اولیه برای انتقال؟"
        ),
    },
    {
        "id": "course",
        "keywords": ["دوره", "آموزش", "آموزشی", "ویدیو", "عضویت", "اشتراک", "lms", "course", "کلاس آنلاین", "آزمون"],
        "content": (
            "الگوی آموزش آنلاین: مدل‌ها User, Course, Lesson, Enrollment, Progress, Payment, Quiz. ویدیو را روی storage/CDN امن میزبانی کن "
            "(لینک امضادار)، دسترسی فقط خریداران. استک: Next.js + FastAPI/Node + PostgreSQL + S3. "
            "سوال‌های کلیدی: دوره‌ها رایگان/پولی/اشتراکی؟ ویدیو کجا میزبانی شود؟ گواهی و آزمون؟ چند مدرس؟"
        ),
    },
    {
        "id": "marketplace",
        "keywords": ["مارکت", "چند فروشنده", "بازار", "marketplace", "آگهی", "نیازمندی", "دایرکتوری", "کمیسیون"],
        "content": (
            "الگوی مارکت‌پلیس/آگهی: نقش‌های خریدار/فروشنده/ادمین، مدل‌ها Listing, Seller, Order, Commission, Payout, Review, Message. "
            "پیچیدگی بالا؛ پیشنهاد فاز اول MVP. استک: Next.js + FastAPI/Node + PostgreSQL. "
            "سوال‌های کلیدی: پرداخت به فروشنده چگونه؟ کمیسیون؟ تایید آگهی/فروشنده؟ چت بین کاربران؟"
        ),
    },
    {
        "id": "restaurant",
        "keywords": ["رستوران", "کافه", "منو", "غذا", "سفارش غذا", "فست فود", "قنادی", "restaurant", "cafe", "menu"],
        "content": (
            "الگوی رستوران/کافه: مدل‌ها MenuCategory, MenuItem(قیمت، موجودی، عکس), Order, OrderItem, Table, Payment. "
            "دو حالت: منوی دیجیتال با QR (ساده، بدون پرداخت) یا سفارش آنلاین با پرداخت و پیگیری وضعیت سفارش. "
            "استک: Next.js + FastAPI/Node + PostgreSQL؛ برای منوی ساده فقط CMS/پنل ساده. "
            "سوال‌های کلیدی: فقط منو یا سفارش آنلاین؟ ارسال با پیک یا حضوری؟ ساعت کاری و محدوده تحویل؟ چند شعبه؟ پنل برای تغییر قیمت و موجودی؟"
        ),
    },
    {
        "id": "mobile_app",
        "keywords": ["اپلیکیشن", "اپ موبایل", "اندروید", "ios", "pwa", "نرم افزار موبایل", "app", "mobile"],
        "content": (
            "الگوی اپلیکیشن موبایل: اگر نیاز به نصب و اعلان‌ها هست PWA یا React Native/Flutter، و اگر فقط تجربه موبایلی لازم است وب‌اپ واکنش‌گرا کافی است. "
            "همیشه یک API مشترک (REST/GraphQL) با احراز هویت توکنی طراحی کن. "
            "سوال‌های کلیدی: اندروید، iOS یا هر دو؟ نیاز به اعلان پوش؟ کار آفلاین؟ انتشار در کافه‌بازار/مایکت/اپ‌استور؟ دسترسی به دوربین/لوکیشن؟"
        ),
    },
    {
        "id": "api_backend",
        "keywords": ["api", "بک اند", "بکند", "وب سرویس", "ربات", "اتصال", "یکپارچه", "webhook", "تلگرام", "backend"],
        "content": (
            "الگوی API/بک‌اند: تعریف منابع و endpointهای REST با مستندات OpenAPI، احراز هویت (JWT/API key)، محدودیت نرخ، لاگ، صف برای کارهای سنگین، "
            "تست و نسخه‌بندی. استک: FastAPI/Node + PostgreSQL (+Redis). "
            "سوال‌های کلیدی: چه سیستم‌هایی مصرف‌کننده‌اند؟ حجم درخواست؟ چه داده‌ای ذخیره می‌شود؟ webhook یا اتصال به سرویس بیرونی؟ نیاز به پنل ادمین؟"
        ),
    },
]


def _normalize(text: str) -> str:
    text = text.replace("ي", "ی").replace("ك", "ک").replace("‌", " ")
    return re.sub(r"\s+", " ", text).lower()


_STOP_MARKER = "کاربر همراه این پیام فایل فرستاده است"
MIN_IDEA_CHARS = 20
SECOND_MARGIN = 0.03
EMBED_MODEL = os.getenv("RAG_EMBED_MODEL", "gemini-embedding-001")
EMBED_TIMEOUT = float(os.getenv("RAG_EMBED_TIMEOUT", "30"))
CACHE_FILE = Path("/app/uploads/rag-vectors.json")
MAX_CACHE = 500

_chunk_vectors: dict[str, list[float]] | None = None
_topic_cache: dict[str, list[str]] = {}
_pending: dict[str, asyncio.Task] = {}


def _user_texts(messages: list[dict]) -> list[str]:
    texts = []
    for message in messages:
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))
        if isinstance(content, str):
            texts.append(content.split(_STOP_MARKER)[0].strip())
    return texts


def _idea_text(messages: list[dict]) -> str:
    """First substantive user message: the project idea. Stable across turns, so it works as a cache key."""
    for text in _user_texts(messages):
        if len(text) >= MIN_IDEA_CHARS:
            return text[:600]
    return ""


def _keyword_ids(text: str, limit: int) -> list[str]:
    haystack = _normalize(text)
    scored = []
    for chunk in KNOWLEDGE_BASE:
        score = sum(1 for keyword in chunk["keywords"] if _normalize(keyword) in haystack)
        if score:
            scored.append((score, chunk["id"]))
    scored.sort(key=lambda item: -item[0])
    return [chunk_id for _, chunk_id in scored[:limit]]


def _format(ids: list[str]) -> str:
    by_id = {chunk["id"]: chunk for chunk in KNOWLEDGE_BASE}
    body = "\n\n".join(by_id[i]["content"] for i in ids if i in by_id)
    if not body:
        return ""
    return "دانش مرتبط با همین پروژه (برای سوال پرسیدن و طراحی استک و داده استفاده کن):\n" + body


def retrieve_knowledge(messages: list[dict], limit: int = 2) -> str:
    """Keyword retrieval; also the fallback when the vector service is slow or down."""
    text = " ".join(_user_texts(messages)[-6:])
    return _format(_keyword_ids(text, limit)) if text else ""


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    return dot / ((math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b))) or 1.0)


def _chunk_hash(chunk: dict) -> str:
    return hashlib.sha1(f"{EMBED_MODEL}|{chunk['content']}".encode()).hexdigest()[:16]


async def _embed(texts: list[str], base_urls: list[str], api_key: str) -> list[list[float]]:
    last_error: Exception | None = None
    for base_url in base_urls:
        client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=EMBED_TIMEOUT)
        try:
            response = await client.embeddings.create(model=EMBED_MODEL, input=texts)
            return [item.embedding for item in response.data]
        except Exception as e:
            last_error = e
    raise last_error or RuntimeError("no embedding endpoint")


async def _ensure_chunk_vectors(base_urls: list[str], api_key: str) -> dict[str, list[float]]:
    global _chunk_vectors
    if _chunk_vectors is not None:
        return _chunk_vectors
    stored: dict[str, list[float]] = {}
    try:
        stored = json.loads(CACHE_FILE.read_text())
    except Exception:
        pass
    vectors = {chunk["id"]: stored[_chunk_hash(chunk)] for chunk in KNOWLEDGE_BASE if _chunk_hash(chunk) in stored}
    missing = [chunk for chunk in KNOWLEDGE_BASE if chunk["id"] not in vectors]
    if missing:
        embedded = await _embed([chunk["content"] for chunk in missing], base_urls, api_key)
        for chunk, vector in zip(missing, embedded):
            vectors[chunk["id"]] = vector
            stored[_chunk_hash(chunk)] = vector
        try:
            CACHE_FILE.write_text(json.dumps(stored))
        except Exception as e:
            logger.warning("RAG vector cache not written: %s", e)
    _chunk_vectors = vectors
    return vectors


async def _vector_fill(key: str, idea: str, base_urls: list[str], api_key: str) -> list[str]:
    try:
        vectors = await _ensure_chunk_vectors(base_urls, api_key)
        query = (await _embed([idea], base_urls, api_key))[0]
        ranked = sorted(((_cosine(query, vector), chunk_id) for chunk_id, vector in vectors.items()), reverse=True)
        ids = [ranked[0][1]]
        if len(ranked) > 1 and ranked[0][0] - ranked[1][0] <= SECOND_MARGIN:
            ids.append(ranked[1][1])
        if len(_topic_cache) >= MAX_CACHE:
            _topic_cache.pop(next(iter(_topic_cache)))
        _topic_cache[key] = ids
        return ids
    except Exception as e:
        logger.warning("RAG vector retrieval failed, using keywords: %s", e)
        return []
    finally:
        _pending.pop(key, None)


async def retrieve_knowledge_async(
    messages: list[dict], base_urls: list[str], api_key: str, wait: bool = False
) -> str:
    """Vector retrieval on the project idea, computed once per conversation.

    Embedding calls can take several seconds on the gateway, so chat turns never wait for them:
    the first turn answers with keyword retrieval while the vector is computed in the background,
    and later turns read it from the cache. `wait=True` (brief generation) waits for the result.
    """
    idea = _idea_text(messages)
    if not idea or not api_key:
        return retrieve_knowledge(messages)

    key = hashlib.sha1(_normalize(idea).encode()).hexdigest()
    if key in _topic_cache:
        return _format(_topic_cache[key])

    task = _pending.get(key)
    if task is None:
        task = asyncio.create_task(_vector_fill(key, idea, base_urls, api_key))
        _pending[key] = task
    if wait:
        ids = await asyncio.shield(task)
        if ids:
            return _format(ids)
    return retrieve_knowledge(messages)
