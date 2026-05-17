from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db
from models import Customer, Order
from schemas import CustomerProfileOut, CustomerProfileUpdateIn, OrderCreateIn, OrderOut
from auth import get_current_customer

router = APIRouter()


@router.get("/customer/profile", response_model=CustomerProfileOut)
async def get_profile(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    customer = await db.get(Customer, payload["sub"])
    if not customer:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")
    return customer


@router.put("/customer/profile", response_model=CustomerProfileOut)
async def update_profile(
    body: CustomerProfileUpdateIn,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    customer = await db.get(Customer, payload["sub"])
    if not customer:
        raise HTTPException(status_code=404, detail="کاربر یافت نشد")

    customer.first_name = (body.first_name or "").strip() or None
    customer.last_name = (body.last_name or "").strip() or None
    customer.business_type = (body.business_type or "").strip() or None
    await db.commit()
    await db.refresh(customer)
    return customer


@router.post("/customer/orders", response_model=OrderOut)
async def create_order(
    body: OrderCreateIn,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    order = Order(
        customer_id=payload["sub"],
        project_name=body.project_name,
        summary=body.summary,
        chat_history=[{"role": message.role, "content": message.content} for message in body.chat_history],
        features=body.features,
        tech_stack=body.tech_stack,
        delivery_days=body.delivery_days,
        price_estimate=body.price_estimate,
        price_label=body.price_label,
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)
    return order


@router.get("/customer/orders", response_model=list[OrderOut])
async def list_orders(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    result = await db.execute(
        select(Order)
        .where(Order.customer_id == payload["sub"])
        .order_by(Order.created_at.desc())
    )
    return result.scalars().all()


@router.get("/customer/orders/{order_id}", response_model=OrderOut)
async def get_order(
    order_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.customer_id == payload["sub"])
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")
    return order
