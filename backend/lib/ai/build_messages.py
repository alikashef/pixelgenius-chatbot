from prompts.output_schema import OUTPUT_SCHEMA
from prompts.pricing_knowledge import render_pricing_knowledge
from prompts.question_flow import render_question_flow
from prompts.sales_rules import render_sales_rules
from prompts.system_prompt import SYSTEM_PROMPT
from prompts.technical_advice import render_technical_advice


def build_messages(settings: dict, messages: list[dict]) -> list[dict]:
    system_content = "\n\n".join(
        [
            SYSTEM_PROMPT.strip(),
            render_sales_rules(settings),
            render_pricing_knowledge(settings),
            render_question_flow(settings),
            render_technical_advice(settings),
            OUTPUT_SCHEMA.strip(),
        ]
    )
    return [{"role": "system", "content": system_content}] + messages
