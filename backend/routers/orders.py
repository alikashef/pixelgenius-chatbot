import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import Order, OrderStatus
from schemas import OrderOut, AdminStatsOut, AdminApproveIn
from auth import get_current_admin

GAPGPT_API_KEY = os.getenv("GAPGPT_API_KEY", "")
GAPGPT_URL = "https://api.gapgpt.app/v1"

router = APIRouter()

UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ORDER_FILES_DIR = UPLOAD_DIR / "order-files"
ORDER_FILES_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/orders", response_model=list[OrderOut])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).order_by(Order.created_at.desc()))
    return result.scalars().all()


@router.get("/orders/stats", response_model=AdminStatsOut)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    total = await db.scalar(select(func.count(Order.id)))
    paid_count = await db.scalar(
        select(func.count(Order.id)).where(Order.status == OrderStatus.paid)
    )
    pending = await db.scalar(
        select(func.count(Order.id)).where(Order.status == OrderStatus.pending_review)
    )
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.payment_amount), 0)).where(Order.status == OrderStatus.paid)
    )
    return AdminStatsOut(
        total_orders=total or 0,
        paid_orders=paid_count or 0,
        pending_review=pending or 0,
        total_revenue=revenue or 0,
    )


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/orders/{order_id}/summarize", response_model=OrderOut)
async def summarize_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.ai_summary:
        return order

    if not order.chat_history:
        raise HTTPException(status_code=400, detail="تاریخچه چت خالی است")

    if not GAPGPT_API_KEY:
        raise HTTPException(status_code=500, detail="GAPGPT_API_KEY not configured")

    history_text = "\n".join(
        f"{'مشتری' if m.get('role') == 'user' else 'دستیار'}: {m.get('content', '')}"
        for m in order.chat_history
    )
    prompt = (
        f"مکالمه زیر بین یه مشتری و دستیار هوشمند یه فریلنسر هست.\n\n"
        f"{history_text}\n\n"
        f"یه خلاصه ۳ تا ۴ خطی فارسی بنویس که شامل اینا باشه: "
        f"مشتری چی می‌خواد، بودجه تقریبی، اولویت‌ها، و هر نکته مهمی برای فریلنسر. "
        f"خلاصه، دقیق، و مستقیم باش."
    )

    client = AsyncOpenAI(base_url=GAPGPT_URL, api_key=GAPGPT_API_KEY)
    response = await client.chat.completions.create(
        model="gapgpt-qwen-3.6",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=300,
        temperature=0.3,
    )
    order.ai_summary = (response.choices[0].message.content or "").strip()
    await db.commit()
    await db.refresh(order)
    return order


@router.post("/orders/{order_id}/approve", response_model=OrderOut)
async def approve_order(
    order_id: str,
    body: AdminApproveIn,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.final_price = body.final_price
    order.payment_percentage = body.payment_percentage
    order.payment_amount = int(body.final_price * body.payment_percentage / 100)
    order.admin_note = body.admin_note
    order.milestones = [
        {"id": str(uuid.uuid4()), "title": m.title, "amount": m.amount, "status": "pending"}
        for m in body.milestones
    ]
    order.status = OrderStatus.awaiting_payment
    await db.commit()
    await db.refresh(order)
    return order


@router.post("/orders/{order_id}/proposal", response_model=OrderOut)
async def upload_proposal(
    order_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    ext = Path(file.filename or "file.pdf").suffix
    dest = UPLOAD_DIR / f"{order_id}{ext}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    order.proposal_file = f"/uploads/{order_id}{ext}"
    await db.commit()
    await db.refresh(order)
    return order


@router.post("/orders/{order_id}/files", response_model=OrderOut)
async def upload_admin_order_file(
    order_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    file_id = str(uuid.uuid4())
    original_name = Path(file.filename or "file").name
    ext = Path(original_name).suffix
    dest = ORDER_FILES_DIR / f"{order_id}-{file_id}{ext}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    item = {
        "id": file_id,
        "name": original_name,
        "url": f"/uploads/order-files/{dest.name}",
        "size": dest.stat().st_size,
        "content_type": file.content_type,
        "uploaded_by": "admin",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    order.order_files = [*(order.order_files or []), item]
    await db.commit()
    await db.refresh(order)
    return order


@router.delete("/orders/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(get_current_admin),
):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.status = OrderStatus.cancelled
    await db.commit()
    await db.refresh(order)
    return order
