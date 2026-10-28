import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Freelancer
from schemas import LoginRequest, PasswordLoginIn, SessionOut, TokenOut
from auth import ADMIN_USERNAME, ADMIN_PASSWORD, build_session, create_access_token
from routers.freelancer_auth import verify_password

router = APIRouter()


def _is_admin(username: str, password: str) -> bool:
    return secrets.compare_digest(username, ADMIN_USERNAME) & secrets.compare_digest(password, ADMIN_PASSWORD)


@router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginRequest):
    if not _is_admin(body.username, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نام کاربری یا رمز عبور اشتباه است",
        )
    token = create_access_token({"sub": body.username, "role": "admin"})
    return TokenOut(access_token=token, token_type="bearer")


@router.post("/auth/password-login", response_model=SessionOut)
async def password_login(body: PasswordLoginIn, db: AsyncSession = Depends(get_db)):
    """Password sign-in on the shared login page: the env admin account or a freelancer's email."""
    identifier = body.identifier.strip()
    if _is_admin(identifier, body.password):
        return await build_session(db, admin=True)
    result = await db.execute(select(Freelancer).where(func.lower(Freelancer.email) == identifier.lower()))
    freelancer = result.scalar_one_or_none()
    if not freelancer or not freelancer.password_hash or not verify_password(body.password, freelancer.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="ایمیل یا رمز عبور اشتباه است")
    return await build_session(db, freelancer=freelancer)
