from prompts.output_schema import OUTPUT_SCHEMA
from prompts.pricing_knowledge import render_pricing_knowledge
from prompts.question_flow import render_question_flow
from prompts.sales_rules import render_sales_rules
from prompts.system_prompt import SYSTEM_PROMPT
from prompts.technical_advice import render_technical_advice


def _render_freelancer_context(settings: dict) -> str:
    name = (settings.get("freelancer_name") or "").strip()
    if not name:
        return ""
    position = (settings.get("freelancer_position") or "").strip()
    services = (settings.get("freelancer_services") or "").strip()
    price_range = (settings.get("freelancer_price_range") or "").strip()
    timeline = (settings.get("freelancer_timeline") or "").strip()
    note = (settings.get("freelancer_note") or "").strip()

    lines = [
        f"تو مشاور هوشمند {name} هستی.",
        f"اطلاعات فریلنسر:",
        f"- نام: {name}",
    ]
    if position:
        lines.append(f"- موقعیت: {position}")
    if services:
        lines.append(f"- خدمات ارائه‌شده: {services}")
    if price_range:
        lines.append(f"- بازه قیمتی: {price_range}")
    if timeline:
        lines.append(f"- زمان تحویل معمول: {timeline}")
    if note:
        lines.append(f"- نکته مهم: {note}")
    return "\n".join(lines)


def build_messages(settings: dict, messages: list[dict]) -> list[dict]:
    parts = [SYSTEM_PROMPT.strip()]
    freelancer_ctx = _render_freelancer_context(settings)
    if freelancer_ctx:
        parts.append(freelancer_ctx)
    parts += [
        render_sales_rules(settings),
        render_pricing_knowledge(settings),
        render_question_flow(settings),
        render_technical_advice(settings),
        OUTPUT_SCHEMA.strip(),
    ]
    return [{"role": "system", "content": "\n\n".join(parts)}] + messages
