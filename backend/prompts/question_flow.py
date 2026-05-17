import json


def render_question_flow(settings: dict) -> str:
    data = {
        "question_flow": settings.get("chatbot_question_flow", []),
        "response_templates": settings.get("predefined_response_templates", {}),
    }
    return "جریان سوال‌ها و قالب پاسخ قابل ویرایش توسط ادمین:\n" + json.dumps(
        data,
        ensure_ascii=False,
        indent=2,
    )
