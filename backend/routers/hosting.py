"""Customer-facing hosting: published sites, the free trial renewal and custom domains."""
import asyncio
import os
import re
import socket
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_customer
from database import get_db
from models import Order, SiteDomain
from routers import site_mcp
from services import liara

router = APIRouter()

# Paid renewal waits for the payment gateway; until then a site can renew its trial for free.
BILLING_ENABLED = os.getenv("HOSTING_BILLING", "").lower() in ("1", "true", "on")
TRIAL_SECONDS = site_mcp.SITE_TTL_SECONDS
# A free renewal opens in the last days of the trial, so abandoned sites still expire.
RENEW_WINDOW_SECONDS = 2 * 86400
MAX_DOMAINS_PER_SITE = 3
DOMAIN_RE = re.compile(r"^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
RESERVED_HOSTS = {h for h in (os.getenv("APP_DOMAIN", "").lower(), site_mcp.PREVIEW_BASE_DOMAIN) if h}


async def load_custom_domains(db: AsyncSession) -> None:
    rows = await db.execute(select(SiteDomain.domain, SiteDomain.slug).where(SiteDomain.verified.is_(True)))
    site_mcp.CUSTOM_DOMAINS.clear()
    site_mcp.CUSTOM_DOMAINS.update({domain: slug for domain, slug in rows.all()})


class DomainIn(BaseModel):
    domain: str = Field(max_length=300)


def normalize_domain(value: str) -> str:
    host = value.strip().lower()
    host = re.sub(r"^[a-z]+://", "", host).split("/")[0].split("?")[0].split(":")[0].rstrip(".")
    try:
        host = host.encode("idna").decode()
    except UnicodeError:
        raise HTTPException(422, "دامنه معتبر نیست")
    if not DOMAIN_RE.fullmatch(host):
        raise HTTPException(422, "دامنه معتبر نیست؛ مثل example.com یا www.example.com")
    if any(host == r or host.endswith("." + r) for r in RESERVED_HOSTS):
        raise HTTPException(422, "این دامنه قابل اتصال نیست")
    return host


def _site_state(slug: str) -> dict | None:
    dynamic = liara.read_meta(slug)
    if dynamic and dynamic.get("app") == liara.app_name_for_slug(slug):
        kind, meta = "dynamic", dynamic
    else:
        meta = site_mcp._read_meta(slug)
        kind = "static"
    if not meta:
        return None
    expires_at = int(meta.get("expires_at", 0))
    remaining = expires_at - time.time()
    return {
        "kind": kind,
        "expires_at": expires_at,
        "expired": remaining <= 0,
        "has_database": bool(meta.get("database")),
        "state": meta.get("state", "READY") if kind == "dynamic" else "READY",
        # Expired dynamic projects are removed from the server right away; static files wait out the grace period.
        "can_renew_free": not BILLING_ENABLED and remaining <= RENEW_WINDOW_SECONDS and (kind == "static" or remaining > 0),
    }


async def _own_order(db: AsyncSession, payload: dict, order_id: str) -> Order:
    order = await db.get(Order, order_id)
    if not order or order.customer_id != payload.get("sub"):
        raise HTTPException(404, "سایت پیدا نشد")
    return order


def _target(slug: str) -> str:
    return f"{slug}.{site_mcp.PREVIEW_BASE_DOMAIN}"


async def _resolve(host: str) -> set[str]:
    try:
        infos = await asyncio.wait_for(asyncio.to_thread(socket.getaddrinfo, host, 443, proto=socket.IPPROTO_TCP), timeout=6)
    except (OSError, asyncio.TimeoutError):
        return set()
    return {info[4][0] for info in infos}


@router.get("/customer/sites")
async def list_sites(db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    orders = (await db.execute(select(Order).where(Order.customer_id == payload["sub"]).order_by(Order.created_at.desc()))).scalars().all()
    domains = (await db.execute(select(SiteDomain).where(SiteDomain.order_id.in_([o.id for o in orders])))).scalars().all() if orders else []
    sites = []
    for order in orders:
        slug = site_mcp.slug_for_order(order.id)
        state = _site_state(slug)
        if not state:
            continue
        sites.append({
            "order_id": order.id,
            "project_name": order.project_name,
            "url": site_mcp.public_site_url(slug),
            "target": _target(slug),
            **state,
            "domains": [{"domain": d.domain, "verified": d.verified} for d in domains if d.order_id == order.id],
        })
    # The A record for apex domains: the gateway's addresses, read from any site host.
    ips = sorted(await _resolve(sites[0]["target"])) if sites else []
    return {"billing_enabled": BILLING_ENABLED, "trial_days": TRIAL_SECONDS // 86400, "server_ips": ips, "sites": sites}


@router.post("/customer/sites/{order_id}/renew")
async def renew(order_id: str, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    if BILLING_ENABLED:
        raise HTTPException(402, "تمدید با پرداخت انجام می‌شود")
    order = await _own_order(db, payload, order_id)
    slug = site_mcp.slug_for_order(order.id)
    state = _site_state(slug)
    if not state:
        raise HTTPException(410, "این سایت دیگر وجود ندارد؛ دوباره منتشرش کن")
    if not state["can_renew_free"]:
        raise HTTPException(409, "تمدید رایگان از دو روز آخر مهلت فعال می‌شود")
    expires_at = await site_mcp.extend_site(slug, state["kind"], int(TRIAL_SECONDS - max(0, state["expires_at"] - time.time())))
    return {"expires_at": expires_at}


@router.post("/customer/sites/{order_id}/domains")
async def add_domain(order_id: str, body: DomainIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _own_order(db, payload, order_id)
    domain = normalize_domain(body.domain)
    slug = site_mcp.slug_for_order(order.id)
    if not _site_state(slug):
        raise HTTPException(409, "اول سایت را منتشر کن")
    existing = await db.get(SiteDomain, domain)
    if existing:
        raise HTTPException(409, "این دامنه قبلاً به یک سایت وصل شده")
    count = len((await db.execute(select(SiteDomain).where(SiteDomain.order_id == order.id))).scalars().all())
    if count >= MAX_DOMAINS_PER_SITE:
        raise HTTPException(409, f"حداکثر {MAX_DOMAINS_PER_SITE} دامنه برای هر سایت")
    db.add(SiteDomain(domain=domain, order_id=order.id, slug=slug))
    await db.commit()
    return {"domain": domain, "verified": False}


@router.post("/customer/sites/{order_id}/domains/{domain}/verify")
async def verify_domain(order_id: str, domain: str, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _own_order(db, payload, order_id)
    record = await db.get(SiteDomain, domain.lower())
    if not record or record.order_id != order.id:
        raise HTTPException(404, "دامنه پیدا نشد")
    target_ips, domain_ips = await _resolve(_target(record.slug)), await _resolve(record.domain)
    if not target_ips or not domain_ips or not domain_ips <= target_ips:
        return {"domain": record.domain, "verified": False, "detail": "رکورد DNS هنوز درست نیست یا منتشر نشده؛ معمولاً تا چند ساعت طول می‌کشد."}
    record.verified = True
    await db.commit()
    site_mcp.CUSTOM_DOMAINS[record.domain] = record.slug
    return {"domain": record.domain, "verified": True}


@router.delete("/customer/sites/{order_id}/domains/{domain}")
async def remove_domain(order_id: str, domain: str, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _own_order(db, payload, order_id)
    record = await db.get(SiteDomain, domain.lower())
    if not record or record.order_id != order.id:
        raise HTTPException(404, "دامنه پیدا نشد")
    await db.delete(record)
    await db.commit()
    site_mcp.CUSTOM_DOMAINS.pop(record.domain, None)
    return {"removed": record.domain}
