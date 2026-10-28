import asyncio
import io
import json
import logging
import os
import re
import tarfile
import tempfile
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.liara.ir"
META_DIR = Path(os.getenv("SITES_DIR", "/app/sites")) / ".liara"
META_DIR.mkdir(parents=True, exist_ok=True)

PLAN_ID = os.getenv("LIARA_PLAN") or "small-g2"
BUNDLE_PLAN_ID = os.getenv("LIARA_BUNDLE_PLAN") or "basic"
TTL_SECONDS = int(float(os.getenv("LIARA_TTL_HOURS") or "24") * 3600)
MAX_APPS = int(os.getenv("LIARA_MAX_APPS") or "3")
MIN_BALANCE = int(os.getenv("LIARA_MIN_BALANCE") or "50000")

PLATFORMS = ["next", "node", "python", "django", "flask", "laravel", "php", "dotnet", "go", "react", "vue", "angular", "static", "docker"]
DEFAULT_PORTS = {
    "static": 80, "python": 80, "react": 80, "vue": 80, "angular": 80, "laravel": 80,
    "django": 80, "flask": 80, "php": 80, "next": 3000, "dotnet": 80, "go": 8080, "node": 3000, "docker": 3000,
}

MAX_FILES = 400
MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_TOTAL_BYTES = 12 * 1024 * 1024
BLOCKED_SUFFIXES = {".exe", ".dll", ".so", ".dylib", ".bin", ".sh", ".bat", ".cmd", ".jar", ".class"}
BLOCKED_DIRS = {"node_modules", ".git", ".next", "__pycache__", "venv", ".venv"}


class LiaraError(Exception):
    pass


# The hosting provider stays internal: anything shown to customers or their AI tools
# (errors, build and runtime logs) has the provider's name and hostnames replaced.
_PROVIDER_HOST = re.compile(r"(?i)\b[a-z0-9.-]*\.liara\.(?:run|space|ir|cloud)\b")
_PROVIDER_NAME = re.compile(r"(?i)liara|لیارا")


def scrub(text) -> str:
    if text is None:
        return ""
    return _PROVIDER_NAME.sub("hosting", _PROVIDER_HOST.sub("[host]", str(text)))


def _token() -> str:
    token = os.getenv("LIARA_API_TOKEN", "")
    if not token:
        raise LiaraError("Deployment is not configured on this server.")
    return token


async def _request(method: str, path: str, *, timeout: float = 60, **kwargs) -> httpx.Response:
    headers = {"Authorization": f"Bearer {_token()}", "Accept": "application/json"}
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=timeout) as client:
        response = await client.request(method, path, headers=headers, **kwargs)
    return response


def _fail(response: httpx.Response, action: str) -> LiaraError:
    detail = ""
    try:
        body = response.json()
        detail = body.get("message") or body.get("error") or ""
    except Exception:
        detail = response.text[:200]
    logger.warning("hosting API: %s failed (%s) %s", action, response.status_code, detail)
    if response.status_code == 402:
        return LiaraError("Deployment is temporarily unavailable. Try again later.")
    return LiaraError(scrub(f"{action} failed ({response.status_code}) {detail}".strip()))


def app_name_for_slug(slug: str) -> str:
    return "fai-" + slug.removeprefix("site-")


def validate_files(files: list) -> dict[str, bytes]:
    import base64
    from pathlib import PurePosixPath

    if not isinstance(files, list) or not files:
        raise ValueError("`files` must be a non-empty array.")
    if len(files) > MAX_FILES:
        raise ValueError(f"Too many files (max {MAX_FILES}).")
    prepared: dict[str, bytes] = {}
    total = 0
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("Each file must be an object with `path` and `content`.")
        raw = item.get("path")
        if not isinstance(raw, str) or not raw.strip() or "\\" in raw or "\x00" in raw:
            raise ValueError(f"Invalid file path: {raw!r}")
        raw = raw.strip()
        path = PurePosixPath(raw[2:] if raw.startswith("./") else raw)
        if path.is_absolute() or ".." in path.parts or len(path.parts) > 12:
            raise ValueError(f"Invalid file path: {raw!r}")
        if any(part in BLOCKED_DIRS for part in path.parts):
            raise ValueError(f"Do not send {path.parts[0]}/ (it is built on the server): {raw!r}")
        if path.name == ".env" or path.name.startswith(".env."):
            if path.name != ".env.example":
                raise ValueError("Do not send .env files; pass secrets through the `env` argument.")
        if path.suffix.lower() in BLOCKED_SUFFIXES:
            raise ValueError(f"File type not allowed: {raw!r}")
        content = item.get("content")
        if not isinstance(content, str):
            raise ValueError(f"File {raw} has no string content.")
        try:
            data = base64.b64decode(content, validate=True) if item.get("encoding") == "base64" else content.encode("utf-8")
        except Exception:
            raise ValueError(f"File {raw} is not valid base64.")
        if len(data) > MAX_FILE_BYTES:
            raise ValueError(f"File {raw} is larger than {MAX_FILE_BYTES // 1024} KB.")
        total += len(data)
        prepared[str(path)] = data
    if total > MAX_TOTAL_BYTES:
        raise ValueError(f"Total size exceeds {MAX_TOTAL_BYTES // (1024 * 1024)} MB.")
    return prepared


def make_archive(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for path, data in sorted(files.items()):
            info = tarfile.TarInfo(name=path)
            info.size = len(data)
            info.mode = 0o644
            info.mtime = int(time.time())
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def read_meta(slug: str) -> dict | None:
    try:
        return json.loads((META_DIR / f"{slug}.json").read_text())
    except Exception:
        return None


def write_meta(slug: str, meta: dict) -> None:
    META_DIR.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=META_DIR, prefix=f".{slug}-", delete=False) as handle:
            temporary = Path(handle.name)
            json.dump(meta, handle)
        temporary.replace(META_DIR / f"{slug}.json")
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def active_app_count() -> int:
    count = 0
    for path in META_DIR.glob("*.json"):
        try:
            if json.loads(path.read_text()).get("expires_at", 0) > time.time():
                count += 1
        except Exception:
            continue
    return count


async def get_balance() -> float:
    response = await _request("GET", "/v1/billing")
    if not response.is_success:
        raise _fail(response, "Reading balance")
    body = response.json()
    return float((body.get("user") or body).get("balance", 0))


async def project_exists(name: str) -> bool:
    response = await _request("GET", f"/v1/projects/{name}")
    return response.is_success


NETWORK_NAME = os.getenv("LIARA_NETWORK") or "freelioai"
_network_id: str | None = None


async def ensure_network() -> str:
    """g2 plans need a private network; create the shared one on first use."""
    global _network_id
    if _network_id:
        return _network_id
    response = await _request("GET", "/v1/networks")
    if not response.is_success:
        raise _fail(response, "Reading networks")
    for network in response.json().get("networks", []):
        if network.get("name") == NETWORK_NAME:
            _network_id = network["_id"]
            return _network_id
    created = await _request("POST", "/v1/networks", json={"networkName": NETWORK_NAME})
    if created.status_code not in (200, 201, 409):
        raise _fail(created, "Creating the network")
    response = await _request("GET", "/v1/networks")
    for network in response.json().get("networks", []):
        if network.get("name") == NETWORK_NAME:
            _network_id = network["_id"]
            return _network_id
    raise LiaraError("Could not find the private network after creating it.")


async def create_app(name: str, platform: str) -> None:
    network_id = await ensure_network()
    response = await _request(
        "POST",
        "/v1/projects",
        json={"name": name, "planID": PLAN_ID, "platform": platform, "bundlePlanID": BUNDLE_PLAN_ID, "network": network_id},
    )
    if response.status_code == 409:
        return
    if not response.is_success:
        raise _fail(response, "Creating the app")


async def upload_source(name: str, archive: bytes) -> str:
    response = await _request(
        "POST",
        f"/v2/projects/{name}/sources",
        timeout=300,
        files={"file": ("source.tar.gz", archive, "application/gzip")},
    )
    if not response.is_success:
        raise _fail(response, "Uploading the source")
    return response.json()["sourceID"]


async def create_release(name: str, source_id: str, platform: str, port: int) -> str:
    body = {
        "sourceID": source_id,
        "type": platform,
        "port": port,
        "message": "PixelGenius deploy",
        "build": {"cache": True},
        "platformConfig": {},
    }
    response = await _request("POST", f"/v2/projects/{name}/releases", timeout=120, json=body)
    if not response.is_success:
        raise _fail(response, "Creating the release")
    return response.json()["releaseID"]


async def set_envs(name: str, variables: dict[str, str]) -> None:
    if not variables:
        return
    response = await _request(
        "POST",
        "/v1/projects/update-envs",
        json={"project": name, "variables": [{"key": k, "value": v} for k, v in variables.items()]},
    )
    if not response.is_success:
        raise _fail(response, "Setting environment variables")


async def release_status(release_id: str) -> dict:
    """State plus build output of a release. Build output lines come from the build-logs endpoint."""
    response = await _request("GET", f"/v2/releases/{release_id}/build-logs")
    if not response.is_success:
        raise _fail(response, "Reading build logs")
    body = response.json()
    release = body.get("release") or {}
    lines = []
    for item in body.get("buildOutput") or []:
        prefix = "" if item.get("stream") == "STDOUT" else "[error] "
        lines.append(scrub(prefix + str(item.get("line", "")).rstrip()))
    return {
        "state": release.get("state"),
        "queue": release.get("queue"),
        "fail_reason": scrub(release.get("failReason")) or None,
        "build_log_tail": lines[-60:],
    }


DB_PLAN_ID = os.getenv("LIARA_DB_PLAN") or "small-g2"
DB_BUNDLE_PLAN_ID = os.getenv("LIARA_DB_BUNDLE_PLAN") or "basic"
DB_VERSION = os.getenv("LIARA_DB_VERSION") or "16.14"


async def create_database(hostname: str) -> None:
    network_id = await ensure_network()
    response = await _request(
        "POST",
        "/v1/databases",
        json={
            "hostname": hostname,
            "planID": DB_PLAN_ID,
            "bundlePlanID": DB_BUNDLE_PLAN_ID,
            "publicNetwork": False,
            "type": "postgres",
            "version": DB_VERSION,
            "network": network_id,
        },
        timeout=90,
    )
    if response.status_code == 409:
        return
    if not response.is_success:
        raise _fail(response, "Creating the database")


async def find_database(hostname: str) -> dict | None:
    response = await _request("GET", "/v1/databases")
    if not response.is_success:
        raise _fail(response, "Listing databases")
    for item in response.json().get("databases", []):
        if item.get("hostname") == hostname:
            return item
    return None


async def database_url(hostname: str, timeout_seconds: int = 240) -> str:
    """Wait until the database is running and return its internal connection URL."""
    started = time.time()
    while time.time() - started < timeout_seconds:
        listed = await find_database(hostname)
        if listed:
            db_id = listed.get("_id") or listed.get("id") or listed.get("DBId")
            response = await _request("GET", f"/v1/databases/{db_id}")
            if response.is_success:
                db = response.json().get("database", {})
                if db.get("status") in ("RUNNING", "running", "Running") and db.get("root_password"):
                    port = db.get("internalPort") or db.get("port") or 5432
                    user = db.get("username") or "root"
                    name = db.get("dbName") or "postgres"
                    return f"postgresql://{user}:{db['root_password']}@{db.get('hostname', hostname)}:{port}/{name}"
        await asyncio.sleep(6)
    raise LiaraError("The database is not ready yet. Try again in a minute.")


async def delete_database(hostname: str) -> None:
    listed = await find_database(hostname)
    if not listed:
        return
    db_id = listed.get("_id") or listed.get("id") or listed.get("DBId")
    response = await _request("DELETE", f"/v1/databases/{db_id}")
    if not response.is_success and response.status_code != 404:
        raise _fail(response, "Deleting the database")


TERMINAL_STATES = {"READY", "FAILED", "UNHEALTHY", "CANCELED", "TIMEDOUT"}


async def watch_release(slug: str, release_id: str, max_seconds: int = 600) -> None:
    """Poll build output while the release builds and keep non-STDOUT (error) lines.

    Liara only streams build errors live; they are not returned once the build is over.
    """
    context = read_meta(slug) or {}
    last_state = None
    since = None
    errors: list[str] = []
    started = time.time()
    while time.time() - started < max_seconds:
        try:
            query = f"?since={since}" if since else ""
            response = await _request("GET", f"/v2/releases/{release_id}/build-logs{query}", timeout=30)
            if response.is_success:
                body = response.json()
                output = body.get("buildOutput") or []
                for item in output:
                    if item.get("stream") != "STDOUT":
                        errors.append(str(item.get("line", "")).rstrip())
                if output:
                    since = output[-1].get("createdAt") or since
                state = (body.get("release") or {}).get("state")
                if state and state != last_state and context.get("order_id"):
                    from services import workspace
                    await workspace.record_for_order(context["order_id"], {
                        "state": state, "release_id": release_id,
                        "attempt_id": context.get("attempt_id"),
                        "version_id": context.get("version_id"),
                        "expires_at": context.get("expires_at"),
                    })
                    last_state = state
                if errors or state in TERMINAL_STATES:
                    meta = read_meta(slug) or {}
                    if meta.get("release_id") == release_id:
                        meta["build_errors"] = errors[-40:]
                        write_meta(slug, meta)
                    if state in TERMINAL_STATES:
                        return
        except Exception as e:
            logger.warning("watch_release error: %s", e)
        await asyncio.sleep(2)


async def app_logs(name: str) -> list[str]:
    response = await _request("GET", f"/v1/projects/{name}/logs")
    if not response.is_success:
        raise _fail(response, "Reading app logs")
    body = response.json()
    items = body.get("logs") if isinstance(body, dict) else body
    lines = []
    for item in (items or [])[-60:]:
        lines.append(scrub(item.get("message", json.dumps(item, ensure_ascii=False)) if isinstance(item, dict) else item))
    return lines


async def project_details(name: str) -> dict:
    response = await _request("GET", f"/v1/projects/{name}")
    if not response.is_success:
        raise _fail(response, "Reading the app")
    return response.json()


async def delete_app(name: str) -> None:
    response = await _request("DELETE", f"/v1/projects/{name}")
    if response.status_code not in (200, 204, 404):
        raise _fail(response, "Deleting the app")


_site_locks: dict[str, asyncio.Lock] = {}


def site_lock(slug: str) -> asyncio.Lock:
    return _site_locks.setdefault(slug, asyncio.Lock())


async def cleanup_expired() -> int:
    removed = 0
    for path in META_DIR.glob("*.json"):
        try:
            meta = json.loads(path.read_text())
        except Exception:
            path.unlink(missing_ok=True)
            continue
        async with site_lock(path.stem):
            meta = read_meta(path.stem)
            if not meta or meta.get("expires_at", 0) > time.time():
                continue
            try:
                await delete_app(meta["app"])
                if meta.get("database"):
                    await delete_database(meta["database"])
                path.unlink(missing_ok=True)
                removed += 1
            except Exception as e:
                logger.warning("Could not delete expired Liara app %s: %s", meta.get("app"), e)
    return removed


async def cleanup_loop(interval_seconds: int = 300) -> None:
    while True:
        try:
            if os.getenv("LIARA_API_TOKEN"):
                await cleanup_expired()
        except Exception as e:
            logger.warning("Liara cleanup failed: %s", e)
        await asyncio.sleep(interval_seconds)
