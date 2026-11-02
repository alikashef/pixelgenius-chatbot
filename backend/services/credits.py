"""Credit wallet: one balance per customer, every movement recorded in `credit_ledger` so usage can be reported."""
import asyncio
import math
import os
from contextvars import ContextVar

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from models import CreditLedger

TOMAN_PER_CREDIT = 100
MIN_TOPUP_TOMAN = 50_000

# AI chat is billed from the real token usage: provider cost x USD rate x MARKUP, converted to credits.
# Everything here is editable through env vars; USD per 1M tokens (input, output) per model.
USD_TOMAN = float(os.getenv("USD_TOMAN", "275000"))
MARKUP = float(os.getenv("CREDIT_MARKUP", "1.5"))
MODEL_USD_PER_MTOK = {
    "gapgpt-qwen-3.6": (0.4, 1.2),
    "claude-opus-4-6": (5.0, 25.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (3.0, 15.0),
    "gpt-5-mini": (0.25, 2.0),
}
DEFAULT_USD_PER_MTOK = (3.0, 15.0)

_usage: ContextVar[list | None] = ContextVar("ai_usage", default=None)


def start_usage() -> list:
    bucket: list = []
    _usage.set(bucket)
    return bucket


def record_usage(model: str, prompt_tokens: int, completion_tokens: int) -> None:
    bucket = _usage.get()
    if bucket is not None:
        bucket.append((model, int(prompt_tokens or 0), int(completion_tokens or 0)))


def usage_credits(bucket: list) -> tuple[int, int]:
    """(credits to charge, total tokens) for the recorded calls; at least 1 credit when anything ran."""
    if not bucket:
        return 0, 0
    usd, tokens = 0.0, 0
    for model, prompt, completion in bucket:
        price_in, price_out = next((v for k, v in MODEL_USD_PER_MTOK.items() if k in model.lower().replace("/", "-")), DEFAULT_USD_PER_MTOK)
        usd += (prompt * price_in + completion * price_out) / 1_000_000
        tokens += prompt + completion
    return max(1, math.ceil(usd * USD_TOMAN * MARKUP / TOMAN_PER_CREDIT)), tokens


KIND_LABELS = {
    "topup": "شارژ",
    "bonus": "هدیه و تخفیف",
    "refund": "بازگشت",
    "widget": "دستیار فریلنسر",
    "designer": "طراحی محصول",
    "video": "ویدیوساز",
    "admin": "تنظیم مدیر",
}


class InsufficientCredits(Exception):
    def __init__(self, need: int, have: int):
        super().__init__(f"need {need}, have {have}")
        self.need, self.have = need, have


async def balance(db: AsyncSession, customer_id: str) -> int:
    row = (await db.execute(text("SELECT credits FROM customers WHERE id = :id"), {"id": customer_id})).first()
    return int(row[0]) if row else 0


async def _move(db: AsyncSession, customer_id: str, delta: int, kind: str, reason: str, ref: str | None) -> int | None:
    """Apply `delta` atomically; a debit that would go below zero changes nothing and returns None."""
    row = (await db.execute(
        text("UPDATE customers SET credits = credits + :d WHERE id = :id AND credits + :d >= 0 RETURNING credits"),
        {"d": delta, "id": customer_id},
    )).first()
    if row is None:
        return None
    db.add(CreditLedger(customer_id=customer_id, delta=delta, balance_after=int(row[0]), kind=kind, reason=reason[:200], ref=ref))
    return int(row[0])


async def charge(db: AsyncSession, customer_id: str, amount: int, kind: str, reason: str, ref: str | None = None) -> int:
    if amount <= 0:
        return await balance(db, customer_id)
    after = await _move(db, customer_id, -amount, kind, reason, ref)
    if after is None:
        await db.rollback()
        raise InsufficientCredits(amount, await balance(db, customer_id))
    await db.commit()
    return after


async def grant(db: AsyncSession, customer_id: str, amount: int, kind: str, reason: str, ref: str | None = None) -> int:
    after = await _move(db, customer_id, amount, kind, reason, ref)
    if after is None:
        await db.rollback()
        raise InsufficientCredits(-amount, await balance(db, customer_id))
    await db.commit()
    return after


async def grant_all(db: AsyncSession, amount: int, kind: str, reason: str) -> int:
    """Give every customer the same credits in one transaction; returns how many received it."""
    rows = (await db.execute(text("UPDATE customers SET credits = credits + :d RETURNING id, credits"), {"d": amount})).all()
    for customer_id, after in rows:
        db.add(CreditLedger(customer_id=customer_id, delta=amount, balance_after=int(after), kind=kind, reason=reason[:200], ref="grant-all"))
    await db.commit()
    return len(rows)


async def charge_up_to(db: AsyncSession, customer_id: str, amount: int, kind: str, reason: str, ref: str | None = None) -> int:
    """Bill a reply that was already delivered: take what the wallet still holds instead of failing."""
    available = await balance(db, customer_id)
    take = min(amount, available)
    if take <= 0:
        return available
    return await charge(db, customer_id, take, kind, reason, ref)


async def has_credits(db: AsyncSession, customer_id: str, amount: int = 1) -> bool:
    return await balance(db, customer_id) >= amount


def refund_in_thread(customer_id: str, amount: int, reason: str, ref: str | None = None) -> None:
    """For worker threads (video render) that have no request session; uses its own short-lived engine."""
    from database import ASYNC_DATABASE_URL

    async def run() -> None:
        engine = create_async_engine(ASYNC_DATABASE_URL, poolclass=NullPool)
        try:
            async with AsyncSession(engine, expire_on_commit=False) as db:
                await grant(db, customer_id, amount, "refund", reason, ref)
        finally:
            await engine.dispose()

    asyncio.run(run())
