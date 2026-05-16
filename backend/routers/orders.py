from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from database import get_db
from models import Order, OrderStatus
from schemas import OrderOut, AdminStatsOut
from auth import get_current_admin

router = APIRouter()


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
    revenue = await db.scalar(
        select(func.coalesce(func.sum(Order.price), 0)).where(Order.status == OrderStatus.paid)
    )
    return AdminStatsOut(total_orders=total or 0, paid_orders=paid_count or 0, total_revenue=revenue or 0)


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
