import json


def render_technical_advice(settings: dict) -> str:
    data = {
        "recommended_technologies": settings.get("recommended_technologies", []),
        "lead_scoring_rules": settings.get("lead_scoring_rules", []),
    }
    return "راهنمای تکنولوژی و امتیازدهی قابل ویرایش توسط ادمین:\n" + json.dumps(
        data,
        ensure_ascii=False,
        indent=2,
    )
