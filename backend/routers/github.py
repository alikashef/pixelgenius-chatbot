"""Connect a customer's GitHub account (OAuth app) and list their repositories for the source picker."""
import asyncio
import base64
import hashlib
import os
import secrets
import time
from urllib.parse import urlencode, urlsplit

import httpx
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from auth import ALGORITHM, JWT_SECRET, create_access_token, get_current_customer
from database import get_db
from models import Customer

router = APIRouter()

CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")
APP_URL = (os.getenv("PUBLIC_APP_URL") or (os.getenv("PUBLIC_MCP_URL") or "http://localhost:3000/mcp").rsplit("/mcp", 1)[0]).rstrip("/")
CALLBACK_URL = os.getenv("GITHUB_REDIRECT_URI") or f"{APP_URL}/api/github/callback"
# Private repositories are only listed to OAuth apps with the "repo" scope.
SCOPES = "repo read:user"
API = "https://api.github.com"
_FERNET = Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"{JWT_SECRET}:github".encode()).digest()))


class ConnectIn(BaseModel):
    return_to: str = Field(default="/chat", max_length=500)


def _configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


def _safe_path(path: str) -> str:
    parts = urlsplit(path or "/")
    if parts.scheme or parts.netloc or not (parts.path or "/").startswith("/") or path.startswith("//"):
        return "/chat"
    return path


def _token(customer: Customer) -> str | None:
    if not customer.github_token:
        return None
    try:
        return _FERNET.decrypt(customer.github_token.encode()).decode()
    except InvalidToken:
        return None


async def _customer(db: AsyncSession, payload: dict) -> Customer:
    customer = await db.get(Customer, payload.get("sub"))
    if not customer:
        raise HTTPException(status_code=404, detail="حساب پیدا نشد")
    return customer


def _back(return_to: str, result: str) -> RedirectResponse:
    separator = "&" if "?" in return_to else "?"
    return RedirectResponse(f"{APP_URL}{return_to}{separator}github={result}", status_code=302)


@router.get("/github/status")
async def status(db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    customer = await _customer(db, payload)
    return {"configured": _configured(), "connected": bool(_token(customer)), "login": customer.github_login}


@router.post("/github/connect")
async def connect(body: ConnectIn, payload: dict = Depends(get_current_customer)):
    if not _configured():
        raise HTTPException(status_code=503, detail="اتصال GitHub هنوز روی سرور تنظیم نشده")
    state = create_access_token(
        {"sub": payload["sub"], "role": "github_state", "return_to": _safe_path(body.return_to), "nonce": secrets.token_urlsafe(8)},
        expires_minutes=10,
    )
    query = urlencode({"client_id": CLIENT_ID, "redirect_uri": CALLBACK_URL, "scope": SCOPES, "state": state, "allow_signup": "true"})
    return {"url": f"https://github.com/login/oauth/authorize?{query}"}


@router.get("/github/callback")
async def callback(code: str = "", state: str = "", error: str = "", db: AsyncSession = Depends(get_db)):
    try:
        claims = jwt.decode(state, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        return _back("/chat", "error")
    return_to = _safe_path(claims.get("return_to", "/chat"))
    if claims.get("role") != "github_state" or error or not code:
        return _back(return_to, "denied" if error else "error")
    customer = await db.get(Customer, claims.get("sub"))
    if not customer:
        return _back(return_to, "error")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            exchange = await client.post(
                "https://github.com/login/oauth/access_token",
                data={"client_id": CLIENT_ID, "client_secret": CLIENT_SECRET, "code": code, "redirect_uri": CALLBACK_URL},
                headers={"Accept": "application/json"},
            )
            access_token = exchange.json().get("access_token")
            if not access_token:
                return _back(return_to, "error")
            user = await client.get(f"{API}/user", headers={"Authorization": f"Bearer {access_token}", "Accept": "application/vnd.github+json"})
            user.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return _back(return_to, "error")
    customer.github_token = _FERNET.encrypt(access_token.encode()).decode()
    customer.github_login = user.json().get("login")
    await db.commit()
    return _back(return_to, "connected")


@router.get("/github/repos")
async def repos(db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    customer = await _customer(db, payload)
    token = _token(customer)
    if not token:
        raise HTTPException(status_code=409, detail="حساب GitHub وصل نیست")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(
                f"{API}/user/repos",
                params={"per_page": 100, "sort": "updated", "affiliation": "owner,collaborator,organization_member"},
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="ارتباط با GitHub برقرار نشد")
    if response.status_code == 401:
        # The user revoked access on GitHub; forget the dead token so the UI offers to reconnect.
        customer.github_token = None
        await db.commit()
        raise HTTPException(status_code=409, detail="دسترسی GitHub لغو شده؛ دوباره وصل شو")
    if not response.is_success:
        raise HTTPException(status_code=502, detail="دریافت مخزن‌ها از GitHub ناموفق بود")
    return [
        {
            "full_name": repo["full_name"],
            "name": repo["name"],
            "owner": repo["owner"]["login"],
            "private": repo["private"],
            "html_url": repo["html_url"],
            "description": repo.get("description"),
            "language": repo.get("language"),
            "default_branch": repo.get("default_branch"),
            "updated_at": repo.get("pushed_at") or repo.get("updated_at"),
        }
        for repo in response.json()
        if not repo.get("archived")
    ]


REVIEW_TTL_SECONDS = 1800
SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", "vendor", "__pycache__", ".venv", "venv", "coverage"}
KEY_FILES = (
    "package.json", "requirements.txt", "pyproject.toml", "Dockerfile", "docker-compose.yml", "compose.yml",
    "README.md", "readme.md", ".env.example", "next.config.js", "next.config.mjs", "next.config.ts",
    "vite.config.ts", "vite.config.js", "nuxt.config.ts", "composer.json", "go.mod", "manage.py", "Procfile",
)
_reviews: dict[tuple[str, str], tuple[float, str]] = {}


def _repo_path(url: str) -> str | None:
    parts = urlsplit(url or "")
    segments = parts.path.strip("/").removesuffix(".git").split("/")
    if parts.hostname not in ("github.com", "www.github.com") or len(segments) < 2:
        return None
    return f"{segments[0]}/{segments[1].removesuffix('.git')}"


async def review_repository(customer: Customer | None, url: str) -> str:
    """A compact snapshot of a repository (stack, tree, key files) for the assistant's context; "" when unreachable."""
    full_name = _repo_path(url)
    if not full_name:
        return ""
    key = (str(customer.id) if customer else "", full_name.lower())
    cached = _reviews.get(key)
    if cached and time.monotonic() - cached[0] < REVIEW_TTL_SECONDS:
        return cached[1]
    token = _token(customer) if customer else None
    headers = {"Accept": "application/vnd.github+json", **({"Authorization": f"Bearer {token}"} if token else {})}
    try:
        base = f"{API}/repos/{full_name}"
        async with httpx.AsyncClient(headers=headers, timeout=15) as client:
            meta, languages = await asyncio.gather(client.get(base), client.get(f"{base}/languages"))
            if not meta.is_success:
                return ""
            repo = meta.json()
            branch = repo.get("default_branch") or "main"
            tree = await client.get(f"{base}/git/trees/{branch}", params={"recursive": "1"})
            paths = [
                item["path"] for item in (tree.json().get("tree", []) if tree.is_success else [])
                if item.get("type") == "blob" and not SKIP_DIRS.intersection(item["path"].split("/"))
            ]
            # Prefer the shallowest copy of each key file (the root over a nested example).
            picked: dict[str, str] = {}
            for path in sorted(paths, key=lambda p: (p.count("/"), p)):
                name = path.rsplit("/", 1)[-1]
                if name in KEY_FILES and name not in picked and path.count("/") <= 1:
                    picked[name] = path
            chosen = list(picked.values())[:8]
            raw = {"Accept": "application/vnd.github.raw+json"}
            files = await asyncio.gather(*(client.get(f"{base}/contents/{path}", params={"ref": branch}, headers=raw) for path in chosen))
    except (httpx.HTTPError, ValueError):
        return ""
    lang_text = ", ".join(languages.json().keys()) if languages.is_success else repo.get("language") or ""
    blocks = [
        f"مخزن: {repo.get('full_name')} ({'خصوصی' if repo.get('private') else 'عمومی'})، شاخه‌ی پیش‌فرض: {branch}",
        f"توضیح: {repo.get('description') or '—'}",
        f"زبان‌ها: {lang_text or '—'}",
        f"تعداد فایل‌ها: {len(paths)}",
        "فهرست فایل‌ها:\n" + "\n".join(paths[:300])[:5000],
    ]
    remaining = 16000
    for path, response in zip(chosen, files):
        if not response.is_success or remaining <= 0:
            continue
        text = response.text[: min(remaining, 4000)]
        blocks.append(f"فایل {path}:\n{text}")
        remaining -= len(text)
    summary = "\n\n".join(blocks)
    if len(_reviews) >= 200:
        _reviews.pop(next(iter(_reviews)))
    _reviews[key] = (time.monotonic(), summary)
    return summary


@router.delete("/github")
async def disconnect(db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    customer = await _customer(db, payload)
    customer.github_token = None
    customer.github_login = None
    await db.commit()
    return {"connected": False}
