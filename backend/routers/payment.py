import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Order, OrderStatus
from schemas import PaymentRequestIn, PaymentRequestOut, PaymentVerifyOut
from auth import get_current_customer

router = APIRouter()

ZARINPAL_REQUEST_URL = "https://api.zarinpal.com/pg/v4/payment/request.json"
ZARINPAL_VERIFY_URL = "https://api.zarinpal.com/pg/v4/payment/verify.json"
ZARINPAL_GATE_URL = "https://www.zarinpal.com/pg/StartPay/"
MERCHANT_ID = os.getenv("ZARINPAL_MERCHANT_ID", "")

DEV_MODE = not MERCHANT_ID  # mock when no merchant id


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

    zarinpal_payload = {
        "merchant_id": MERCHANT_ID,
        "amount": order.payment_amount,
        "description": f"پرداخت پروژه: {order.project_name}",
        "callback_url": body.callback_url,
        "metadata": {"order_id": order.id},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(ZARINPAL_REQUEST_URL, json=zarinpal_payload, timeout=15)
        data = resp.json()

    if data.get("data", {}).get("code") != 100:
        raise HTTPException(status_code=400, detail=f"خطای درگاه: {data}")

    authority = data["data"]["authority"]
    order.zarinpal_authority = authority
    await db.commit()

    return PaymentRequestOut(payment_url=f"{ZARINPAL_GATE_URL}{authority}", authority=authority)


@router.get("/payment/verify", response_model=PaymentVerifyOut)
async def payment_verify(Authority: str, Status: str, db: AsyncSession = Depends(get_db)):
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

    zarinpal_payload = {
        "merchant_id": MERCHANT_ID,
        "amount": order.payment_amount,
        "authority": Authority,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(ZARINPAL_VERIFY_URL, json=zarinpal_payload, timeout=15)
        data = resp.json()

    code = data.get("data", {}).get("code")
    if code not in (100, 101):
        return PaymentVerifyOut(success=False, message=f"تایید پرداخت ناموفق. کد: {code}")

    ref_id = str(data["data"]["ref_id"])
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return PaymentVerifyOut(success=True, ref_id=ref_id, order_id=order.id, message="پرداخت موفق")
