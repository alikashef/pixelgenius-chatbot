import os
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Order, OrderStatus
from schemas import PaymentRequestIn, PaymentRequestOut, PaymentVerifyOut

router = APIRouter()

ZARINPAL_REQUEST_URL = "https://api.zarinpal.com/pg/v4/payment/request.json"
ZARINPAL_VERIFY_URL = "https://api.zarinpal.com/pg/v4/payment/verify.json"
ZARINPAL_GATE_URL = "https://www.zarinpal.com/pg/StartPay/"
MERCHANT_ID = os.getenv("ZARINPAL_MERCHANT_ID", "")


@router.post("/payment/request", response_model=PaymentRequestOut)
async def payment_request(body: PaymentRequestIn, db: AsyncSession = Depends(get_db)):
    order = Order(
        project_name=body.project_name,
        summary=body.summary,
        features=body.features,
        tech_stack=body.tech_stack,
        delivery_days=body.delivery_days,
        price=body.price,
        price_label=body.price_label,
        status=OrderStatus.pending,
    )
    db.add(order)
    await db.flush()

    zarinpal_payload = {
        "merchant_id": MERCHANT_ID,
        "amount": body.price,
        "description": f"پرداخت پروژه: {body.project_name}",
        "callback_url": body.callback_url,
        "metadata": {"order_id": order.id},
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(ZARINPAL_REQUEST_URL, json=zarinpal_payload, timeout=15)
        data = resp.json()

    if data.get("data", {}).get("code") != 100:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Zarinpal error: {data}")

    authority = data["data"]["authority"]
    order.zarinpal_authority = authority
    await db.commit()

    return PaymentRequestOut(
        payment_url=f"{ZARINPAL_GATE_URL}{authority}",
        authority=authority,
        order_id=order.id,
    )


@router.get("/payment/verify", response_model=PaymentVerifyOut)
async def payment_verify(Authority: str, Status: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Order).where(Order.zarinpal_authority == Authority))
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if Status != "OK":
        order.status = OrderStatus.cancelled
        await db.commit()
        return PaymentVerifyOut(success=False, message="پرداخت لغو شد")

    zarinpal_payload = {
        "merchant_id": MERCHANT_ID,
        "amount": order.price,
        "authority": Authority,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.post(ZARINPAL_VERIFY_URL, json=zarinpal_payload, timeout=15)
        data = resp.json()

    code = data.get("data", {}).get("code")
    if code not in (100, 101):
        order.status = OrderStatus.cancelled
        await db.commit()
        return PaymentVerifyOut(success=False, message=f"تایید پرداخت ناموفق بود. کد: {code}")

    ref_id = str(data["data"]["ref_id"])
    order.status = OrderStatus.paid
    order.paid_at = datetime.now(timezone.utc)
    await db.commit()

    return PaymentVerifyOut(success=True, ref_id=ref_id, order_id=order.id, message="پرداخت موفق")
