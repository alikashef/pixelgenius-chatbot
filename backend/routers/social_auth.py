"""Sign in with Google / GitHub. The phone stays the account key: a first-time social login must confirm a phone by SMS."""
import os
import secrets
import time
from urllib.parse import urlencode, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import ALGORITHM, JWT_SECRET, build_session, create_access_token
from database import get_db
from models import Customer
from schemas import OtpSessionOut

router = APIRouter()

APP_URL = (os.getenv("PUBLIC_APP_URL") or (os.getenv("PUBLIC_MCP_URL") or "http://localhost:3000/mcp").rsplit("/mcp", 1)[0]).rstrip("/")
# Frontends that may receive the result (the public site plus local development).
ALLOWED_ORIGINS = {APP_URL, "http://localhost:3000", "http://localhost:3001"}
CODE_TTL_SECONDS = 120

PROVIDERS = {
    "google": {
        "client_id": os.getenv("GOOGLE_CLIENT_ID", ""),
        "client_secret": os.getenv("GOOGLE_CLIENT_SECRET", ""),
        "redirect": os.getenv("GOOGLE_REDIRECT_URI") or f"{APP_URL}/api/auth/google/callback",
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "scope": "openid email profile",
        "column": "google_sub",
    },
    "github": {
        # Same OAuth app as the repository picker; GitHub only accepts a redirect under its registered callback path.
        "client_id": os.getenv("GITHUB_LOGIN_CLIENT_ID") or os.getenv("GITHUB_CLIENT_ID", ""),
        "client_secret": os.getenv("GITHUB_LOGIN_CLIENT_SECRET") or os.getenv("GITHUB_CLIENT_SECRET", ""),
        "redirect": os.getenv("GITHUB_LOGIN_REDIRECT_URI") or f"{APP_URL}/api/github/callback/login",
        "authorize": "https://github.com/login/oauth/authorize",
        "scope": "read:user",
        "column": "github_id",
    },
}

_login_codes: dict[str, tuple[float, str]] = {}


def _configured(provider: str) -> bool:
    config = PROVIDERS[provider]
    return bool(config["client_id"] and config["client_secret"])


def _provider(name: str) -> dict:
    if name not in PROVIDERS or not _configured(name):
        raise HTTPException(status_code=503, detail="این روش ورود هنوز روی سرور تنظیم نشده")
    return PROVIDERS[name]


def _origin(origin: str) -> str:
    parts = urlsplit(origin or "")
    clean = f"{parts.scheme}://{parts.netloc}"
    return clean if clean in ALLOWED_ORIGINS else APP_URL


def _back(origin: str, **query: str) -> RedirectResponse:
    return RedirectResponse(f"{origin}/login?{urlencode(query)}", status_code=302)


def _prune_codes() -> None:
    now = time.time()
    for key in [k for k, (created, _) in _login_codes.items() if now - created > CODE_TTL_SECONDS]:
        del _login_codes[key]


async def _google_profile(client: httpx.AsyncClient, config: dict, code: str) -> dict:
    token = await client.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "redirect_uri": config["redirect"],
            "grant_type": "authorization_code",
        },
    )
    access = token.json().get("access_token")
    if not access:
        raise HTTPException(status_code=400, detail="ورود با گوگل انجام نشد")
    info = (await client.get("https://openidconnect.googleapis.com/v1/userinfo", headers={"Authorization": f"Bearer {access}"})).json()
    return {"id": str(info.get("sub") or ""), "name": info.get("name") or ""}


async def _github_profile(client: httpx.AsyncClient, config: dict, code: str) -> dict:
    token = await client.post(
        "https://github.com/login/oauth/access_token",
        data={"code": code, "client_id": config["client_id"], "client_secret": config["client_secret"], "redirect_uri": config["redirect"]},
        headers={"Accept": "application/json"},
    )
    access = token.json().get("access_token")
    if not access:
        raise HTTPException(status_code=400, detail="ورود با گیت‌هاب انجام نشد")
    info = (await client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {access}", "Accept": "application/vnd.github+json"})).json()
    return {"id": str(info.get("id") or ""), "name": info.get("name") or info.get("login") or ""}


@router.get("/auth/social/providers")
async def providers():
    # The CDN in front of the site would otherwise keep serving an old answer after the keys change.
    return JSONResponse({name: _configured(name) for name in PROVIDERS}, headers={"Cache-Control": "no-store"})


@router.get("/auth/{provider}/start")
async def start(provider: str, origin: str = ""):
    config = _provider(provider)
    state = create_access_token({"provider": provider, "origin": _origin(origin), "nonce": secrets.token_urlsafe(8)}, expires_minutes=10)
    query = urlencode({
        "client_id": config["client_id"],
        "redirect_uri": config["redirect"],
        "response_type": "code",
        "scope": config["scope"],
        "state": state,
        **({"prompt": "select_account"} if provider == "google" else {}),
    })
    return RedirectResponse(f"{config['authorize']}?{query}", status_code=302)


@router.get("/github/callback/login")
async def github_login_callback(code: str = "", state: str = "", error: str = "", db: AsyncSession = Depends(get_db)):
    return await callback("github", code=code, state=state, error=error, db=db)


@router.get("/auth/{provider}/callback")
async def callback(provider: str, code: str = "", state: str = "", error: str = "", db: AsyncSession = Depends(get_db)):
    config = _provider(provider)
    try:
        saved = jwt.decode(state, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="درخواست ورود نامعتبر یا منقضی است")
    if saved.get("provider") != provider:
        raise HTTPException(status_code=400, detail="درخواست ورود نامعتبر است")
    origin = saved["origin"]
    if error or not code:
        return _back(origin, social_error="denied")

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            profile = await (_google_profile if provider == "google" else _github_profile)(client, config, code)
        except HTTPException:
            return _back(origin, social_error="failed")
    if not profile["id"]:
        return _back(origin, social_error="failed")

    customer = (await db.execute(select(Customer).where(getattr(Customer, config["column"]) == profile["id"]))).scalar_one_or_none()
    if customer:
        _prune_codes()
        login_code = secrets.token_urlsafe(24)
        _login_codes[login_code] = (time.time(), customer.id)
        return _back(origin, social_code=login_code)
    pending = create_access_token({"role": "social", "provider": provider, "id": profile["id"], "name": profile["name"]}, expires_minutes=15)
    return _back(origin, social=pending, provider=provider)


class SocialExchangeIn(BaseModel):
    code: str


@router.post("/auth/social/exchange", response_model=OtpSessionOut)
async def exchange(body: SocialExchangeIn, db: AsyncSession = Depends(get_db)):
    _prune_codes()
    entry = _login_codes.pop(body.code, None)
    customer = await db.get(Customer, entry[1]) if entry else None
    if not customer:
        raise HTTPException(status_code=400, detail="کد ورود منقضی شده؛ دوباره تلاش کن")
    session = await build_session(db, customer=customer)
    return OtpSessionOut(**session.model_dump(), **session.customer.model_dump())


async def link_identity(db: AsyncSession, customer: Customer, social_token: str) -> None:
    """Attaches a verified Google/GitHub identity to the customer who just confirmed their phone."""
    try:
        payload = jwt.decode(social_token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=400, detail="ورود اجتماعی منقضی شده؛ دوباره از اول وارد شو")
    if payload.get("role") != "social" or payload.get("provider") not in PROVIDERS:
        raise HTTPException(status_code=400, detail="ورود اجتماعی نامعتبر است")
    column = PROVIDERS[payload["provider"]]["column"]
    owner = (await db.execute(select(Customer).where(getattr(Customer, column) == payload["id"]))).scalar_one_or_none()
    if owner and owner.id != customer.id:
        raise HTTPException(status_code=409, detail="این حساب قبلاً به شماره‌ی دیگری وصل شده")
    setattr(customer, column, payload["id"])
    if not customer.first_name and payload.get("name"):
        customer.first_name = payload["name"].split(" ")[0][:80]
    await db.commit()
