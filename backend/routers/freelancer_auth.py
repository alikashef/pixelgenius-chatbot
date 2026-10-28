import secrets
from datetime import datetime, timedelta, timezone

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, update

from database import get_db
from models import Freelancer, InviteCode, Order
from schemas import (
    AdminApproveIn, AdminFreelancerOut, InviteCreateIn, InviteOut, FreelancerRegisterIn, FreelancerLoginIn, FreelancerOnboardingIn,
    FreelancerKnowledge, FreelancerTokenOut, OrderOut, BotProfileOut, WidgetSettings,
)
from auth import create_access_token, get_current_admin, get_current_freelancer
from routers.orders import add_order_file, approve, load_order, save_proposal, summarize

router = APIRouter()


def _hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt()).decode()


def _verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


def widget_settings(freelancer: Freelancer) -> WidgetSettings:
    try:
        return WidgetSettings.model_validate(freelancer.widget_settings or {})
    except ValueError:
        return WidgetSettings()


def knowledge(freelancer: Freelancer) -> FreelancerKnowledge:
    try:
        return FreelancerKnowledge.model_validate(freelancer.knowledge or {})
    except ValueError:
        return FreelancerKnowledge()


INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def normalize_code(code: str) -> str:
    return (code or "").strip().upper()


def _invite_out(invite: InviteCode) -> InviteOut:
    expires = invite.expires_at
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    active = not invite.revoked and invite.used_count < invite.max_uses and (expires is None or expires > datetime.now(timezone.utc))
    return InviteOut.model_validate({**{c: getattr(invite, c) for c in ("code", "note", "max_uses", "used_count", "revoked", "created_at")}, "expires_at": expires, "active": active})


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

    code = normalize_code(body.invite_code)
    # Claim one use atomically so two sign-ups cannot both take the last use of a code.
    claimed = await db.execute(
        update(InviteCode)
        .where(
            InviteCode.code == code,
            InviteCode.revoked.is_(False),
            InviteCode.used_count < InviteCode.max_uses,
            (InviteCode.expires_at.is_(None)) | (InviteCode.expires_at > datetime.now(timezone.utc)),
        )
        .values(used_count=InviteCode.used_count + 1)
    )
    if not code or claimed.rowcount != 1:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="کد دعوت نامعتبر است یا ظرفیتش تمام شده")

    freelancer = Freelancer(
        email=body.email,
        password_hash=_hash_password(body.password),
        name=body.name,
        invite_code=code,
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
        "widget": widget_settings(freelancer).model_dump(),
        "knowledge": knowledge(freelancer).model_dump(),
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


# ── A freelancer manages only orders that came through their own chatbot ──────
@router.get("/freelancer/orders/{order_id}", response_model=OrderOut)
async def get_freelancer_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    return await load_order(db, order_id, payload["sub"])


@router.post("/freelancer/orders/{order_id}/summarize", response_model=OrderOut)
async def summarize_freelancer_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    return await summarize(db, await load_order(db, order_id, payload["sub"]))


@router.post("/freelancer/orders/{order_id}/approve", response_model=OrderOut)
async def approve_freelancer_order(
    order_id: str,
    body: AdminApproveIn,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    return await approve(db, await load_order(db, order_id, payload["sub"]), body)


@router.post("/freelancer/orders/{order_id}/proposal", response_model=OrderOut)
async def upload_freelancer_proposal(
    order_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    return await save_proposal(db, await load_order(db, order_id, payload["sub"]), file)


@router.post("/freelancer/orders/{order_id}/files", response_model=OrderOut)
async def upload_freelancer_order_file(
    order_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    return await add_order_file(db, await load_order(db, order_id, payload["sub"]), file, "freelancer")


@router.get("/bot/{bot_token}", response_model=BotProfileOut)
async def get_bot_profile(bot_token: str, db: AsyncSession = Depends(get_db)):
    """Public profile used to brand the chat page and embed widget for a freelancer's bot."""
    result = await db.execute(select(Freelancer).where(Freelancer.bot_token == bot_token))
    freelancer = result.scalar_one_or_none()
    if not freelancer or not freelancer.onboarding_completed:
        raise HTTPException(status_code=404, detail="Bot not found")
    return BotProfileOut(name=freelancer.name or "", position=freelancer.position or "", widget=widget_settings(freelancer))


@router.put("/freelancer/widget", response_model=WidgetSettings)
async def update_widget(
    body: WidgetSettings,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    freelancer = await db.get(Freelancer, payload["sub"])
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer not found")
    freelancer.widget_settings = body.model_dump()
    await db.commit()
    return body


@router.put("/freelancer/knowledge", response_model=FreelancerKnowledge)
async def update_knowledge(
    body: FreelancerKnowledge,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_freelancer),
):
    freelancer = await db.get(Freelancer, payload["sub"])
    if not freelancer:
        raise HTTPException(status_code=404, detail="Freelancer not found")
    body.services = [s for s in body.services if s.name.strip()]
    body.intake_questions = [q.strip() for q in body.intake_questions if q.strip()]
    body.faqs = [f for f in body.faqs if f.q.strip() and f.a.strip()]
    freelancer.knowledge = body.model_dump()
    await db.commit()
    return body


# ── Invite-only sign-up, managed by the admin ────────────────────────────────
@router.get("/admin/invites", response_model=list[InviteOut])
async def list_invites(db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    result = await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
    return [_invite_out(invite) for invite in result.scalars().all()]


@router.post("/admin/invites", response_model=InviteOut, status_code=201)
async def create_invite(body: InviteCreateIn, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    code = "FRL-" + "".join(secrets.choice(INVITE_ALPHABET) for _ in range(8))
    invite = InviteCode(
        code=code,
        note=body.note.strip() or None,
        max_uses=body.max_uses,
        expires_at=datetime.now(timezone.utc) + timedelta(days=body.expires_days) if body.expires_days else None,
    )
    db.add(invite)
    await db.commit()
    await db.refresh(invite)
    return _invite_out(invite)


@router.delete("/admin/invites/{code}", response_model=InviteOut)
async def revoke_invite(code: str, db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    invite = await db.get(InviteCode, normalize_code(code))
    if not invite:
        raise HTTPException(status_code=404, detail="کد دعوت پیدا نشد")
    invite.revoked = True
    await db.commit()
    await db.refresh(invite)
    return _invite_out(invite)


@router.get("/admin/freelancers", response_model=list[AdminFreelancerOut])
async def list_freelancers(db: AsyncSession = Depends(get_db), _: dict = Depends(get_current_admin)):
    counts = (
        select(Order.freelancer_id, func.count(Order.id).label("n"))
        .where(Order.freelancer_id.is_not(None))
        .group_by(Order.freelancer_id)
        .subquery()
    )
    result = await db.execute(
        select(Freelancer, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.freelancer_id == Freelancer.id)
        .order_by(Freelancer.created_at.desc())
    )
    return [
        AdminFreelancerOut(
            id=f.id, email=f.email, name=f.name, position=f.position, invite_code=f.invite_code,
            onboarding_completed=f.onboarding_completed, created_at=f.created_at, order_count=n,
        )
        for f, n in result.all()
    ]
