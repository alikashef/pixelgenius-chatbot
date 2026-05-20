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
    models: list[str] = []
    if _has_image_content(messages):
        models.append(VISION_MODEL)
    models.append(selected_model)
    models.append(DEFAULT_MODEL)
    return list(dict.fromkeys(models))


async def analyze_lead(settings: dict, messages: list[dict]) -> str:
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GAPGPT_API_KEY not configured")

    selected_model = settings.get("ai_model", DEFAULT_MODEL)
    if selected_model not in AVAILABLE_MODELS:
        selected_model = DEFAULT_MODEL

    ai_messages = build_messages(settings, messages)

    for model in _model_order(selected_model, ai_messages):
        for base_url in (PRIMARY_URL, FALLBACK_URL):
            client = AsyncOpenAI(base_url=base_url, api_key=api_key)
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

    raise HTTPException(status_code=503, detail="سرویس هوش مصنوعی در دسترس نیست")
