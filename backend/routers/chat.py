import os
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI, APIConnectionError, APITimeoutError
from schemas import ChatRequest, ChatResponse

router = APIRouter()

API_KEY = os.getenv("GAPGPT_API_KEY", "")
PRIMARY_URL = "https://api.gapgpt.app/v1"
FALLBACK_URL = "https://api.gapapi.com/v1"

client_primary = AsyncOpenAI(base_url=PRIMARY_URL, api_key=API_KEY)
client_fallback = AsyncOpenAI(base_url=FALLBACK_URL, api_key=API_KEY)


async def call_ai(messages: list) -> str:
    for client in (client_primary, client_fallback):
        try:
            response = await client.chat.completions.create(
                model="gapgpt-qwen-3.6",
                messages=[{"role": "system", "content": SYSTEM_PROMPT}] + messages,
                max_tokens=1024,
            )
            return response.choices[0].message.content
        except (APIConnectionError, APITimeoutError):
            continue
    raise HTTPException(status_code=503, detail="سرویس هوش مصنوعی در دسترس نیست")

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


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not os.getenv("GAPGPT_API_KEY"):
        raise HTTPException(status_code=500, detail="GAPGPT_API_KEY not configured")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    content = await call_ai(messages)
    return ChatResponse(content=content)
