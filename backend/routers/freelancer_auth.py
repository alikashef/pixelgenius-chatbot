from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from passlib.context import CryptContext

from database import get_db
from models import Freelancer
from schemas import FreelancerRegisterIn, FreelancerLoginIn, FreelancerTokenOut
from auth import create_access_token

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
