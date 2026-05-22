from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext

from database import get_db
from models import Freelancer
from schemas import FreelancerRegisterIn, FreelancerLoginIn, FreelancerOnboardingIn, FreelancerTokenOut
from auth import create_access_token, get_current_freelancer
from services.ai_settings import update_ai_settings

router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/freelancer/register", response_model=FreelancerTokenOut, status_code=201)
async def register(body: FreelancerRegisterIn, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Freelancer).where(Freelancer.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="این ایمیل قبلاً ثبت شده")

    freelancer = Freelancer(
        email=body.email,
        password_hash=pwd_context.hash(body.password),
        name=body.name,
    )
    db.add(freelancer)
    await db.commit()
    await db.refresh(freelancer)

    token = create_access_token({"sub": freelancer.id, "role": "freelancer"})
    return FreelancerTokenOut(
        access_token=token,
        token_type="bearer",
        freelancer_id=freelancer.id,
        name=freelancer.name,
        onboarding_completed=freelancer.onboarding_completed,
    )


@router.post("/freelancer/login", response_model=FreelancerTokenOut)
async def login(body: FreelancerLoginIn, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Freelancer).where(Freelancer.email == body.email))
    freelancer = result.scalar_one_or_none()
    if not freelancer or not pwd_context.verify(body.password, freelancer.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ایمیل یا رمز اشتباه است")

    token = create_access_token({"sub": freelancer.id, "role": "freelancer"})
    return FreelancerTokenOut(
        access_token=token,
        token_type="bearer",
        freelancer_id=freelancer.id,
        name=freelancer.name,
        onboarding_completed=freelancer.onboarding_completed,
    )


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
    freelancer.onboarding_completed = True

    await update_ai_settings(db, {
        "freelancer_name": body.name,
        "freelancer_position": body.position,
        "freelancer_services": body.services,
        "freelancer_price_range": body.price_range,
        "freelancer_timeline": body.timeline,
        "freelancer_note": body.note or "",
    })

    await db.commit()
    await db.refresh(freelancer)

    token = create_access_token({"sub": freelancer.id, "role": "freelancer"})
    return FreelancerTokenOut(
        access_token=token,
        token_type="bearer",
        freelancer_id=freelancer.id,
        name=freelancer.name,
        onboarding_completed=True,
    )
