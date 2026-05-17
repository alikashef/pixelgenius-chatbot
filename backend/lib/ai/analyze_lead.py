import logging
import os

from fastapi import HTTPException
from openai import APIConnectionError, APITimeoutError, AsyncOpenAI

from lib.ai.build_messages import build_messages
from lib.ai.parse_ai_response import parse_ai_response

logger = logging.getLogger(__name__)

PRIMARY_URL = "https://api.gapgpt.app/v1"
FALLBACK_URL = "https://api.gapapi.com/v1"
MODEL = "gapgpt-qwen-3.6"


async def analyze_lead(settings: dict, messages: list[dict]) -> str:
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GAPGPT_API_KEY not configured")

    ai_messages = build_messages(settings, messages)

    for base_url in (PRIMARY_URL, FALLBACK_URL):
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        try:
            response = await client.chat.completions.create(
                model=MODEL,
                messages=ai_messages,
                max_tokens=1200,
                temperature=0.25,
            )
            content = response.choices[0].message.content or ""
            return parse_ai_response(content)
        except (APIConnectionError, APITimeoutError) as e:
            logger.warning("Connection failed for %s: %s", base_url, e)
            continue
        except Exception as e:
            logger.error("Unexpected AI error for %s: %s", base_url, e, exc_info=True)
            continue

    raise HTTPException(status_code=503, detail="سرویس هوش مصنوعی در دسترس نیست")
