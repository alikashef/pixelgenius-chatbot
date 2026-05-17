OUTPUT_SCHEMA = """
وقتی اطلاعات کافی جمع شد، فقط JSON معتبر با همین schema برگردان و هیچ متن دیگری ننویس:

{
  "project_type": "",
  "project_goal": "",
  "budget_level": "",
  "budget_fit": "low | fit | high",
  "recommended_solution": "",
  "recommended_stack": "",
  "estimated_price_range": "",
  "estimated_timeline": "",
  "client_risk_level": "",
  "lead_score": 0,
  "client_message": "",
  "admin_summary": "",
  "missing_questions": []
}

قوانین schema:
- estimated_price_range باید به تومان و ترجیحاً با عبارت "میلیون تومان" باشد.
- budget_level یکی از سطح‌های تعریف‌شده در تنظیمات باشد.
- budget_fit فقط یکی از low، fit یا high باشد.
- lead_score عددی بین 0 تا 100 باشد.
- client_message باید فارسی، دوستانه، صادقانه و قابل نمایش به مشتری باشد.
- admin_summary باید خلاصه داخلی کوتاه برای ادمین/فریلنسر باشد.
- اگر هنوز اطلاعات کافی نیست، JSON نده و فقط سوال بعدی را بپرس.
"""
