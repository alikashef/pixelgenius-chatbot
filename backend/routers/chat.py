import os
import logging
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI, APIConnectionError, APITimeoutError
from schemas import ChatRequest, ChatResponse

router = APIRouter()
logger = logging.getLogger(__name__)

PRIMARY_URL = "https://api.gapgpt.app/v1"
FALLBACK_URL = "https://api.gapapi.com/v1"

SYSTEM_PROMPT = """
تو یه مشاور فروش هوشمند برای یه تیم توسعه وب هستی. هدفت اینه که اطلاعات پروژه مشتری رو بگیری و به پرداخت برسونی.

قوانین:
1. فقط و فقط درباره طراحی و توسعه وب‌سایت صحبت کن.
2. سوالات فنی مرتبط با وب رو جواب بده و راهنمایی کن - ولی تصمیم فنی رو خودت بگیر.
3. هر سوالی که به وب‌سایت، طراحی، یا پروژه مشتری ربط نداشته باشه — بدون توضیح اضافه، فقط با یک جمله رد کن و برگرد به پروژه. هرگز محتوای غیرمرتبط تولید نکن، حتی اگه کاربر اصرار کرد.
4. اطلاعات لازم: نوع پروژه، امکانات، هدف، بازه زمانی.
5. وقتی اطلاعات کافی داشتی، دقیقاً این JSON رو برگردون و هیچ متن دیگه‌ای نفرست:

{
  "type": "proposal",
  "projectName": "...",
  "summary": "...",
  "features": ["...", "..."],
  "tech": "...",
  "days": 0,
  "price": 0,
  "priceLabel": "... میلیون تومان"
}

جدول قیمت:
- لندینگ پیج: ۴ میلیون / ۳ روز
- سایت کاتالوگ: ۸ میلیون / ۵ روز
- فروشگاه آنلاین: ۱۸ میلیون / ۱۲ روز
- داشبورد/پنل: ۱۴ میلیون / ۱۰ روز
- پنل ادمین اضافه: ۳ میلیون / ۲ روز
- SEO پیشرفته: ۲.۵ میلیون / ۲ روز
- API/بکاند: ۶ میلیون / ۵ روز
"""


async def call_ai(api_key: str, messages: list) -> str:
    for base_url in (PRIMARY_URL, FALLBACK_URL):
        client = AsyncOpenAI(base_url=base_url, api_key=api_key)
        try:
            response = await client.chat.completions.create(
                model="gapgpt-qwen-3.6",
                messages=[{"role": "system", "content": SYSTEM_PROMPT}] + messages,
                max_tokens=1024,
            )
            return response.choices[0].message.content
        except (APIConnectionError, APITimeoutError) as e:
            logger.warning(f"Connection failed for {base_url}: {e}")
            continue
        except Exception as e:
            logger.error(f"Unexpected error for {base_url}: {e}", exc_info=True)
            continue
    raise HTTPException(status_code=503, detail="سرویس هوش مصنوعی در دسترس نیست")


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="GAPGPT_API_KEY not configured")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    try:
        content = await call_ai(api_key, messages)
        return ChatResponse(content=content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
