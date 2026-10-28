from typing import Callable
import asyncio
import json
import math

import httpx
import logging
import os
import re

from fastapi import HTTPException
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI

from lib.ai.build_messages import build_messages
from prompts.knowledge_base import retrieve_knowledge, retrieve_knowledge_async
from services.skills import retrieve_skills, select_skills_for_brief
from services.images import fill_brief_images
from prompts.stack_tiers import render_stack_tiers
from lib.ai.parse_ai_response import parse_ai_response

logger = logging.getLogger(__name__)

PRIMARY_URL = "https://api.gapgpt.app/v1"
FALLBACK_URL = "https://api.gapapi.com/v1"
DEFAULT_MODEL = "gapgpt-qwen-3.6"
VISION_MODEL = "claude-opus-4-6"
SONNET_MODEL = "claude-sonnet-5-5"
GPT_MINI_MODEL = "gpt-5-mini"
STRUCTURED_MODEL = "typesafe/jev-1.14"
AI_TIMEOUT_SECONDS = 3.0

AVAILABLE_MODELS = [
    DEFAULT_MODEL,
    VISION_MODEL,
    SONNET_MODEL,
    GPT_MINI_MODEL,
]


MODEL_LABELS = {
    DEFAULT_MODEL: "GapGPT Qwen 3.6",
    VISION_MODEL: "Claude Opus 4.6",
    SONNET_MODEL: "Claude Sonnet 5.5",
    GPT_MINI_MODEL: "GPT-5 mini",
}


def selected_chat_model(settings: dict, mode: str = "sales") -> str:
    selected = (settings.get("designer_ai_model") if mode == "designer" else None) or settings.get("ai_model", DEFAULT_MODEL)
    return selected if selected in AVAILABLE_MODELS else DEFAULT_MODEL


def _completion_parameters(model: str, tokens: int, temperature: float) -> dict:
    if model == GPT_MINI_MODEL:
        # extra_body supports reasoning parameters with the pinned OpenAI SDK.
        return {"extra_body": {"max_completion_tokens": tokens, "reasoning_effort": "minimal"}}
    return {"max_tokens": tokens, "temperature": temperature}


def _has_image_content(messages: list[dict]) -> bool:
    for message in messages:
        content = message.get("content")
        if isinstance(content, list) and any(part.get("type") == "image_url" for part in content if isinstance(part, dict)):
            return True
    return False


def _model_order(selected_model: str, messages: list[dict]) -> list[str]:
    if _has_image_content(messages) and selected_model not in (VISION_MODEL, SONNET_MODEL):
        return [VISION_MODEL]
    return [selected_model or DEFAULT_MODEL]


async def evaluate_sales_lead(content: str, messages: list[dict], settings: dict) -> str:
    """Optionally refine a completed sales analysis without changing the response schema."""
    if settings.get("structured_analysis_model") != STRUCTURED_MODEL:
        return content
    try:
        lead = json.loads(content)
    except (ValueError, TypeError):
        return content
    if not isinstance(lead, dict) or not {"lead_score", "client_risk_level", "client_message"}.issubset(lead):
        return content
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        return content
    questions = {
        "client_risk_level": {
            "type": "choice",
            "instructions": "Assess delivery risk from the client's requirements, budget and deadline. Use low when no concrete risk is present.",
            "criteria": {"low": "Clear achievable requirements and realistic expectations", "medium": "Some uncertainty or scope/budget tension", "high": "Unrealistic deadline, budget or contradictory scope"},
        },
        "lead_score": {
            "type": "score",
            "instructions": "Rate this sales lead's readiness and fit. Use the supplied scoring rules; missing information is uncertainty, not proof of poor quality.",
            "criteria": ["Very poor fit", "Weak fit", "Uncertain or average fit", "Good fit", "Excellent fit and ready to proceed"],
        },
    }
    state = {"conversation": messages, "analysis": lead, "scoring_rules": settings.get("lead_scoring_rules", [])}
    for base_url in _base_urls():
        try:
            async with httpx.AsyncClient(timeout=max(_request_timeout(), 15.0)) as client:
                response = await client.post(
                    f"{base_url}/systemone",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": STRUCTURED_MODEL, "state": state, "questions": questions},
                )
                response.raise_for_status()
                answers = response.json()["answers"]
                risk = answers["client_risk_level"]["choice"]
                score = answers["lead_score"]["score"]
                if risk not in ("low", "medium", "high") or isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score) or not 0 <= score <= 4:
                    raise ValueError("Invalid structured lead assessment")
                lead.update(client_risk_level=risk, lead_score=round(score * 25))
                return json.dumps(lead, ensure_ascii=False, separators=(",", ":"))
        except httpx.HTTPStatusError as exc:
            logger.warning("Structured assessment failed with status %s", exc.response.status_code)
            if exc.response.status_code in (401, 403):
                break
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            logger.warning("Structured assessment unavailable or invalid; retaining original analysis")
    return content


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


FINALIZE_AFTER_USER_TURNS = 7
FINISH_PHRASES = re.compile(
    r"(همین\s*(کافی|خوبه|بسه)|دیگه\s*(چیزی|نیست)|تمام\s*شد|تمومه|نهایی|فایل\s*(رو|را)?\s*(بده|بساز)|کانفیگ)"
)
FINALIZE_INSTRUCTION = (
    "اطلاعات کافی است. همین الان فقط JSON نهایی را دقیقاً طبق schema برگردان؛ بدون هیچ متن، توضیح یا بلوک کد دیگر. "
    "مقدارهای نامشخص را با بهترین حدس منطقی پر کن یا در missing_questions بنویس."
)


def _should_finalize(messages: list[dict], finalize: bool) -> bool:
    """Do not rely on the model deciding to end the chat: force the final JSON when the user asked for it,
    said they are done, or the conversation has gone on long enough."""
    if finalize:
        return True
    user_turns = [m for m in messages if m.get("role") == "user"]
    if len(user_turns) >= FINALIZE_AFTER_USER_TURNS:
        return True
    return bool(user_turns) and bool(FINISH_PHRASES.search(_latest_user_text(messages)))


async def analyze_lead(settings: dict, messages: list[dict], mode: str = "designer", finalize: bool = False, on_stage: Callable[[str], None] | None = None) -> str:
    if on_stage:
        on_stage("thinking")
    api_key = os.getenv("GAPGPT_API_KEY", "")
    if not api_key:
        logger.error("GAPGPT_API_KEY not configured; using offline chat fallback")
        return _offline_reply(messages, mode)

    selected_model = selected_chat_model(settings, mode)

    knowledge = ""
    if mode != "sales":
        if on_stage:
            on_stage("searching")
        knowledge = "\n\n".join(filter(None, [
            await retrieve_knowledge_async(messages, _base_urls(), api_key),
            await retrieve_skills(settings, messages, _base_urls(), api_key),
        ]))
    if on_stage:
        on_stage("thinking")
    ai_messages = build_messages(settings, messages, mode, knowledge)
    if mode != "sales" and _should_finalize(messages, finalize):
        ai_messages = ai_messages + [{"role": "user", "content": FINALIZE_INSTRUCTION}]

    for model in _model_order(selected_model, ai_messages):
        for base_url in _base_urls():
            client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=max(_request_timeout(), 30.0) if model in (SONNET_MODEL, GPT_MINI_MODEL) else _request_timeout())
            try:
                response = await client.chat.completions.create(
                    model=model,
                    messages=ai_messages,
                    **_completion_parameters(model, 2000, 0.25),
                )
                content = response.choices[0].message.content or ""
                parsed = parse_ai_response(content)
                return await evaluate_sales_lead(parsed, messages, settings) if mode == "sales" else parsed
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
    "6. Skills: `skills` holds expert guidance (design, frontend, backend, database, architecture, AI/RAG, product) selected for THIS "
    "project. Read every item before writing code and follow it as your engineering standard; if it conflicts with an explicit "
    "value in `tech`, `pages` or `features`, the explicit value wins. Mention in your final notes which skills shaped which decisions.\n"
    "7. Tools: if you have MCP tools or plugins for design systems/Figma, browsing and screenshots, documentation, or databases, use "
    "them: look up current docs for the chosen stack, render the UI and check it visually (desktop and mobile, RTL) and fix what is off "
    "before declaring it done.\n"
    "8. Quality bar: professional, production-grade work: a consistent design system (tokens for color/type/spacing), accessible "
    "semantics and contrast, responsive layouts, input validation, secure auth, error handling, indexes on queried columns, no dead "
    "code or TODOs. Hashed passwords, CORS, no secrets in code, SEO basics and good performance.\n"
    "9. Images: `assets.images` lists AI-generated images, each with a `url`. Use those exact URLs for the matching spots "
    "(use `id`/`purpose` to place them) instead of stock photos or placeholder services. If an entry has no `url`, use a neutral CSS gradient.\n"
    "10. Workspace (product design projects only): if `deploy.workspace_url` is present, call `get_workspace` with deploy.token first. Follow the owner-selected path. Register each design/development preview with `report_output` (include HTML for element selection), and concise progress with `report_activity`. Wait for explicit owner approval of design before development on the design path, and development before deployment. Read and address versioned comments with `update_feedback`; only the owner approves them. Save actual admin access with `save_admin_credentials`, never in logs or notes. If deploy.workspace_url is absent, skip the workspace workflow. "
    "Deployment: if a tool named `deploy_project` from the PixelGenius server is available, finish by calling it with "
    "`deploy.token` from this file, the right `platform`, the `port` your app listens on, ALL source files (no node_modules, "
    "no .env; the server installs dependencies) and secrets in `env`. Then call `get_deploy_status` every 15 seconds until "
    "READY. If it FAILED, read `build_errors`, `hint` and `build_log_tail`, fix the code and call `deploy_project` again with "
    "all files. When READY, open the URL, confirm it works and give the user the address. For a purely static site you may "
    "use `publish_site` instead. If no deploy tool is available, give the user exact commands to run the project locally."
)

BRIEF_SYSTEM_PROMPT = """
تو یک تحلیلگر فنی هستی. از روی گفتگوی مشتری و خلاصه سفارش، یک کانفیگ کامل برای ساخت سایت بساز که یک AI دیگر
(Claude یا ChatGPT) بتواند از روی آن سایت را بسازد. فقط JSON معتبر برگردان، بدون هیچ متن دیگر، با دقیقاً این کلیدها:

{
  "project": {"name": "", "type": "", "size": "", "goal": "", "target_audience": "", "language": "fa", "direction": "rtl"},
  "pages": [{"name": "", "purpose": "", "sections": []}],
  "features": [],
  "design": {"style": "", "colors": [], "fonts": [], "references": []},
  "content": {"brand_name": "", "tagline": "", "texts": [], "contact": {}},
  "tech": {"stack": "", "frontend": "", "backend": "", "database": "", "hosting": "", "rationale": "", "structure": []},
  "user_roles": [{"role": "", "permissions": []}],
  "data_models": [{"name": "", "fields": [{"name": "", "type": "", "notes": ""}], "relations": []}],
  "api_endpoints": [{"method": "", "path": "", "purpose": "", "auth": ""}],
  "integrations": [{"name": "", "purpose": "", "notes": ""}],
  "assets": {"images": [{"id": "", "purpose": "", "prompt": "", "size_hint": ""}]},
  "constraints": [],
  "open_questions": []
}

قوانین:
- فقط از اطلاعاتی استفاده کن که مشتری گفته یا مستقیماً از آن نتیجه می‌شود؛ چیزی از خودت درباره برند یا محتوا نساز.
- اگر پروژه بک‌اند دارد (ثبت‌نام، پرداخت، پنل مدیریت، رزرو، دیتابیس و غیره)، user_roles و data_models و api_endpoints و integrations را کامل و دقیق خودت طراحی کن (مدل‌ها با فیلدها و روابط، endpointها با متد و مسیر). برای سایت کاملاً ایستا خالی بگذار.
- project.size را از روی همان گفتگو و معیارهای جدول استک تشخیص بده و یکی از اندازه‌های جدول را بنویس؛ tech را از ردیف همان اندازه پر کن.
- اگر مشتری یا کارمندانش باید خودشان محتوا یا داده را وارد و ویرایش کنند، یک صفحه/بخش «پنل مدیریت» در pages با بخش‌های هر منبع (فهرست، افزودن، ویرایش، حذف)، نقش admin در user_roles، مدل‌های داده و endpointهای CRUD و احراز هویت را حتماً بیاور و در features بنویس «پنل مدیریت». اگر محتوا ثابت است و پنل لازم نیست، چیزی اضافه نکن.
- بخش tech را تو پر کن: استک مناسب نیازها را انتخاب کن، دلیلش را در rationale بنویس و ساختار پوشه‌ها یا ماژول‌های اصلی را در structure بیاور.
- اگر چیزی گفته نشده، مقدار خالی ("" یا []) بگذار و سوال مربوطه را در open_questions بنویس.
- assets.images: فقط اگر سایت واقعاً به عکس یا تصویرسازی نیاز دارد (Hero، بنر، تصویر محصول، مقاله)، برای هر تصویر یک prompt انگلیسی توصیفی و دقیق (سبک، رنگ، ترکیب‌بندی، بدون متن داخل تصویر) بنویس؛ id کوتاه انگلیسی مثل hero_main و purpose فارسی. حداکثر ۴ تصویر. اگر نیاز نیست آرایه خالی بگذار.
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
        f"مسیر انتخاب‌شده قبل از گفتگو: {order.get('project_path', '')}\n"
        f"مخزن سورس: {order.get('source_url', '')}\n"
        f"نوع ورودی سورس: {order.get('source_type', '')}\n"
        f"فایل سورس: {json.dumps(order.get('source_file'), ensure_ascii=False)}\n"
        f"خلاصه: {order.get('summary', '')}\n"
        f"امکانات: {', '.join(order.get('features') or [])}\n"
        f"تکنولوژی پیشنهادی: {order.get('tech_stack', '')}\n"
        f"فایل‌های پیوست: {', '.join(f.get('name', '') for f in order.get('order_files') or [])}\n\n"
        f"گفتگو:\n{history}"
    )

    api_key = os.getenv("GAPGPT_API_KEY", "")
    history_messages = order.get("chat_history") or []
    async def _knowledge() -> str:
        # the embedding gateway can be slow; past the cap fall back to keyword retrieval (the vector keeps computing)
        try:
            return await asyncio.wait_for(
                retrieve_knowledge_async(history_messages, _base_urls(), api_key, wait=True), timeout=10
            )
        except asyncio.TimeoutError:
            return retrieve_knowledge(history_messages)

    knowledge = "\n\n".join(filter(None, await asyncio.gather(
        _knowledge(),
        retrieve_skills(settings, history_messages, _base_urls(), api_key, wait=True),
    )))
    spec: dict = {}
    selected_model = selected_chat_model(settings, "designer")

    if api_key:
        for base_url in _base_urls():
            client = AsyncOpenAI(base_url=base_url, api_key=api_key, timeout=max(_request_timeout(), 150.0))
            try:
                response = await client.chat.completions.create(
                    model=selected_model,
                    messages=[
                        {"role": "system", "content": "\n\n".join(filter(None, [BRIEF_SYSTEM_PROMPT.strip(), render_stack_tiers(settings), knowledge]))},
                        {"role": "user", "content": order_context[:30000]},
                    ],
                    **_completion_parameters(selected_model, 6000, 0.2),
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

    await fill_brief_images(spec, settings, _base_urls(), api_key)
    skills = await select_skills_for_brief(settings, history_messages, spec, _base_urls(), api_key)
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

    return {"version": 1, "instructions_for_ai": BRIEF_INSTRUCTIONS, **spec, "skills": skills}
