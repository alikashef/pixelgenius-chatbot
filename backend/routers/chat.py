import os
from fastapi import APIRouter, HTTPException
from anthropic import AsyncAnthropic
from schemas import ChatRequest, ChatResponse

router = APIRouter()
client = AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """
تو یه مشاور فروش هوشمند برای یه تیم توسعه وب هستی. هدفت اینه که اطلاعات پروژه مشتری رو بگیری و به پرداخت برسونی.

قوانین:
1. فقط درباره پروژه مشتری صحبت کن
2. سوالات فنی مرتبط رو جواب بده و راهنمایی کن - ولی تصمیم فنی رو خودت بگیر
3. سوالات کاملاً بی‌ربط رو مودبانه رد کن و برگرد به پروژه
4. اطلاعات لازم: نوع پروژه، امکانات، هدف، بازه زمانی
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
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise HTTPException(status_code=500, detail="ANTHROPIC_API_KEY not configured")

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    response = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=messages,
    )

    return ChatResponse(content=response.content[0].text)
