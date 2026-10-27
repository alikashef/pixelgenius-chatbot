import json
import logging
import os

from fastapi import HTTPException
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

from lib.ai.build_messages import build_messages
from prompts.knowledge_base import retrieve_knowledge_async
from lib.ai.parse_ai_response import parse_ai_response

logger = logging.getLogger(__name__)

PRIMARY_URL = "https://api.gapgpt.app/v1"
FALLBACK_URL = "https://api.gapapi.com/v1"
DEFAULT_MODEL = "gapgpt-qwen-3.6"
VISION_MODEL = "claude-opus-4-6"
AI_TIMEOUT_SECONDS = 3.0

AVAILABLE_MODELS = [
    DEFAULT_MODEL,
    VISION_MODEL,
]


def _has_image_content(messages: list[dict]) -> bool:
    for message in messages:
        content = message.get("content")
        if isinstance(content, list) and any(part.get("type") == "image_url" for part in content if isinstance(part, dict)):
            return True
    return False


def _model_order(selected_model: str, messages: list[dict]) -> list[str]:
    if _has_image_content(messages):
        return [VISION_MODEL]
    if selected_model == VISION_MODEL:
        return [DEFAULT_MODEL]
    return [selected_model or DEFAULT_MODEL]


def _base_urls() -> list[str]:
    configured = os.getenv("GAPGPT_BASE_URLS") or os.getenv("GAPGPT_BASE_URL") or ""
    urls = [url.strip().rstrip("/") for url in configured.split(",") if url.strip()]
    urls.extend([PRIMARY_URL, FALLBACK_URL])
    return list(dict.fromkeys(urls))


def _request_timeout() -> float:
    try:
        return max(1.0, float(os.getenv("GAPGPT_TIMEOUT_SECONDS", AI_TIMEOUT_SECONDS)))
    except ValueError:
        return AI_TIMEOUT_SECONDS


def _latest_user_text(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content.strip()
        if isinstance(content, list):
            text_parts = [
                str(part.get("text", "")).strip()
                for part in content
                if isinstance(part, dict) and part.get("type") == "text"
            ]
            return "\n".join(part for part in text_parts if part).strip()
    return ""


def _offline_reply(messages: list[dict], mode: str = "designer") -> str:
    user_text = _latest_user_text(messages)
    has_attachment = "کاربر همراه این پیام فایل فرستاده است" in user_text or "محتوای فایل" in user_text
    attachment_note = (
        "فایل پیوست را هم دریافت کردم و در ادامه گفتگو بر اساس همان بررسی می‌کنم.\n\n"
        if has_attachment
        else ""
    )

    if mode == "sales":
        if not user_text:
            return (
                "سلام، من آماده‌ام نیاز پروژه‌تون رو جمع‌بندی کنم.\n"
                "برای شروع بفرمایید چه نوع سایت یا اپلیکیشنی می‌خواهید و هدف اصلی پروژه چیست؟"
            )
        return (
            f"{attachment_note}"
            "پیامتون رو گرفتم. برای اینکه سریع‌تر به جمع‌بندی درست برسیم، لطفا این چند مورد کلیدی رو بفرمایید:\n\n"
            "1. نوع پروژه دقیقاً چیه؟ مثلا لندینگ، فروشگاه، پنل، سایت شرکتی یا بک‌اند/API.\n"
            "2. مهم‌ترین خروجی‌ای که از پروژه می‌خواهید چیه؟\n"
            "3. حدود بودجه و زمان مدنظرتون چقدره؟\n"
            "4. اگر نمونه سایت یا فایل توضیحات دارید، همین‌جا بفرستید.\n\n"
            "بعد از این اطلاعات، می‌تونم محدوده قیمت، زمان و مسیر پیشنهادی رو جمع‌بندی کنم."
        )

    if not user_text:
        return (
            "سلام، من آماده‌ام سایت یا اپلیکیشنتون رو باهم طراحی کنیم.\n"
            "برای شروع بفرمایید ایده‌تون چیه و برای چه مخاطبی ساخته می‌شه؟"
        )
    return (
        f"{attachment_note}"
        "ایده‌تون رو گرفتم. برای اینکه بتونم طراحیش کنم، لطفا این چند مورد رو بفرمایید:\n\n"
        "1. سایت یا اپلیکیشنتون دقیقاً چیه و برای چه مخاطبی ساخته می‌شه؟\n"
        "2. چه صفحه‌ها و قابلیت‌هایی لازم دارید؟\n"
        "3. چه حس و رنگی برای ظاهرش مدنظرتونه؟ اگر سایت نمونه دارید همین‌جا بفرستید.\n\n"
        "بعد از این اطلاعات، ساختار و استک مناسب رو پیشنهاد می‌دم."
    )


async def analyze_lead(settings: dict, messages: list[dict], mode: str = "designer") -> str:
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        logger.error("GAPGPT_API_KEY not configured; using offline chat fallback")
        return _offline_reply(messages, mode)

    selected_model = settings.get("ai_model", DEFAULT_MODEL)
    if selected_model not in AVAILABLE_MODELS:
        selected_model = DEFAULT_MODEL

    knowledge = await retrieve_knowledge_async(messages, _base_urls(), api_key) if mode != "sales" else ""
    ai_messages = build_messages(settings, messages, mode, knowledge)

    for model in _model_order(selected_model, ai_messages):
        for base_url in _base_urls():
            client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=_request_timeout())
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=ai_messages,
                    max_tokens=2000,
                    temperature=0.25,
                )
                content = response.choices[0].message.content or ""
                return parse_ai_response(content)
            except (APIConnectionError, APITimeoutError) as e:
                logger.warning("Connection failed for %s using %s: %s", base_url, model, e)
                continue
            except APIStatusError as e:
                if e.status_code in (401, 403):
                    logger.error("Auth error (%s) for %s — stopping retries: %s", e.status_code, base_url, e)
                    break
                logger.warning("API status error %s for %s using %s: %s", e.status_code, base_url, model, e)
                continue
            except Exception as e:
                logger.error("Unexpected AI error for %s using %s: %s", base_url, model, e, exc_info=True)
                continue

    logger.error("All AI providers failed; using offline chat fallback")
    return _offline_reply(messages, mode)


BRIEF_INSTRUCTIONS = (
    "You are a senior full-stack engineer and product designer. This JSON file is the complete specification of a real "
    "product written from a conversation with the client. Build the actual product, not a mockup or a static demo.\n"
    "Rules:\n"
    "1. Implement EXACTLY the stack in `tech`. If it has a backend or database, build it for real: data models from "
    "`data_models`, endpoints from `api_endpoints`, authentication and roles from `user_roles`, and every item in "
    "`integrations` (use clearly named environment variables and a mock adapter only when a real key is required). "
    "Never replace backend features with hard-coded data or localStorage.\n"
    "2. Build EVERY page and section in `pages` and every item in `features`. The admin panel, forms, validation, "
    "empty/loading/error states and responsive mobile layout are required, not optional.\n"
    "3. Follow `design` closely (colors, fonts, style) and respect `project.language` and `project.direction`. "
    "Use the real texts in `content`; write realistic copy for anything missing. No lorem ipsum.\n"
    "4. Output complete, runnable code: first the project tree, then every file in full with its path as a heading. "
    "Never use placeholders like '...' or 'rest of the code'. Include seed data, `.env.example`, and a README with exact "
    "install and run commands. If the answer is too long, stop at a clean file boundary and continue when the user says 'continue'.\n"
    "5. For anything in `open_questions` or missing, choose a sensible default and list your assumptions at the end.\n"
    "6. Deployment: if a tool named `deploy_project` from the FreelioAI server is available, finish by calling it with "
    "`deploy.token` from this file, the right `platform`, the `port` your app listens on, ALL source files (no node_modules, "
    "no .env; the server installs dependencies) and secrets in `env`. Then call `get_deploy_status` every 15 seconds until "
    "READY. If it FAILED, read `build_errors`, `hint` and `build_log_tail`, fix the code and call `deploy_project` again with "
    "all files. When READY, open the URL, confirm it works and give the user the address. For a purely static site you may "
    "use `publish_site` instead. If no deploy tool is available, give the user exact commands to run the project locally.\n"
    "7. Quality bar: production-ready structure, secure defaults (hashed passwords, input validation, CORS, no secrets in code), "
    "SEO basics and good performance."
)

BRIEF_SYSTEM_PROMPT = """
تو یک تحلیلگر فنی هستی. از روی گفتگوی مشتری و خلاصه سفارش، یک کانفیگ کامل برای ساخت سایت بساز که یک AI دیگر
(Claude یا ChatGPT) بتواند از روی آن سایت را بسازد. فقط JSON معتبر برگردان، بدون هیچ متن دیگر، با دقیقاً این کلیدها:

{
  "project": {"name": "", "type": "", "goal": "", "target_audience": "", "language": "fa", "direction": "rtl"},
  "pages": [{"name": "", "purpose": "", "sections": []}],
  "features": [],
  "design": {"style": "", "colors": [], "fonts": [], "references": []},
  "content": {"brand_name": "", "tagline": "", "texts": [], "contact": {}},
  "tech": {"stack": "", "frontend": "", "backend": "", "database": "", "hosting": "", "rationale": "", "structure": []},
  "user_roles": [{"role": "", "permissions": []}],
  "data_models": [{"name": "", "fields": [{"name": "", "type": "", "notes": ""}], "relations": []}],
  "api_endpoints": [{"method": "", "path": "", "purpose": "", "auth": ""}],
  "integrations": [{"name": "", "purpose": "", "notes": ""}],
  "constraints": [],
  "open_questions": []
}

قوانین:
- فقط از اطلاعاتی استفاده کن که مشتری گفته یا مستقیماً از آن نتیجه می‌شود؛ چیزی از خودت درباره برند یا محتوا نساز.
- اگر پروژه بک‌اند دارد (ثبت‌نام، پرداخت، پنل مدیریت، رزرو، دیتابیس و غیره)، user_roles و data_models و api_endpoints و integrations را کامل و دقیق خودت طراحی کن (مدل‌ها با فیلدها و روابط، endpointها با متد و مسیر). برای سایت کاملاً ایستا خالی بگذار.
- بخش tech را تو پر کن: استک مناسب نیازها را انتخاب کن، دلیلش را در rationale بنویس و ساختار پوشه‌ها یا ماژول‌های اصلی را در structure بیاور.
- اگر چیزی گفته نشده، مقدار خالی ("" یا []) بگذار و سوال مربوطه را در open_questions بنویس.
- pages و sections را مشخص و قابل ساخت بنویس (مثلاً Hero، لیست محصولات، فرم تماس).
"""


def _extract_json_object(text: str) -> dict | None:
    start = text.find("{")
    if start == -1:
        return None
    try:
        parsed, _ = json.JSONDecoder().raw_decode(text[start:])
    except ValueError:
        return None
    return parsed if isinstance(parsed, dict) else None


async def generate_project_brief(settings: dict, order: dict) -> dict:
    history = "\n".join(
        f"{'مشتری' if m.get('role') == 'user' else 'مشاور'}: {m.get('content', '')}"
        for m in order.get("chat_history") or []
        if isinstance(m.get("content"), str)
    )
    order_context = (
        f"نام پروژه: {order.get('project_name', '')}\n"
        f"خلاصه: {order.get('summary', '')}\n"
        f"امکانات: {', '.join(order.get('features') or [])}\n"
        f"تکنولوژی پیشنهادی: {order.get('tech_stack', '')}\n"
        f"فایل‌های پیوست: {', '.join(f.get('name', '') for f in order.get('order_files') or [])}\n\n"
        f"گفتگو:\n{history}"
    )

    api_key = os.getenv("GAPGPT_API_KEY", "")
    knowledge = await retrieve_knowledge_async(order.get("chat_history") or [], _base_urls(), api_key, wait=True)
    spec: dict = {}
    selected_model = settings.get("ai_model", DEFAULT_MODEL)
    if selected_model not in AVAILABLE_MODELS:
        selected_model = DEFAULT_MODEL

    if api_key:
        for base_url in _base_urls():
            client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=max(_request_timeout(), 150.0))
            try:
                response = await client.chat.completions.create(
                    model=selected_model,
                    messages=[
                        {"role": "system", "content": "\n\n".join(filter(None, [BRIEF_SYSTEM_PROMPT.strip(), knowledge]))},
                        {"role": "user", "content": order_context[:30000]},
                    ],
                    max_tokens=6000,
                    temperature=0.2,
                )
                spec = _extract_json_object(response.choices[0].message.content or "") or {}
                if spec:
                    break
            except (APIConnectionError, APITimeoutError) as e:
                logger.warning("Brief connection failed for %s: %s", base_url, e)
            except APIStatusError as e:
                logger.warning("Brief API status error %s for %s: %s", e.status_code, base_url, e)
                if e.status_code in (401, 403):
                    break
            except Exception as e:
                logger.error("Unexpected brief error for %s: %s", base_url, e, exc_info=True)

    project = spec.get("project") if isinstance(spec.get("project"), dict) else {}
    project.setdefault("name", order.get("project_name", ""))
    project.setdefault("language", "fa")
    project.setdefault("direction", "rtl")
    spec["project"] = project
    if not spec.get("features"):
        spec["features"] = order.get("features") or []
    tech = spec.get("tech") if isinstance(spec.get("tech"), dict) else {}
    tech.setdefault("stack", order.get("tech_stack", ""))
    spec["tech"] = tech

    return {"version": 1, "instructions_for_ai": BRIEF_INSTRUCTIONS, **spec}
