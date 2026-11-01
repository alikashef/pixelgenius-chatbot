import json
import os
import uuid
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit
from fastapi import APIRouter, Depends, Form, HTTPException, Request
from fastapi.responses import RedirectResponse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Order, OrderStatus
from schemas import PaymentRequestIn, PaymentRequestOut, PaymentVerifyOut
from auth import get_current_customer

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
