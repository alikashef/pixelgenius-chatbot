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


DESIGNER_OUTPUT_SCHEMA = """
وقتی اطلاعات کافی جمع شد، فقط JSON معتبر با همین schema برگردان و هیچ متن دیگری ننویس:

{
  "project_type": "",
  "project_goal": "",
  "budget_level": "",
  "budget_fit": "fit",
  "recommended_solution": "",
  "recommended_stack": "",
  "estimated_price_range": "",
  "estimated_timeline": "",
  "client_risk_level": "low",
  "lead_score": 50,
  "client_message": "",
  "admin_summary": "",
  "missing_questions": []
}

قوانین schema (نام فیلدها ثابت است و نباید تغییر کند):
- project_type: نوع پروژه، مثل فروشگاه آنلاین یا لندینگ پیج.
- project_goal: هدف اصلی پروژه و مخاطب آن در یک یا دو جمله.
- recommended_solution: خلاصه راهکار و ساختار پیشنهادی (صفحه‌ها و قابلیت‌های اصلی).
- recommended_stack: استک انتخابی شامل فرانت‌اند، بک‌اند، دیتابیس و هاست، با دلیل کوتاه.
- admin_summary: خلاصه کامل و دقیق همه نیازها: صفحه‌ها و بخش‌ها، قابلیت‌ها، نقش‌ها، سبک و رنگ، محتوا، اتصال‌ها و تصمیم‌های فنی.
- client_message: فارسی، دوستانه و قابل نمایش به مشتری؛ جمع‌بندی کوتاه طراحی و اعلام اینکه کانفیگ پروژه آماده است.
- estimated_timeline: زمان تقریبی ساخت، مثل "۵ روز".
- budget_level، budget_fit، estimated_price_range، client_risk_level و lead_score در این مسیر استفاده نمی‌شوند؛ دقیقاً با مقدارهای "-"، "fit"، "-"، "low" و 50 پر شوند.
- missing_questions: ابهام‌های باقی‌مانده که مشتری باید بعداً روشن کند.
- اگر هنوز اطلاعات کافی نیست، JSON نده و فقط سوال بعدی را بپرس.
"""
