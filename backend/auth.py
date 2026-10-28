import os
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Customer, Freelancer
from schemas import CustomerTokenOut, FreelancerTokenOut, SessionOut

JWT_SECRET = os.getenv("JWT_SECRET", "change-this-secret")
ALGORITHM = "HS256"
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in (phone or "").translate(_DIGITS) if c.isdigit())
    for prefix in ("0098", "98"):
        if digits.startswith(prefix) and len(digits) == len(prefix) + 10:
            return "0" + digits[len(prefix):]
    return digits


# Phones that also get the admin panel when they sign in with an SMS code.
ADMIN_PHONES = {normalize_phone(p) for p in os.getenv("ADMIN_PHONES", "").split(",") if p.strip()}

bearer_scheme = HTTPBearer()
optional_bearer = HTTPBearer(auto_error=False)


def create_access_token(data: dict, expires_minutes: int = 60 * 8) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_admin(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    payload = _decode(credentials.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not admin")
    return payload


def get_current_customer(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    payload = _decode(credentials.credentials)
    if payload.get("role") != "customer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not customer")
    return payload


def get_current_freelancer(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> dict:
    payload = _decode(credentials.credentials)
    if payload.get("role") != "freelancer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not freelancer")
    return payload


def customer_session(customer: Customer) -> CustomerTokenOut:
    return CustomerTokenOut(
        access_token=create_access_token({"sub": customer.id, "role": "customer"}),
        token_type="bearer",
        customer_id=customer.id,
        first_name=customer.first_name,
    )


def freelancer_session(freelancer: Freelancer) -> FreelancerTokenOut:
    return FreelancerTokenOut(
        access_token=create_access_token({"sub": freelancer.id, "role": "freelancer"}),
        token_type="bearer",
        freelancer_id=freelancer.id,
        name=freelancer.name,
        onboarding_completed=freelancer.onboarding_completed,
        bot_token=freelancer.bot_token,
    )


async def build_session(db: AsyncSession, customer: Customer | None = None, freelancer: Freelancer | None = None, admin: bool = False) -> SessionOut:
    """One sign-in, every panel: the phone ties a customer to their freelancer account and admin rights."""
    if customer and not freelancer:
        freelancer = (await db.execute(select(Freelancer).where(Freelancer.phone == customer.phone))).scalar_one_or_none()
    if freelancer and freelancer.phone and not customer:
        customer = (await db.execute(select(Customer).where(Customer.phone == freelancer.phone))).scalar_one_or_none()
    phone = customer.phone if customer else freelancer.phone if freelancer else None
    admin = admin or bool(phone and normalize_phone(phone) in ADMIN_PHONES)
    roles = [role for role, present in (("customer", customer), ("freelancer", freelancer), ("admin", admin)) if present]
    return SessionOut(
        roles=roles,
        customer=customer_session(customer) if customer else None,
        freelancer=freelancer_session(freelancer) if freelancer else None,
        admin_token=create_access_token({"sub": phone or ADMIN_USERNAME, "role": "admin"}) if admin else None,
        needs_phone=bool(freelancer and not freelancer.phone),
    )
