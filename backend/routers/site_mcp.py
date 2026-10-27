import base64
import asyncio
import hashlib
import inspect
import json
import logging
import mimetypes
import os
import re
import shutil
import time
import httpx
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import JSONResponse, Response
from jose import JWTError, jwt

from auth import ALGORITHM, JWT_SECRET
from services import liara, workspace
from database import SessionLocal
from models import Order
from sqlalchemy import select
from schemas import WorkspaceOutputIn, WorkspaceCredentialsIn, WorkspaceCommentStatusIn
from pydantic import ValidationError

router = APIRouter()
logger = logging.getLogger(__name__)

SITES_DIR = Path(os.getenv("SITES_DIR", "/app/sites"))
SITES_DIR.mkdir(parents=True, exist_ok=True)

PREVIEW_BASE_DOMAIN = (os.getenv("PREVIEW_BASE_DOMAIN") or "localhost").lower()
PREVIEW_URL_TEMPLATE = os.getenv("PREVIEW_URL_TEMPLATE") or ("http://{slug}.localhost:8000" if PREVIEW_BASE_DOMAIN == "localhost" else "https://{slug}." + PREVIEW_BASE_DOMAIN)
PUBLIC_MCP_URL = os.getenv("PUBLIC_MCP_URL") or "http://localhost:8000/mcp"
SITE_TTL_SECONDS = int(os.getenv("SITE_TTL_DAYS") or "7") * 86400
TOKEN_TTL_SECONDS = 30 * 86400

MAX_FILES = 150
MAX_FILE_BYTES = 1024 * 1024
MAX_TOTAL_BYTES = 3 * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".html", ".htm", ".css", ".js", ".mjs", ".json", ".txt", ".xml", ".svg", ".ico",
    ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".woff", ".woff2", ".webmanifest",
}
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{2,40}$")
SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]

TOOLS = [
    {
        "name": "publish_site",
        "description": (
            "Publish a STATIC website (HTML, CSS, JavaScript, images) to a temporary public URL and return the URL. "
            "Send every file of the site in one call; each call replaces the previous version. The entry point must be "
            "`index.html`. Use relative links between files. Server-side code (Node, Python, PHP, databases) is NOT "
            "executed: if the project needs a backend, do not call this tool and tell the user it cannot be published here. "
            f"Limits: {MAX_FILES} files, {MAX_FILE_BYTES // 1024} KB per file, {MAX_TOTAL_BYTES // (1024 * 1024)} MB total. "
            f"The site is deleted automatically after {SITE_TTL_SECONDS // 86400} days."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "token": {"type": "string", "description": "The `deploy.token` value from the project brief JSON."},
                "files": {
                    "type": "array",
                    "description": "All site files.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string", "description": "Relative path such as index.html or assets/app.css"},
                            "content": {"type": "string", "description": "File content."},
                            "encoding": {
                                "type": "string",
                                "enum": ["utf8", "base64"],
                                "description": "Use base64 for binary files such as images. Default utf8.",
                            },
                        },
                        "required": ["path", "content"],
                    },
                },
            },
            "required": ["token", "files"],
        },
    },
    {
        "name": "get_site",
        "description": "Return the public URL, file list and expiry of the currently published site for this project.",
        "inputSchema": {
            "type": "object",
            "properties": {"token": {"type": "string", "description": "The `deploy.token` value from the project brief JSON."}},
            "required": ["token"],
        },
    },
    {
        "name": "delete_site",
        "description": "Delete the published site of this project immediately.",
        "inputSchema": {
            "type": "object",
            "properties": {"token": {"type": "string", "description": "The `deploy.token` value from the project brief JSON."}},
            "required": ["token"],
        },
    },
    {
        "name": "deploy_project",
        "description": (
            "Build and deploy a FULL project (Next.js, Node/Express, Python/Django/Flask, PHP, Go, Docker...) to a real "
            "server and get a public URL. Send ALL source files in one call (no node_modules, no .env). The server builds "
            "it, so include package.json / requirements.txt / Dockerfile as usual. The app must listen on the `port` you pass "
            "(use the PORT environment variable). Building takes a few minutes: this call only starts the build, then call "
            "`get_deploy_status` repeatedly until the state is READY or FAILED. If it FAILED, read the build log, fix the code "
            "and call `deploy_project` again with all files. The public URL is deploy.site_url on the Pixel domain for both static and full-stack apps. Use it for public links, auth callbacks and application URL configuration; trust X-Forwarded-Host/Proto from the gateway. PIXELGENIUS_PUBLIC_URL is injected automatically. Pass secrets and database URLs through `env`, never in files. "
            f"Limits: {liara.MAX_FILES} files, {liara.MAX_FILE_BYTES // 1024} KB per file, {liara.MAX_TOTAL_BYTES // (1024 * 1024)} MB total. "
            f"The deployment is deleted automatically after {liara.TTL_SECONDS // 3600} hours."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "token": {"type": "string", "description": "The `deploy.token` value from the project brief JSON."},
                "platform": {"type": "string", "enum": liara.PLATFORMS, "description": "Runtime of the project."},
                "port": {"type": "integer", "description": "Port the app listens on. Defaults depend on the platform (next/node 3000, python/django/flask/php/laravel 80, go 8080)."},
                "env": {"type": "object", "additionalProperties": {"type": "string"}, "description": "Environment variables, e.g. {\"SECRET_KEY\": \"...\"}."},
                "database": {"type": "string", "enum": ["postgres"], "description": "Set to \"postgres\" if the project needs a database. A PostgreSQL server is created and its connection URL is injected as the DATABASE_URL environment variable (read it from the environment, never hard-code it). Tables are not created for you: run migrations or create tables when the app starts."},
                "files": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "path": {"type": "string"},
                            "content": {"type": "string"},
                            "encoding": {"type": "string", "enum": ["utf8", "base64"]},
                        },
                        "required": ["path", "content"],
                    },
                },
            },
            "required": ["token", "platform", "files"],
        },
    },
    {
        "name": "get_deploy_status",
        "description": "Status of the last deployment: state (QUEUED, BUILDING, DEPLOYING, READY, FAILED, UNHEALTHY), the tail of the build log, and the public URL when ready. Poll every 10-20 seconds.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "token": {"type": "string", "description": "The `deploy.token` value from the project brief JSON."},
                "runtime_logs": {"type": "boolean", "description": "Also return the running app's logs (use when the app is UNHEALTHY or returns errors)."},
            },
            "required": ["token"],
        },
    },
    {
        "name": "delete_deploy",
        "description": "Delete the deployed project of this brief immediately.",
        "inputSchema": {
            "type": "object",
            "properties": {"token": {"type": "string", "description": "The `deploy.token` value from the project brief JSON."}},
            "required": ["token"],
        },
    },
]


for _name, _description, _schema in [
    ("get_workspace", "Read project path, configuration, versioned outputs, approvals and feedback. Never approve on the owner's behalf.", {"properties": {}}),
    ("report_output", "Register a design or development version for owner review. Include complete html for element-level preview comments, plus url when available. Development requires approved design on the design path.", WorkspaceOutputIn.model_json_schema()),
    ("report_activity", "Append a short progress report to the project activity feed. Do not include secrets.", {"properties": {"text": {"type": "string", "maxLength": 5000}}, "required": ["text"]}),
    ("update_feedback", "Update feedback progress. Only the owner can approve. Use open, in_progress or review.", {"properties": {"comment_id": {"type": "string"}, "status": {"type": "string", "enum": ["open", "in_progress", "review"]}}, "required": ["comment_id", "status"]}),
    ("save_admin_credentials", "Save the deployed application's actual admin URL, username and password encrypted for the project owner. Never invent credentials or include them in reports, URLs or logs.", WorkspaceCredentialsIn.model_json_schema()),
]:
    TOOLS.append({"name": _name, "description": _description, "inputSchema": {
        "type": "object", "properties": {"token": {"type": "string"}, **_schema.get("properties", {})},
        "required": ["token", *_schema.get("required", [])],
    }})


def slug_for_order(order_id: str) -> str:
    return "site-" + hashlib.sha1(order_id.encode()).hexdigest()[:10]



def public_site_url(slug: str) -> str:
    value = PREVIEW_URL_TEMPLATE.format(slug=slug)
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or parsed.hostname != f"{slug}.{PREVIEW_BASE_DOMAIN}" or parsed.username or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise ValueError("PREVIEW_URL_TEMPLATE must use {slug}.PREVIEW_BASE_DOMAIN with no credentials, path, query or fragment.")
    return value.rstrip("/")


def canonical_project_url(order_id: str, value: str) -> str:
    """Migrate saved links to this project's Liara origin without changing other sites."""
    slug = slug_for_order(order_id)
    app_name = liara.app_name_for_slug(slug)
    try:
        parsed = urlsplit(value)
    except ValueError:
        return value
    host = parsed.hostname or ""
    if not re.fullmatch(re.escape(app_name) + r"(?:\.[a-z0-9-]+)?\.liara\.(?:run|space)", host):
        return value
    public = urlsplit(public_site_url(slug))
    return urlunsplit((public.scheme, public.netloc, parsed.path, parsed.query, parsed.fragment))


def canonicalize_workspace_urls(order_id: str, data: dict) -> None:
    for entry in [*data.get("deployments", []), *data.get("versions", [])]:
        if entry.get("url"):
            entry["url"] = canonical_project_url(order_id, entry["url"])


def _slug_from_domain(domain: str) -> str:
    host = domain.lower().rstrip(".")
    suffix = "." + PREVIEW_BASE_DOMAIN
    slug = host[:-len(suffix)] if host.endswith(suffix) else ""
    return slug if SLUG_RE.fullmatch(slug) else ""


def _preview_target(slug: str) -> tuple[str, dict | None]:
    if not SLUG_RE.fullmatch(slug):
        return "missing", None
    dynamic = liara.read_meta(slug)
    static = _read_meta(slug)
    if dynamic and dynamic.get("app") == liara.app_name_for_slug(slug) and not _expired(dynamic):
        return "dynamic", dynamic
    if static and not _expired(static):
        return "static", static
    return ("expired", None) if dynamic or static else ("missing", None)


@router.get("/api/preview/route")
async def preview_route(domain: str = ""):
    """Resolve an allowlisted upstream for Caddy without consuming the original body."""
    slug = _slug_from_domain(domain)
    kind, meta = _preview_target(slug)
    headers = {"Cache-Control": "no-store"}
    if kind == "static":
        return Response(status_code=204, headers={**headers, "X-Preview-Kind": "static"})
    if kind != "dynamic":
        return Response(status_code=410 if kind == "expired" else 404, headers=headers)
    if not meta.get("release_id"):
        return Response("پروژه در حال آماده‌سازی است.", status_code=503, headers={**headers, "Retry-After": "5"})
    origin = meta.get("upstream_host", "")
    pattern = re.escape(meta["app"]) + r"(?:\.[a-z0-9-]+)?\.liara\.(?:run|space)"
    if not re.fullmatch(pattern, origin):
        try:
            origin = await _origin_url(meta["app"])
        except (liara.LiaraError, httpx.HTTPError):
            return Response("اتصال به پروژه ممکن نشد.", status_code=502, headers=headers)
        if not re.fullmatch(pattern, origin):
            return Response(status_code=502, headers=headers)
        # Reload before writing so a concurrent deployment's state is preserved.
        current = liara.read_meta(slug)
        if current and current.get("app") == meta["app"]:
            current["upstream_host"] = origin
            liara.write_meta(slug, current)
    return Response(status_code=204, headers={**headers, "X-Preview-Upstream": origin, "X-Preview-Kind": "dynamic"})


def make_deploy_info(order_id: str, workspace_enabled: bool = True) -> dict:
    slug = slug_for_order(order_id)
    token = jwt.encode(
        {"role": "deploy", "sub": order_id, "slug": slug, "exp": int(time.time()) + TOKEN_TTL_SECONDS},
        JWT_SECRET,
        algorithm=ALGORITHM,
    )
    return {
        "mcp_server_url": PUBLIC_MCP_URL,
        "token": token,
        "site_url": public_site_url(slug),
        "site_ttl_days": SITE_TTL_SECONDS // 86400,
        "supports": "static previews and full project deployment via Liara",
        "workspace_url": f"/panel/{order_id}" if workspace_enabled else None,
        "workflow": "Call get_workspace first. The owner selects a path. Use report_output for design/development previews (include html for element selection), report_activity for updates, update_feedback for comment progress. Wait for owner approval of design before development, and development before deploy_project. Use save_admin_credentials to deliver real admin access. An external agent must run these tools; no automatic runner is connected." if workspace_enabled else "Deploy the project using deploy_project and poll get_deploy_status.",
    }


def _slug_from_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise ValueError("Invalid or expired token. Download a fresh project brief and use its deploy.token.")
    slug = payload.get("slug")
    if payload.get("role") != "deploy" or not isinstance(slug, str) or not SLUG_RE.match(slug):
        raise ValueError("Invalid token.")
    return slug


def _site_dir(slug: str) -> Path:
    return SITES_DIR / slug


def _read_meta(slug: str) -> dict | None:
    try:
        return json.loads((_site_dir(slug) / ".meta.json").read_text())
    except Exception:
        return None


def _expired(meta: dict | None) -> bool:
    return not meta or meta.get("expires_at", 0) < time.time()


def cleanup_expired_sites() -> int:
    removed = 0
    for site in SITES_DIR.iterdir():
        if site.is_dir() and not site.name.startswith(".") and _expired(_read_meta(site.name)):
            shutil.rmtree(site, ignore_errors=True)
            removed += 1
    return removed


def _clean_path(raw: str) -> str:
    if not isinstance(raw, str) or not raw.strip() or "\\" in raw or "\x00" in raw:
        raise ValueError(f"Invalid file path: {raw!r}")
    raw = raw.strip()
    path = PurePosixPath(raw[2:] if raw.startswith("./") else raw)
    if path.is_absolute() or ".." in path.parts or any(part.startswith(".") for part in path.parts):
        raise ValueError(f"Invalid file path: {raw!r}")
    if len(path.parts) > 8 or len(str(path)) > 200:
        raise ValueError(f"Path too deep or too long: {raw!r}")
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File type not allowed: {raw!r}. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}")
    return str(path)


def _tool_publish(args: dict) -> dict:
    slug = _slug_from_token(args.get("token", ""))
    files = args.get("files")
    if not isinstance(files, list) or not files:
        raise ValueError("`files` must be a non-empty array.")
    if len(files) > MAX_FILES:
        raise ValueError(f"Too many files (max {MAX_FILES}).")

    prepared: dict[str, bytes] = {}
    total = 0
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("Each file must be an object with `path` and `content`.")
        path = _clean_path(item.get("path"))
        content = item.get("content")
        if not isinstance(content, str):
            raise ValueError(f"File {path} has no string content.")
        try:
            data = base64.b64decode(content, validate=True) if item.get("encoding") == "base64" else content.encode("utf-8")
        except Exception:
            raise ValueError(f"File {path} is not valid base64.")
        if len(data) > MAX_FILE_BYTES:
            raise ValueError(f"File {path} is larger than {MAX_FILE_BYTES // 1024} KB.")
        total += len(data)
        prepared[path] = data
    if total > MAX_TOTAL_BYTES:
        raise ValueError(f"Total size exceeds {MAX_TOTAL_BYTES // (1024 * 1024)} MB.")
    if "index.html" not in prepared:
        raise ValueError("`index.html` is required at the root.")

    target = _site_dir(slug)
    staging = SITES_DIR / f".staging-{slug}-{int(time.time())}"
    shutil.rmtree(staging, ignore_errors=True)
    for path, data in prepared.items():
        destination = staging / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    expires_at = int(time.time()) + SITE_TTL_SECONDS
    (staging / ".meta.json").write_text(json.dumps({"files": sorted(prepared), "expires_at": expires_at}))
    shutil.rmtree(target, ignore_errors=True)
    staging.rename(target)
    cleanup_expired_sites()

    return {
        "url": public_site_url(slug),
        "files": len(prepared),
        "bytes": total,
        "expires_at": expires_at,
        "note": "Open the URL and verify the site. Call publish_site again with all files to update it.",
    }


def _tool_get(args: dict) -> dict:
    slug = _slug_from_token(args.get("token", ""))
    meta = _read_meta(slug)
    if _expired(meta):
        return {"published": False, "url": public_site_url(slug)}
    return {
        "published": True,
        "url": public_site_url(slug),
        "files": meta["files"],
        "expires_at": meta["expires_at"],
    }


def _tool_delete(args: dict) -> dict:
    slug = _slug_from_token(args.get("token", ""))
    shutil.rmtree(_site_dir(slug), ignore_errors=True)
    return {"deleted": True}


async def _tool_deploy(args: dict) -> dict:
    slug = _slug_from_token(args.get("token", ""))
    async with SessionLocal() as db:
        order = await _workspace_agent_order(db, args, designer_only=False)
        version_id = None
        order_id = None
        if order.mode == "designer":
            approved = workspace.state(order)
            workspace.require_deploy_approval(approved)
            version_id = approved["approvals"]["development"]["version_id"]
            order_id = order.id
    platform = args.get("platform")
    if platform not in liara.PLATFORMS:
        raise ValueError(f"`platform` must be one of: {', '.join(liara.PLATFORMS)}")
    port = args.get("port") or liara.DEFAULT_PORTS.get(platform, 3000)
    if not isinstance(port, int) or not 1 <= port <= 65535:
        raise ValueError("`port` must be a valid port number.")
    env = args.get("env") or {}
    if not isinstance(env, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in env.items()):
        raise ValueError("`env` must be an object of string values.")
    files = liara.validate_files(args.get("files"))
    archive = liara.make_archive(files)

    name = liara.app_name_for_slug(slug)
    meta = liara.read_meta(slug)
    try:
        if not meta or meta.get("expires_at", 0) < time.time() or meta.get("provisioned") is False:
            if liara.active_app_count() >= liara.MAX_APPS:
                raise ValueError("The server is at its limit of active deployments. Try again later.")
            if await liara.get_balance() < liara.MIN_BALANCE:
                raise ValueError("Deployment is temporarily unavailable.")
            meta = {"app": name, "platform": platform, "expires_at": int(time.time()) + liara.TTL_SECONDS, "state": "PREPARING", "provisioned": False, "attempt_id": str(time.time_ns()), "version_id": version_id}
            liara.write_meta(slug, meta)
            await liara.create_app(name, platform)
            meta["provisioned"] = True
        meta.update(state="PREPARING", attempt_id=str(time.time_ns()), failure=None, version_id=version_id, order_id=order_id)
        liara.write_meta(slug, meta)
        if args.get("database") == "postgres":
            db_host = name + "-db"
            if not meta.get("database"):
                await liara.create_database(db_host)
                meta["database"] = db_host
                liara.write_meta(slug, meta)
            env = {**env, "DATABASE_URL": await liara.database_url(db_host)}
        env["PIXELGENIUS_PUBLIC_URL"] = public_site_url(slug)
        await liara.set_envs(name, env)
        meta["state"] = "UPLOADING"
        liara.write_meta(slug, meta)
        source_id = await liara.upload_source(name, archive)
        release_id = await liara.create_release(name, source_id, platform, port)
    except (liara.LiaraError, httpx.HTTPError) as e:
        if meta:
            meta.update(state="FAILED", failure="Deployment setup failed. Check hosting configuration and try again.")
            liara.write_meta(slug, meta)
        raise ValueError(str(e))
    meta.update({"state": "BUILDING", "release_id": release_id, "platform": platform, "port": port, "build_errors": []})
    liara.write_meta(slug, meta)
    asyncio.create_task(liara.watch_release(slug, release_id))
    return {
        "state": "BUILDING",
        "release_id": release_id,
        "attempt_id": meta.get("attempt_id"),
        "version_id": meta.get("version_id"),
        "files": len(files),
        "expires_at": meta["expires_at"],
        "next": "Call get_deploy_status every 10-20 seconds until the state is READY or FAILED.",
    }


async def _tool_deploy_status(args: dict) -> dict:
    slug = _slug_from_token(args.get("token", ""))
    meta = liara.read_meta(slug)
    if meta and (meta.get("state") in ("PREPARING", "UPLOADING") or (meta.get("state") == "FAILED" and meta.get("failure"))):
        return {"state": meta["state"], "attempt_id": meta.get("attempt_id"), "fail_reason": meta.get("failure"), "expires_at": meta["expires_at"], "build_log_tail": []}
    if not meta or not meta.get("release_id"):
        return {"deployed": False, "message": "Nothing has been deployed yet. Call deploy_project first."}
    if meta.get("expires_at", 0) < time.time():
        return {"state": "EXPIRED", "release_id": meta["release_id"], "attempt_id": meta.get("attempt_id"), "version_id": meta.get("version_id"), "expires_at": meta["expires_at"], "build_log_tail": []}
    try:
        status = await liara.release_status(meta["release_id"])
        result = {
            "state": status["state"] or "UNKNOWN",
            "release_id": meta["release_id"],
            "attempt_id": meta.get("attempt_id"),
            "version_id": meta.get("version_id"),
            "platform": meta.get("platform"),
            "queue": status["queue"],
            "fail_reason": status["fail_reason"],
            "build_log_tail": status["build_log_tail"],
            "expires_at": meta["expires_at"],
        }
        if meta.get("build_errors"):
            result["build_errors"] = meta["build_errors"]
        if status["state"] == "FAILED":
            result["hint"] = _failure_hint(status["build_log_tail"])
        if status["state"] in ("READY", "UNHEALTHY"):
            result["url"] = public_site_url(slug)
        if args.get("runtime_logs"):
            result["runtime_logs"] = await liara.app_logs(meta["app"])
    except liara.LiaraError as e:
        raise ValueError(str(e))
    return result


def _failure_hint(tail: list[str]) -> str:
    last = " ".join(tail[-3:]).lower()
    if "npm install" in last or "yarn" in last or "pnpm" in last:
        return "The dependency install failed. Check package.json for misspelled or non-existent packages and invalid versions."
    if "npm run build" in last or "next build" in last or "build" in last:
        return "The build command failed. Check the build script, TypeScript/lint errors and missing imports."
    if "pip" in last or "requirements" in last:
        return "pip install failed. Check requirements.txt for wrong package names or versions."
    return "The build failed without an error line. Re-check the entry file, start script, Dockerfile and dependency versions."


async def _origin_url(app_name: str) -> str:
    details = await liara.project_details(app_name)
    text = json.dumps(details)
    match = re.search(re.escape(app_name) + r"(?:\.[a-z0-9-]+)?\.liara\.(?:run|space)", text)
    return match.group(0) if match else f"{app_name}.liara.run"


async def _tool_delete_deploy(args: dict) -> dict:
    slug = _slug_from_token(args.get("token", ""))
    meta = liara.read_meta(slug)
    if meta:
        try:
            await liara.delete_app(meta["app"])
            if meta.get("database"):
                await liara.delete_database(meta["database"])
        except liara.LiaraError as e:
            raise ValueError(str(e))
        (liara.META_DIR / f"{slug}.json").unlink(missing_ok=True)
    return {"deleted": True}


async def _workspace_agent_order(db, args: dict, designer_only: bool = True) -> Order:
    slug = _slug_from_token(args.get("token", ""))
    payload = jwt.decode(args["token"], JWT_SECRET, algorithms=[ALGORITHM])
    order_id = payload.get("sub")
    if not isinstance(order_id, str) or slug_for_order(order_id) != slug:
        raise ValueError("Invalid project token")
    result = await db.execute(select(Order).where(Order.id == order_id).with_for_update())
    order = result.scalar_one_or_none()
    if not order or (designer_only and order.mode != "designer"):
        raise ValueError("Product design workspace not found")
    return order


async def _tool_workspace(args: dict, action: str) -> dict:
    async with SessionLocal() as db:
        order = await _workspace_agent_order(db, args)
        data = workspace.state(order)
        if action == "get":
            # Credentials are write-only to agents, and never included in brief downloads.
            canonicalize_workspace_urls(order.id, data)
            return {**data, "configuration": order.project_brief, "runner_connected": False}
        if action == "output":
            workspace.add_output(data, WorkspaceOutputIn.model_validate(args).model_dump(), "agent")
        elif action == "activity":
            text = args.get("text", "")
            if not isinstance(text, str) or not text.strip() or len(text) > 5000:
                raise ValueError("text must be 1-5000 characters")
            workspace.event(data, text, "agent")
        elif action == "comment":
            body = WorkspaceCommentStatusIn.model_validate(args)
            workspace.change_comment(data, args.get("comment_id"), body.status, "agent")
        elif action == "credentials":
            body = WorkspaceCredentialsIn.model_validate(args)
            order.workspace_credentials = workspace.encrypt_credentials(body.model_dump())
            workspace.event(data, "اطلاعات ورود ادمین توسط ایجنت ثبت شد", "agent")
        order.workspace = data
        await db.commit()
        return {"saved": True}


TOOL_HANDLERS = {
    "get_workspace": lambda a: _tool_workspace(a, "get"),
    "report_output": lambda a: _tool_workspace(a, "output"),
    "report_activity": lambda a: _tool_workspace(a, "activity"),
    "update_feedback": lambda a: _tool_workspace(a, "comment"),
    "save_admin_credentials": lambda a: _tool_workspace(a, "credentials"),
    "publish_site": _tool_publish,
    "get_site": _tool_get,
    "delete_site": _tool_delete,
    "deploy_project": _tool_deploy,
    "get_deploy_status": _tool_deploy_status,
    "delete_deploy": _tool_delete_deploy,
}


def _rpc_result(msg_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _rpc_error(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}


async def _handle_message(message) -> dict | None:
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        return _rpc_error(None, -32600, "Invalid Request")
    if "id" not in message:
        return None  # notification
    msg_id, method, params = message["id"], message.get("method"), message.get("params") or {}

    if method == "initialize":
        requested = params.get("protocolVersion")
        version = requested if requested in SUPPORTED_VERSIONS else SUPPORTED_VERSIONS[0]
        return _rpc_result(
            msg_id,
            {
                "protocolVersion": version,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "freelioai-deploy", "version": "0.1.0"},
                "instructions": "Publishes static websites built from a FreelioAI project brief to a temporary preview URL.",
            },
        )
    if method == "ping":
        return _rpc_result(msg_id, {})
    if method == "tools/list":
        return _rpc_result(msg_id, {"tools": TOOLS})
    if method == "tools/call":
        handler = TOOL_HANDLERS.get(params.get("name"))
        if not handler:
            return _rpc_error(msg_id, -32602, f"Unknown tool: {params.get('name')}")
        try:
            output = handler(params.get("arguments") or {})
            if inspect.isawaitable(output):
                output = await output
            if params.get("name") in ("deploy_project", "get_deploy_status") and output.get("state"):
                async with SessionLocal() as db:
                    order = await _workspace_agent_order(db, params.get("arguments") or {}, designer_only=False)
                    if order.mode == "designer":
                        data = workspace.state(order)
                        workspace.record_deployment(data, output)
                        order.workspace = data
                        await db.commit()
            return _rpc_result(msg_id, {"content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False)}]})
        except HTTPException as e:
            return _rpc_result(msg_id, {"content": [{"type": "text", "text": str(e.detail)}], "isError": True})
        except ValidationError:
            return _rpc_result(msg_id, {"content": [{"type": "text", "text": "Invalid tool arguments; check the tool schema."}], "isError": True})
        except ValueError as e:
            return _rpc_result(msg_id, {"content": [{"type": "text", "text": str(e)}], "isError": True})
        except Exception as e:
            logger.error("MCP tool %s failed: %s", params.get("name"), e, exc_info=True)
            return _rpc_result(msg_id, {"content": [{"type": "text", "text": "Internal error while running the tool."}], "isError": True})
    return _rpc_error(msg_id, -32601, f"Method not found: {method}")


@router.post("/mcp")
async def mcp_endpoint(request: Request):
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse(_rpc_error(None, -32700, "Parse error"), status_code=400)

    if isinstance(payload, list):
        responses = [r for r in [await _handle_message(m) for m in payload] if r is not None]
        return JSONResponse(responses) if responses else Response(status_code=202)

    response = await _handle_message(payload)
    return JSONResponse(response) if response is not None else Response(status_code=202)


@router.get("/api/preview/allow")
async def preview_allow(domain: str = ""):
    """Allow certificates only for live static sites or provisioned full-stack projects."""
    slug = _slug_from_domain(domain)
    kind, _ = _preview_target(slug)
    if kind in ("static", "dynamic"):
        return Response(status_code=200)
    return Response(status_code=404)


SITE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": "frame-ancestors 'none'",
    "Cache-Control": "no-cache",
}


def serve_site(slug: str, url_path: str) -> Response:
    if not SLUG_RE.match(slug):
        return Response("Not found", status_code=404)
    meta = _read_meta(slug)
    if meta is None:
        return Response("این پیش‌نمایش وجود ندارد.", status_code=404, headers=SITE_HEADERS)
    if _expired(meta):
        shutil.rmtree(_site_dir(slug), ignore_errors=True)
        return Response("این پیش‌نمایش منقضی شده است.", status_code=410, headers=SITE_HEADERS)

    root = _site_dir(slug).resolve()
    relative = url_path.lstrip("/") or "index.html"
    candidates = [relative, f"{relative.rstrip('/')}/index.html"]
    for candidate in candidates:
        path = (root / candidate).resolve()
        if root in path.parents and path.is_file() and not path.name.startswith("."):
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
                content_type += "; charset=utf-8"
            return Response(path.read_bytes(), media_type=content_type, headers=SITE_HEADERS)
    return Response("صفحه پیدا نشد.", status_code=404, headers=SITE_HEADERS)
