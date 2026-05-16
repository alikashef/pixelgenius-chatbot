from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Customer
from schemas import OtpSendRequest, OtpVerifyRequest, CustomerTokenOut
from otp_store import generate_otp, verify_otp
from sms import send_otp
from auth import create_access_token

router = APIRouter()


@router.post("/customer/otp/send")
async def send(body: OtpSendRequest, db: AsyncSession = Depends(get_db)):
    phone = body.phone.strip()
    code = generate_otp(phone)
    sent = await send_otp(phone, code)
    if not sent:
        raise HTTPException(status_code=500, detail="ارسال پیامک ناموفق بود")
    return {"message": "کد تایید ارسال شد"}


@router.post("/customer/otp/verify", response_model=CustomerTokenOut)
async def verify(body: OtpVerifyRequest, db: AsyncSession = Depends(get_db)):
    if not verify_otp(body.phone.strip(), body.code.strip()):
        raise HTTPException(status_code=400, detail="کد اشتباه یا منقضی شده")

    result = await db.execute(select(Customer).where(Customer.phone == body.phone))
    customer = result.scalar_one_or_none()

    if not customer:
        customer = Customer(phone=body.phone.strip())
        db.add(customer)
        await db.commit()
        await db.refresh(customer)

    token = create_access_token({"sub": customer.id, "role": "customer"})
    return CustomerTokenOut(access_token=token, token_type="bearer", customer_id=customer.id)
