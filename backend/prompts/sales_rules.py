import json


def render_sales_rules(settings: dict) -> str:
    return "قوانین فروش قابل ویرایش توسط ادمین:\n" + json.dumps(
        settings.get("ai_sales_rules", []),
        ensure_ascii=False,
        indent=2,
    )
