"""Connect a customer's GitHub account (OAuth app) and list their repositories for the source picker."""
import base64
import hashlib
import os
import secrets
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


@router.delete("/github")
async def disconnect(db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    customer = await _customer(db, payload)
    customer.github_token = None
    customer.github_login = None
    await db.commit()
    return {"connected": False}
