import asyncio
import logging
import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database import get_db, SessionLocal
from models import Customer, Order, ChatSession
from schemas import CustomerProfileOut, CustomerProfileUpdateIn, OrderCreateIn, OrderOut
from auth import get_current_customer
from sms import send_notification
from lib.ai.analyze_lead import generate_project_brief
from routers.site_mcp import make_deploy_info
from services.ai_settings import get_ai_settings

FREELANCER_PHONE = os.getenv("FREELANCER_PHONE", "")

router = APIRouter()
UPLOAD_DIR = Path("/app/uploads/order-files")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger(__name__)
_brief_tasks: dict[str, asyncio.Task] = {}
_brief_errors: set[str] = set()


async def _build_brief(order_id: str, context: dict) -> None:
    try:
        async with SessionLocal() as db:
            settings = await get_ai_settings(db)
        brief = await generate_project_brief(settings, context)
        async with SessionLocal() as db:
            order = await db.get(Order, order_id)
            if order is not None:
                order.project_brief = brief
                await db.commit()
    except Exception:
        logger.exception("Project brief generation failed for %s", order_id)
        _brief_errors.add(order_id)
    finally:
        _brief_tasks.pop(order_id, None)


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
    freelancer_id = None
    if body.session_id:
        session = await db.get(ChatSession, body.session_id)
        if session and session.freelancer_id:
            freelancer_id = session.freelancer_id

    order = Order(
        customer_id=payload["sub"],
        freelancer_id=freelancer_id,
        project_name=body.project_name,
        summary=body.summary,
        chat_history=[{"role": message.role, "content": message.content} for message in body.chat_history],
        features=body.features,
        tech_stack=body.tech_stack,
        delivery_days=body.delivery_days,
        price_estimate=body.price_estimate,
        price_label=body.price_label,
        order_files=[item.model_dump(mode="json") for item in body.order_files],
        mode=body.mode if body.mode in ("sales", "designer") else "sales",
    )
    db.add(order)
    await db.commit()
    await db.refresh(order)

    if FREELANCER_PHONE:
        asyncio.create_task(
            send_notification(FREELANCER_PHONE, order.project_name)
        )

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


@router.post("/customer/orders/{order_id}/brief")
async def get_order_brief(
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
    if order.project_brief:
        return {**order.project_brief, "deploy": make_deploy_info(order.id)}
    if order_id in _brief_errors:
        _brief_errors.discard(order_id)
        raise HTTPException(status_code=502, detail="ساخت کانفیگ ناموفق بود؛ دوباره تلاش کنید")
    if order_id not in _brief_tasks:
        context = {
            "project_name": order.project_name,
            "summary": order.summary,
            "features": order.features,
            "tech_stack": order.tech_stack,
            "order_files": order.order_files,
            "chat_history": order.chat_history,
        }
        _brief_tasks[order_id] = asyncio.create_task(_build_brief(order_id, context))
    return JSONResponse({"status": "processing"}, status_code=202, headers={"Retry-After": "2"})


@router.post("/customer/orders/{order_id}/files", response_model=OrderOut)
async def upload_customer_order_file(
    order_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_current_customer),
):
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.customer_id == payload["sub"])
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="سفارش یافت نشد")

    file_id = str(uuid.uuid4())
    original_name = Path(file.filename or "file").name
    ext = Path(original_name).suffix
    dest = UPLOAD_DIR / f"{order_id}-{file_id}{ext}"
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    item = {
        "id": file_id,
        "name": original_name,
        "url": f"/uploads/order-files/{dest.name}",
        "size": dest.stat().st_size,
        "content_type": file.content_type,
        "uploaded_by": "customer",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    order.order_files = [*(order.order_files or []), item]
    await db.commit()
    await db.refresh(order)
    return order
