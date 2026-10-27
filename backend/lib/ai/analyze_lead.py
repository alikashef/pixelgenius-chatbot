import logging
import os

from fastapi import HTTPException
from openai import APIConnectionError, APITimeoutError, AsyncOpenAI

from lib.ai.build_messages import build_messages
from lib.ai.parse_ai_response import parse_ai_response

logger = logging.getLogger(__name__)

PRIMARY_URL = "https://api.gapgpt.app/v1"
FALLBACK_URL = "https://api.gapapi.com/v1"
DEFAULT_MODEL = "gapgpt-qwen-3.6"
VISION_MODEL = "claude-opus-4-6"
AI_TIMEOUT_SECONDS = 3.0

AVAILABLE_MODELS = [
    DEFAULT_MODEL,
    VISION_MODEL,
]


def _has_image_content(messages: list[dict]) -> bool:
    for message in messages:
        content = message.get("content")
        if isinstance(content, list) and any(part.get("type") == "image_url" for part in content if isinstance(part, dict)):
            return True
    return False


def _model_order(selected_model: str, messages: list[dict]) -> list[str]:
    if _has_image_content(messages):
        return [VISION_MODEL]
    if selected_model == VISION_MODEL:
        return [DEFAULT_MODEL]
    return [selected_model or DEFAULT_MODEL]


def _base_urls() -> list[str]:
    configured = os.getenv("GAPGPT_BASE_URLS") or os.getenv("GAPGPT_BASE_URL") or ""
    urls = [url.strip().rstrip("/") for url in configured.split(",") if url.strip()]
    urls.extend([PRIMARY_URL, FALLBACK_URL])
    return list(dict.fromkeys(urls))


def _request_timeout() -> float:
    try:
        return max(1.0, float(os.getenv("GAPGPT_TIMEOUT_SECONDS", AI_TIMEOUT_SECONDS)))
    except ValueError:
        return AI_TIMEOUT_SECONDS


def _latest_user_text(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            text_parts = [
                str(part.get("text", "")).strip()
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            return "\n".join(part for part in text_parts if part).strip()
    return ""


def _offline_reply(messages: list[dict]) -> str:
    user_text = _latest_user_text(messages)
    has_attachment = "کاربر همراه این پیام فایل فرستاده است" in user_text or "محتوای فایل" in user_text
    attachment_note = (
        "فایل پیوست را هم دریافت کردم و در ادامه گفتگو بر اساس همان بررسی می‌کنم.\n\n"
        if has_attachment
        else ""
    )

    if not user_text:
        return (
            "سلام، من آماده‌ام نیاز پروژه‌تون رو جمع‌بندی کنم.\n"
            "برای شروع بفرمایید چه نوع سایت یا اپلیکیشنی می‌خواهید و هدف اصلی پروژه چیست؟"
        )

    return (
        f"{attachment_note}"
        "پیامتون رو گرفتم. برای اینکه سریع‌تر به جمع‌بندی درست برسیم، لطفا این چند مورد کلیدی رو بفرمایید:\n\n"
        "1. نوع پروژه دقیقاً چیه؟ مثلا لندینگ، فروشگاه، پنل، سایت شرکتی یا بک‌اند/API.\n"
        "2. مهم‌ترین خروجی‌ای که از پروژه می‌خواهید چیه؟\n"
        "3. حدود بودجه و زمان مدنظرتون چقدره؟\n"
        "4. اگر نمونه سایت یا فایل توضیحات دارید، همین‌جا بفرستید.\n\n"
        "بعد از این اطلاعات، می‌تونم محدوده قیمت، زمان و مسیر پیشنهادی رو جمع‌بندی کنم."
    )


async def analyze_lead(settings: dict, messages: list[dict]) -> str:
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        logger.error("GAPGPT_API_KEY not configured; using offline chat fallback")
        return _offline_reply(messages)

    selected_model = settings.get("ai_model", DEFAULT_MODEL)
    if selected_model not in AVAILABLE_MODELS:
        selected_model = DEFAULT_MODEL

    ai_messages = build_messages(settings, messages)

    for model in _model_order(selected_model, ai_messages):
        for base_url in _base_urls():
            client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=_request_timeout())
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=ai_messages,
                    max_tokens=1200,
                    temperature=0.25,
                )
                content = response.choices[0].message.content or ""
                return parse_ai_response(content)
            except (APIConnectionError, APITimeoutError) as e:
                logger.warning("Connection failed for %s using %s: %s", base_url, model, e)
                continue
            except Exception as e:
                logger.error("Unexpected AI error for %s using %s: %s", base_url, model, e, exc_info=True)
                continue

    logger.error("All AI providers failed; using offline chat fallback")
    return _offline_reply(messages)
