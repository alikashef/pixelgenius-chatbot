import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from urllib.parse import urlencode, urlsplit
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, update

from database import get_db
from models import CreditLedger, Customer, InviteCode, Order, OrderStatus
from schemas import PaymentRequestIn, PaymentRequestOut, PaymentVerifyOut
from auth import get_current_admin, get_current_customer
from services import credits

router = APIRouter()

PAYPING_BASE = os.getenv("PAYPING_BASE_URL", "https://api.payping.ir").rstrip("/")
PAYPING_TOKEN = os.getenv("PAYPING_TOKEN", "")
APP_URL = (os.getenv("PUBLIC_APP_URL") or (os.getenv("PUBLIC_MCP_URL") or "http://localhost:3000/mcp").rsplit("/mcp", 1)[0]).rstrip("/")
API_URL = (os.getenv("PUBLIC_API_URL") or APP_URL).rstrip("/")

DEV_MODE = not PAYPING_TOKEN  # mock when no token


def _headers() -> dict:
    return {"Authorization": f"Bearer {PAYPING_TOKEN}", "Content-Type": "application/json"}


def _rial_to_toman(rial: int) -> int:
    return int(rial) // 10


@router.post("/payment/request", response_model=PaymentRequestOut)
async def payment_request(
    body: PaymentRequestIn,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    result = await db.execute(
        select(Order).where(Order.id == body.order_id, Order.customer_id == payload["sub"])
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    if order.status != OrderStatus.awaiting_payment:
        raise HTTPException(status_code=400, detail="این سفارش آماده پرداخت نیست")
    if not order.payment_amount:
        raise HTTPException(status_code=400, detail="مبلغ پرداخت تعیین نشده")

    if DEV_MODE:
        authority = f"DEV-{uuid.uuid4().hex[:16].upper()}"
        order.zarinpal_authority = authority
        await db.commit()
        # redirect directly to verify with mock OK status
        mock_verify_url = f"{body.callback_url}?Authority={authority}&Status=OK"
        print(f"[DEV] Mock payment → {mock_verify_url}")
        return PaymentRequestOut(payment_url=mock_verify_url, authority=authority)

    cb = body.callback_url
    if urlsplit(cb).netloc != urlsplit(APP_URL).netloc and not DEV_MODE:
        raise HTTPException(status_code=400, detail="آدرس بازگشت نامعتبر است")

    payload = {
        "amount": _rial_to_toman(order.payment_amount),
        "returnUrl": f"{API_URL}/api/payment/return?{urlencode({'cb': cb})}",
        "clientRefId": order.id,
        "description": f"پرداخت پروژه: {order.project_name}",
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{PAYPING_BASE}/v3/pay", json=payload, headers=_headers(), timeout=15)
    try:
        data = resp.json()
    except ValueError:
        data = {}

    payment_code = data.get("paymentCode")
    gate_url = data.get("url")
    if resp.status_code != 200 or not payment_code:
        print(f"[PayPing] create failed {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(status_code=400, detail="خطا در ایجاد پرداخت")

    order.zarinpal_authority = payment_code  # ستون قدیمی؛ حالا paymentCode پی‌پینگ را نگه می‌دارد
    await db.commit()

    return PaymentRequestOut(payment_url=gate_url or f"{PAYPING_BASE}/v3/pay/start/{payment_code}", authority=payment_code)


@router.post("/payment/return")
async def payment_return(
    cb: str,
    code: str | None = Form(None),
    refid: str | None = Form(None),
    data: str | None = Form(None),
    status: str | None = Form(None),
):
    """پی‌پینگ بعد از پرداخت اینجا POST می‌کند؛ کاربر را با GET به صفحه‌ی فرانت برمی‌گردانیم."""
    if urlsplit(cb).netloc != urlsplit(APP_URL).netloc:
        raise HTTPException(status_code=400, detail="آدرس بازگشت نامعتبر است")
    info: dict = {}
    if data:
        try:
            info = json.loads(data)
        except ValueError:
            info = {}
    payment_code = info.get("paymentCode") or code or ""
    ref_id = info.get("paymentRefId") or refid or ""
    ok = str(status) == "1" and bool(ref_id)
    q = urlencode({"Authority": payment_code, "Status": "OK" if ok else "NOK", "RefId": ref_id})
    return RedirectResponse(f"{cb}{'&' if '?' in cb else '?'}{q}", status_code=303)


@router.get("/payment/verify", response_model=PaymentVerifyOut)
async def payment_verify(Authority: str, Status: str, RefId: str = "", db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.zarinpal_authority == Authority))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")

    if Status != "OK":
        order.status = OrderStatus.cancelled
        await db.commit()
        return PaymentVerifyOut(success=False, message="پرداخت لغو شد")

    if DEV_MODE and Authority.startswith("DEV-"):
        order.status = OrderStatus.paid
        order.paid_at = datetime.now(timezone.utc)
        await db.commit()
        return PaymentVerifyOut(success=True, ref_id="DEV-REF-123456", order_id=order.id, message="پرداخت موفق (محیط توسعه)")

    if order.status == OrderStatus.paid:
        return PaymentVerifyOut(success=True, ref_id=RefId or None, order_id=order.id, message="پرداخت موفق")

    payload = {
        "paymentRefId": int(RefId) if RefId.isdigit() else 0,
        "paymentCode": Authority,
        "amount": _rial_to_toman(order.payment_amount),
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{PAYPING_BASE}/v3/pay/verify", json=payload, headers=_headers(), timeout=15)
    try:
        data = resp.json()
    except ValueError:
        data = {}

    already = resp.status_code == 409 and (data.get("metaData") or {}).get("code") == 110
    if resp.status_code in (202, 502):
        return PaymentVerifyOut(success=False, message="پرداخت در حال بررسی است؛ چند لحظه بعد دوباره تلاش کنید")
    if resp.status_code != 200 and not already:
        print(f"[PayPing] verify failed {resp.status_code}: {resp.text[:300]}")
        return PaymentVerifyOut(success=False, message="تایید پرداخت ناموفق بود")

    if not already:
        paid = data.get("amount")
        if data.get("clientRefId") not in (None, order.id) or (paid is not None and int(paid) != _rial_to_toman(order.payment_amount)):
            print(f"[PayPing] mismatch for {order.id}: {data}")
            return PaymentVerifyOut(success=False, message="اطلاعات پرداخت با سفارش مطابقت ندارد")

    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return PaymentVerifyOut(success=True, ref_id=RefId or None, order_id=order.id, message="پرداخت موفق")


# ── Credit wallet ─────────────────────────────────────────────────────────────
class TopupIn(BaseModel):
    amount_toman: int
    code: str = ""
    callback_url: str = ""


class GrantIn(BaseModel):
    phone: str
    credits: int
    note: str = ""


def _bonus_percent(invite: InviteCode | None) -> int:
    if not invite or invite.revoked or invite.used_count >= invite.max_uses:
        return 0
    expires = invite.expires_at
    if expires is not None:
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires <= datetime.now(timezone.utc):
            return 0
    return invite.percent or 0


async def _topup_quote(db: AsyncSession, amount_toman: int, code: str) -> tuple[int, int, str]:
    if amount_toman < credits.MIN_TOPUP_TOMAN:
        raise HTTPException(status_code=400, detail=f"حداقل شارژ {credits.MIN_TOPUP_TOMAN:,} تومان است")
    base = amount_toman // credits.TOMAN_PER_CREDIT
    code = (code or "").strip().upper()
    bonus = 0
    if code:
        percent = _bonus_percent(await db.get(InviteCode, code))
        if not percent:
            raise HTTPException(status_code=400, detail="کد تخفیف نامعتبر است یا ظرفیتش تمام شده")
        bonus = base * percent // 100
    return base, bonus, code


@router.get("/wallet")
async def wallet(days: int = 30, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    """Balance plus the usage report: where credits went, per service and per day."""
    days = max(1, min(days, 365))
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (await db.execute(
        select(CreditLedger).where(CreditLedger.customer_id == payload["sub"], CreditLedger.created_at >= since).order_by(CreditLedger.created_at.desc())
    )).scalars().all()
    by_kind: dict[str, dict] = {}
    daily: dict[str, int] = defaultdict(int)
    for row in rows:
        if row.delta < 0:
            entry = by_kind.setdefault(row.kind, {"kind": row.kind, "label": credits.KIND_LABELS.get(row.kind, row.kind), "credits": 0, "count": 0})
            entry["credits"] += -row.delta
            entry["count"] += 1
            daily[row.created_at.astimezone(timezone.utc).date().isoformat()] += -row.delta
    today = datetime.now(timezone.utc).date()
    series = [{"date": (today - timedelta(days=n)).isoformat(), "credits": daily.get((today - timedelta(days=n)).isoformat(), 0)} for n in range(days - 1, -1, -1)]
    return {
        "credits": await credits.balance(db, payload["sub"]),
        "toman_per_credit": credits.TOMAN_PER_CREDIT,
        "min_topup_toman": credits.MIN_TOPUP_TOMAN,
        "days": days,
        "spent": sum(e["credits"] for e in by_kind.values()),
        "by_kind": sorted(by_kind.values(), key=lambda e: -e["credits"]),
        "daily": series,
        "ledger": [
            {"id": r.id, "delta": r.delta, "balance_after": r.balance_after, "kind": r.kind, "label": credits.KIND_LABELS.get(r.kind, r.kind), "reason": r.reason, "created_at": r.created_at}
            for r in rows[:100]
        ],
    }


@router.get("/wallet/quote")
async def wallet_quote(amount_toman: int, code: str = "", db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_customer)):
    base, bonus, _code = await _topup_quote(db, amount_toman, code)
    return {"credits": base, "bonus": bonus, "total": base + bonus}


@router.post("/wallet/topup")
async def wallet_topup(body: TopupIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    customer = await db.get(Customer, payload["sub"])
    if not customer:
        raise HTTPException(status_code=404, detail="حساب پیدا نشد")
    base, bonus, code = await _topup_quote(db, body.amount_toman, body.code)

    cb = body.callback_url or f"{APP_URL}/payment/verify?kind=wallet"
    if urlsplit(cb).netloc != urlsplit(APP_URL).netloc and not DEV_MODE:
        raise HTTPException(status_code=400, detail="آدرس بازگشت نامعتبر است")

    pending = {"amount": body.amount_toman, "credits": base, "bonus": bonus, "code": code}
    if DEV_MODE:
        pending["payment_code"] = f"DEV-{uuid.uuid4().hex[:16].upper()}"
        customer.wallet_pending = pending
        await db.commit()
        return {"payment_url": f"{cb}{'&' if '?' in cb else '?'}Authority={pending['payment_code']}&Status=OK"}

    pending["client_ref"] = f"wallet:{customer.id}:{uuid.uuid4().hex[:8]}"
    request_body = {
        "amount": body.amount_toman,
        "returnUrl": f"{API_URL}/api/payment/return?{urlencode({'cb': cb})}",
        "clientRefId": pending["client_ref"],
        "description": f"شارژ کیف پول کردیت ({base:,} کردیت)",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(f"{PAYPING_BASE}/v3/pay", json=request_body, headers=_headers(), timeout=15)
    try:
        data = resp.json()
    except ValueError:
        data = {}
    payment_code = data.get("paymentCode")
    if resp.status_code != 200 or not payment_code:
        print(f"[PayPing] topup create failed {resp.status_code}: {resp.text[:300]}")
        raise HTTPException(status_code=400, detail="خطا در ایجاد پرداخت")
    pending["payment_code"] = payment_code
    customer.wallet_pending = pending
    await db.commit()
    return {"payment_url": data.get("url") or f"{PAYPING_BASE}/v3/pay/start/{payment_code}"}


@router.get("/wallet/verify")
async def wallet_verify(Authority: str, Status: str, RefId: str = "", db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    customer = await db.get(Customer, payload["sub"])
    pending = (customer.wallet_pending or {}) if customer else {}
    if not customer or pending.get("payment_code") != Authority:
        # A refresh or a second verify of a payment that was already credited is a success, not an error.
        done = (await db.execute(
            select(CreditLedger.id).where(CreditLedger.customer_id == payload["sub"], CreditLedger.kind == "topup", CreditLedger.ref.in_([Authority, RefId or Authority])).limit(1)
        )).first()
        if done:
            return {"success": True, "message": "این پرداخت قبلاً ثبت شده", "credits": await credits.balance(db, payload["sub"])}
        return {"success": False, "message": "پرداخت پیدا نشد", "credits": await credits.balance(db, payload["sub"])}
    if Status != "OK":
        customer.wallet_pending = None
        await db.commit()
        return {"success": False, "message": "پرداخت لغو شد", "credits": customer.credits}

    if not (DEV_MODE and Authority.startswith("DEV-")):
        request_body = {"paymentRefId": int(RefId) if RefId.isdigit() else 0, "paymentCode": Authority, "amount": pending["amount"]}
        async with httpx.AsyncClient() as client:
            resp = await client.post(f"{PAYPING_BASE}/v3/pay/verify", json=request_body, headers=_headers(), timeout=15)
        try:
            data = resp.json()
        except ValueError:
            data = {}
        already = resp.status_code == 409 and (data.get("metaData") or {}).get("code") == 110
        if resp.status_code in (202, 502):
            return {"success": False, "message": "پرداخت در حال بررسی است؛ چند لحظه بعد دوباره تلاش کنید", "credits": customer.credits}
        if resp.status_code != 200 and not already:
            print(f"[PayPing] topup verify failed {resp.status_code}: {resp.text[:300]}")
            return {"success": False, "message": "تایید پرداخت ناموفق بود", "credits": customer.credits}
        if not already:
            paid = data.get("amount")
            if data.get("clientRefId") not in (None, pending.get("client_ref")) or (paid is not None and int(paid) != int(pending["amount"])):
                print(f"[PayPing] topup mismatch for {customer.id}: {data}")
                return {"success": False, "message": "اطلاعات پرداخت مطابقت ندارد", "credits": customer.credits}

    # Clear the pending payment first so a repeated verify cannot credit it twice.
    claimed = await db.execute(
        update(Customer).where(Customer.id == customer.id, Customer.wallet_pending.is_not(None)).values(wallet_pending=None)
    )
    if claimed.rowcount != 1:
        await db.rollback()
        return {"success": True, "message": "قبلاً ثبت شده", "credits": await credits.balance(db, customer.id)}
    code = pending.get("code") or ""
    if code:
        await db.execute(update(InviteCode).where(InviteCode.code == code, InviteCode.used_count < InviteCode.max_uses).values(used_count=InviteCode.used_count + 1))
    ref = RefId or Authority
    await credits.grant(db, customer.id, pending["credits"], "topup", f"شارژ کیف پول · {pending['amount']:,} تومان", ref)
    if pending.get("bonus"):
        await credits.grant(db, customer.id, pending["bonus"], "bonus", f"کد تخفیف {code}", ref)
    return {"success": True, "message": "کیف پول شارژ شد", "credits": await credits.balance(db, customer.id)}


@router.get("/admin/customers")
async def admin_customers(q: str = "", limit: int = 100, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    """Customers with their wallet: balance, total credited and total spent."""
    limit = max(1, min(limit, 300))
    stmt = select(Customer).order_by(Customer.created_at.desc()).limit(limit)
    term = q.strip()
    if term:
        like = f"%{term}%"
        stmt = select(Customer).where(Customer.phone.like(like) | Customer.first_name.like(like) | Customer.last_name.like(like)).order_by(Customer.created_at.desc()).limit(limit)
    customers = (await db.execute(stmt)).scalars().all()
    totals: dict[str, dict[str, int]] = {}
    if customers:
        rows = (await db.execute(
            select(CreditLedger.customer_id, func.coalesce(func.sum(CreditLedger.delta).filter(CreditLedger.delta > 0), 0), func.coalesce(-func.sum(CreditLedger.delta).filter(CreditLedger.delta < 0), 0))
            .where(CreditLedger.customer_id.in_([c.id for c in customers]))
            .group_by(CreditLedger.customer_id)
        )).all()
        totals = {cid: {"added": int(added), "spent": int(spent)} for cid, added, spent in rows}
    return [
        {
            "id": c.id,
            "phone": c.phone,
            "name": " ".join(filter(None, [c.first_name, c.last_name])) or None,
            "credits": c.credits,
            "added": totals.get(c.id, {}).get("added", 0),
            "spent": totals.get(c.id, {}).get("spent", 0),
            "created_at": c.created_at,
        }
        for c in customers
    ]


class GrantAllIn(BaseModel):
    credits: int
    note: str = ""
    expected_count: int


KAYA_API = (os.getenv("KAYA_BASE_URL") or "https://kayaai.ir/api/v1").rstrip("/")
GAP_APIS = [u.rstrip("/") for u in (os.getenv("GAPGPT_BASE_URL"), "https://api.gapgpt.app", "https://api.gapapi.com") if u]


async def _get_json(client: httpx.AsyncClient, url: str, key: str):
    try:
        response = await client.get(url, headers={"Authorization": f"Bearer {key}"})
    except httpx.HTTPError:
        return None
    if response.status_code != 200:
        return None
    try:
        return response.json()
    except ValueError:
        return None


def _num(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def _line(label: str, usd: float, rate: float) -> dict:
    return {"label": label, "usd": round(usd, 3), "toman": round(usd * rate)}


async def _gapgpt_balance(client: httpx.AsyncClient, rate: float) -> dict:
    key = os.getenv("GAPGPT_API_KEY", "")
    out = {"name": "gapgpt", "title": "gapgpt (مدل‌ها و تصویر)", "topup_url": "https://gapgpt.app/platform-v2/wallet", "ok": False, "lines": [], "error": ""}
    if not key:
        out["error"] = "کلید تنظیم نشده است"
        return out
    for base in GAP_APIS:
        usage = await _get_json(client, f"{base}/v1/dashboard/billing/usage", key)
        if usage is None:
            continue
        out["ok"] = True
        used = (_num(usage.get("total_usage")) or 0) / 100  # reported in cents
        out["lines"].append(_line("مصرف تجمعی", used, rate))
        plan = await _get_json(client, f"{base}/v1/dashboard/billing/subscription", key) or {}
        limit = _num(plan.get("hard_limit_usd"))
        if limit is not None and limit < 1_000_000:
            out["lines"].append(_line("باقی‌مانده", limit - used, rate))
        return out
    out["error"] = "پاسخی از gapgpt نیامد"
    return out


async def _kaya_balance(client: httpx.AsyncClient, rate: float) -> dict:
    key = os.getenv("KAYA_API_KEY", "")
    out = {"name": "kaya", "title": "Kaya (صدای گوینده)", "topup_url": "https://kayaai.ir/dashboard", "ok": False, "lines": [], "error": ""}
    if not key:
        out["error"] = "کلید تنظیم نشده است"
        return out
    account = await _get_json(client, f"{KAYA_API.removesuffix('/v1')}/account", key)
    credit = (account or {}).get("credits") if isinstance(account, dict) else None
    if not isinstance(credit, dict) or _num(credit.get("balance")) is None:
        out["error"] = "پاسخی از Kaya نیامد"
        return out
    out["ok"] = True
    out["lines"].append({"label": "موجودی", "text": f"{_num(credit['balance']):,.1f} اعتبار"})
    if _num(credit.get("totalUsed")) is not None:
        out["lines"].append({"label": "مصرف تجمعی", "text": f"{_num(credit['totalUsed']):,.1f} اعتبار"})
    return out


@router.get("/admin/provider-balances")
async def admin_provider_balances(_: dict = Depends(get_current_admin)):
    """What the AI providers behind the video maker report for our keys: gapgpt (all models) and Kaya (voice)."""
    rate = credits.USD_TOMAN
    async with httpx.AsyncClient(timeout=6) as client:
        gap, kaya = await asyncio.gather(_gapgpt_balance(client, rate), _kaya_balance(client, rate))
    return {"rate": rate, "providers": [gap, kaya]}


@router.get("/admin/customers/count")
async def admin_customers_count(db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    return {"count": (await db.execute(select(func.count()).select_from(Customer))).scalar_one()}


@router.post("/admin/credits/grant-all")
async def admin_grant_all(body: GrantAllIn, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    """A gift for every customer. `expected_count` must match the current total so a stale confirmation cannot go out."""
    if not 1 <= body.credits <= 100_000:
        raise HTTPException(status_code=400, detail="مقدار هدیه باید بین ۱ تا ۱۰۰٬۰۰۰ کردیت باشد")
    total = (await db.execute(select(func.count()).select_from(Customer))).scalar_one()
    if total != body.expected_count:
        raise HTTPException(status_code=409, detail=f"تعداد کاربران عوض شده ({total} نفر)؛ دوباره تایید کن")
    given = await credits.grant_all(db, body.credits, "bonus", body.note.strip() or "هدیه‌ی مدیر")
    return {"count": given}


@router.post("/admin/credits/grant")
async def admin_grant(body: GrantIn, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    customer = (await db.execute(select(Customer).where(Customer.phone == body.phone.strip()))).scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=404, detail="کاربری با این شماره پیدا نشد")
    if body.credits == 0:
        raise HTTPException(status_code=400, detail="مقدار صفر است")
    try:
        after = await credits.grant(db, customer.id, body.credits, "admin", body.note or "تنظیم دستی مدیر")
    except credits.InsufficientCredits:
        raise HTTPException(status_code=400, detail="موجودی کاربر برای این کسر کافی نیست")
    return {"credits": after}
