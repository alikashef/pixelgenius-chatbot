import json


LEAD_SCHEMA_KEYS = {
    "project_type",
    "project_goal",
    "budget_level",
    "budget_fit",
    "recommended_solution",
    "recommended_stack",
    "estimated_price_range",
    "estimated_timeline",
    "client_risk_level",
    "lead_score",
    "client_message",
    "admin_summary",
    "missing_questions",
}


def _find_json_objects(text: str) -> list[str]:
    objects = []
    start = None
    depth = 0
    in_string = False
    escape = False

    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}" and depth:
            depth -= 1
            if depth == 0 and start is not None:
                objects.append(text[start:index + 1])
                start = None

    return objects


def parse_ai_response(content: str) -> str:
    for candidate in _find_json_objects(content):
        try:
            data = json.loads(candidate)
        except json.JSONDecodeError:
            continue

        if isinstance(data, dict) and LEAD_SCHEMA_KEYS.issubset(data.keys()):
            return json.dumps(data, ensure_ascii=False, separators=(",", ":"))

    return content
