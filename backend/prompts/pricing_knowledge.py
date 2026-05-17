import json


def render_pricing_knowledge(settings: dict) -> str:
    data = {
        "currency_label": settings.get("currency_label"),
        "project_price_ranges": settings.get("project_price_ranges", []),
        "budget_plan_thresholds": settings.get("budget_plan_thresholds", []),
        "timeline_estimates": settings.get("timeline_estimates", []),
        "payment_terms": settings.get("payment_terms", {}),
    }
    return "دانش قیمت‌گذاری و زمان‌بندی قابل ویرایش توسط ادمین:\n" + json.dumps(
        data,
        ensure_ascii=False,
        indent=2,
    )
