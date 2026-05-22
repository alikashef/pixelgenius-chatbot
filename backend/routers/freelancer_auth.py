import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Freelancer, Order
from schemas import (
    FreelancerRegisterIn, FreelancerLoginIn, FreelancerOnboardingIn,
    FreelancerTokenOut, OrderOut,
)
from auth import create_access_token, get_current_freelancer

router = APIRouter()


def _hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def _token_out(freelancer: Freelancer, token: str) -> FreelancerTokenOut:
    return FreelancerTokenOut(
        access_token=token,
        token_type="bearer",
        freelancer_id=freelancer.id,
        name=freelancer.name,
        onboarding_completed=freelancer.onboarding_completed,
        bot_token=freelancer.bot_token,
    )


@router.post("/freelancer/register", response_model=FreelancerTokenOut, status_code=201)
async def register(body: FreelancerRegisterIn, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Freelancer).where(Freelancer.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="این ایمیل قبلاً ثبت شده")

    freelancer = Freelancer(
        email=body.email,
        password_hash=_hash_password(body.password),
        name=body.name,
    )
    db.add(freelancer)
    await db.commit()
    await db.refresh(freelancer)

    token = create_access_token({"sub": freelancer.id, "role": "freelancer"})
    return _token_out(freelancer, token)


@router.post("/freelancer/login", response_model=FreelancerTokenOut)
async def login(body: FreelancerLoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Freelancer).where(Freelancer.email == body.email))
    freelancer = result.scalar_one_or_none()
    if not freelancer or not _verify_password(body.password, freelancer.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ایمیل یا رمز اشتباه است")

    token = create_access_token({"sub": freelancer.id, "role": "freelancer"})
    return _token_out(freelancer, token)


@router.get("/freelancer/settings")
async def get_settings(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    freelancer = await db.get(Freelancer, payload["sub"])
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer not found")
    return {
        "name": freelancer.name or "",
        "position": freelancer.position or "",
        "services": freelancer.services or "",
        "price_range": freelancer.price_range or "",
        "timeline": freelancer.timeline or "",
        "note": freelancer.note or "",
        "bot_token": freelancer.bot_token,
    }


@router.put("/freelancer/onboarding", response_model=FreelancerTokenOut)
async def complete_onboarding(
    body: FreelancerOnboardingIn,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    freelancer = await db.get(Freelancer, payload["sub"])
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer not found")

    freelancer.name = body.name
    freelancer.position = body.position
    freelancer.services = body.services
    freelancer.price_range = body.price_range
    freelancer.timeline = body.timeline
    freelancer.note = body.note or None
    freelancer.onboarding_completed = True

    await db.commit()
    await db.refresh(freelancer)

    token = create_access_token({"sub": freelancer.id, "role": "freelancer"})
    return _token_out(freelancer, token)


@router.get("/freelancer/orders", response_model=list[OrderOut])
async def get_freelancer_orders(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    result = await db.execute(
        select(Order)
        .where(Order.freelancer_id == payload["sub"])
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()
