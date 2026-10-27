import secrets
import time

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Customer
from schemas import HandoffCreateIn, HandoffCreateOut, HandoffOut, OtpSendRequest, OtpVerifyRequest, CustomerTokenOut
from otp_store import generate_otp, verify_otp
from sms import SmsSendError, send_otp
from auth import create_access_token

router = APIRouter()

HANDOFF_TTL_SECONDS = 20 * 60
_handoffs: dict[str, tuple[float, HandoffCreateIn]] = {}


def _prune_handoffs() -> None:
    now = time.time()
    expired = [key for key, (created_at, _) in _handoffs.items() if now - created_at > HANDOFF_TTL_SECONDS]
    for key in expired:
        del _handoffs[key]


def _validate_handoff(body: HandoffCreateIn) -> None:
    if body.version != 1 or body.proposal.type != "proposal":
        raise HTTPException(status_code=400, detail="handoff نامعتبر است")
    if len(body.chatHistory) > 80:
        raise HTTPException(status_code=413, detail="حجم گفتگو بیش از حد مجاز است")
    if len(body.attachments) > 20:
        raise HTTPException(status_code=413, detail="تعداد فایل‌ها بیش از حد مجاز است")


@router.post("/customer/otp/send")
async def send(body: OtpSendRequest, db: AsyncSession = Depends(get_db)):
    phone = body.phone.strip()
    code = generate_otp(phone)
    try:
        await send_otp(phone, code)
    except SmsSendError as exc:
        raise HTTPException(status_code=502, detail=f"ارسال پیامک ناموفق بود: {exc}") from exc
    return {"message": "کد تایید ارسال شد"}


@router.post("/customer/handoff", response_model=HandoffCreateOut)
async def create_handoff(body: HandoffCreateIn):
    _prune_handoffs()
    _validate_handoff(body)
    handoff_id = secrets.token_urlsafe(18)
    _handoffs[handoff_id] = (time.time(), body)
    return HandoffCreateOut(handoff_id=handoff_id)


@router.get("/customer/handoff/{handoff_id}", response_model=HandoffOut)
async def read_handoff(handoff_id: str):
    _prune_handoffs()
    entry = _handoffs.pop(handoff_id, None)
    if not entry:
        raise HTTPException(status_code=404, detail="handoff پیدا نشد یا منقضی شده است")
    return entry[1]


@router.post("/customer/otp/verify", response_model=CustomerTokenOut)
async def verify(body: OtpVerifyRequest, db: AsyncSession = Depends(get_db)):
    phone = body.phone.strip()

    if not verify_otp(phone, body.code.strip()):
        raise HTTPException(status_code=400, detail="کد اشتباه یا منقضی شده")

    result = await db.execute(select(Customer).where(Customer.phone == phone))
    customer = result.scalar_one_or_none()

    if not customer:
        customer = Customer(phone=phone)
        db.add(customer)
        await db.commit()
        await db.refresh(customer)

    token = create_access_token({"sub": customer.id, "role": "customer"})
    return CustomerTokenOut(
        access_token=token,
        token_type="bearer",
        customer_id=customer.id,
        first_name=customer.first_name,
    )
