import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import Order, OrderStatus
from schemas import OrderOut, AdminStatsOut, AdminApproveIn
from auth import get_current_admin

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
