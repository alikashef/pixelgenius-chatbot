import asyncio
import logging
import os
import shutil
import uuid
import httpx
import time
from urllib.parse import urljoin
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
from routers.site_mcp import make_deploy_info, canonical_project_url, canonicalize_workspace_urls, _tool_deploy_status as read_deployment, _tool_get as read_static_site
from services import workspace
from schemas import WorkspaceOutputIn, WorkspaceCommentIn, WorkspaceCommentStatusIn, WorkspaceApproveIn, WorkspaceCredentialsIn
from routers.chat import validate_project_source
from schemas import ChatAttachmentIn
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
                order.project_brief = {**brief, "project_path": workspace.state(order)["path"], "source_url": workspace.state(order)["source_url"], "source": {"type": workspace.state(order).get("source_type"), "repository_url": workspace.state(order)["source_url"], "archive": workspace.state(order).get("source_file")}} if order.mode == "designer" else brief
                if order.mode == "designer" and order.project_brief.get("source", {}).get("archive"):
                    archive = order.project_brief["source"]["archive"]
                    archive["url"] = urljoin(make_deploy_info(order.id)["mcp_server_url"], archive["url"])
                if order.mode == "designer" and not order.workspace:
                    order.workspace = workspace.state(order)
                    workspace.event(order.workspace, "کانفیگ آماده شد و فضای پروژه ایجاد شد", "system")
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
    if body.mode == "designer" and not body.project_path:
        raise HTTPException(422, "مسیر پروژه باید قبل از شروع گفتگو انتخاب شود")
    workspace.url(body.source_url)
    source_kind = None
    if body.mode == "designer" and body.project_path == "source":
        source_kind = validate_project_source(body.source_type, body.source_url, ChatAttachmentIn.model_validate(body.source_file.model_dump()) if body.source_file else None)
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
    if order.mode == "designer":
        data = workspace.state(order)
        workspace.choose_path(data, body.project_path, body.source_url if body.project_path == "source" and source_kind == "github" else "")
        if body.project_path == "source":
            data["source_type"] = source_kind
            data["source_file"] = body.source_file.model_dump(mode="json") if source_kind == "zip" and body.source_file else None
            if source_kind == "zip" and body.source_file and not any(f["id"] == body.source_file.id for f in order.order_files):
                order.order_files = [*order.order_files, body.source_file.model_dump(mode="json")]
        order.workspace = data
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
        return {**order.project_brief, "deploy": make_deploy_info(order.id, workspace_enabled=order.mode == "designer")}
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
            "project_path": workspace.state(order)["path"] if order.mode == "designer" else None,
            "source_url": workspace.state(order)["source_url"] if order.mode == "designer" else "",
            "source_type": workspace.state(order).get("source_type"),
            "source_file": workspace.state(order).get("source_file"),
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


async def _workspace_order(db: AsyncSession, order_id: str, customer_id: str) -> Order:
    result = await db.execute(select(Order).where(
        Order.id == order_id, Order.customer_id == customer_id, Order.mode == "designer",
    ).with_for_update())
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(404, "پروژه یافت نشد")
    return order


@router.get("/customer/orders/{order_id}/workspace")
async def get_workspace(order_id: str, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    data = workspace.state(order)
    canonicalize_workspace_urls(order_id, data)
    return JSONResponse({**data, "has_credentials": bool(order.workspace_credentials), "configuration": order.project_brief}, headers={"Cache-Control": "no-store"})


@router.post("/customer/orders/{order_id}/workspace/outputs")
async def add_workspace_output(order_id: str, body: WorkspaceOutputIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    data = workspace.state(order)
    workspace.add_output(data, body.model_dump(), "owner")
    order.workspace = data
    await db.commit()
    return data


@router.post("/customer/orders/{order_id}/workspace/comments")
async def add_workspace_comment(order_id: str, body: WorkspaceCommentIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    data = workspace.state(order)
    workspace.add_comment(data, body.model_dump())
    order.workspace = data
    await db.commit()
    return data


@router.patch("/customer/orders/{order_id}/workspace/comments/{comment_id}")
async def update_workspace_comment(order_id: str, comment_id: str, body: WorkspaceCommentStatusIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    data = workspace.state(order)
    workspace.change_comment(data, comment_id, body.status, "owner")
    order.workspace = data
    await db.commit()
    return data


@router.post("/customer/orders/{order_id}/workspace/approve")
async def approve_workspace_output(order_id: str, body: WorkspaceApproveIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    data = workspace.state(order)
    workspace.approve(data, body.version_id)
    order.workspace = data
    await db.commit()
    return data


@router.get("/customer/orders/{order_id}/workspace/credentials")
async def get_workspace_credentials(order_id: str, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    credentials = workspace.credentials(order)
    credentials["admin_url"] = canonical_project_url(order_id, credentials["admin_url"])
    return JSONResponse(credentials, headers={"Cache-Control": "no-store"})


@router.put("/customer/orders/{order_id}/workspace/credentials")
async def save_workspace_credentials(order_id: str, body: WorkspaceCredentialsIn, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    order = await _workspace_order(db, order_id, payload["sub"])
    order.workspace_credentials = workspace.encrypt_credentials(body.model_dump())
    data = workspace.state(order)
    workspace.event(data, "اطلاعات ورود ادمین به‌روزرسانی شد")
    order.workspace = data
    await db.commit()
    return {"saved": True}


@router.get("/customer/orders/{order_id}/workspace/deployment")
async def get_workspace_deployment(order_id: str, db: AsyncSession = Depends(get_db), payload: dict = Depends(get_current_customer)):
    await _workspace_order(db, order_id, payload["sub"])
    await db.commit()
    info = make_deploy_info(order_id)
    try:
        result = await read_deployment({"token": info["token"]})
    except (ValueError, httpx.HTTPError):
        raise HTTPException(502, "دریافت وضعیت انتشار ممکن نشد؛ دوباره تلاش کنید")
    if not result.get("state"):
        published = read_static_site({"token": info["token"]})
        result = {**published, "state": "READY" if published.get("published") else "NOT_STARTED", "build_log_tail": []}
        if not published.get("published"):
            result.pop("url", None)
    order = await _workspace_order(db, order_id, payload["sub"])
    data = workspace.state(order)
    if result["state"] == "NOT_STARTED" and data["deployments"]:
        last = data["deployments"][-1]
        if last.get("expires_at") and last["expires_at"] < time.time():
            result = {"state": "EXPIRED", "attempt_id": last["id"], "expires_at": last["expires_at"], "build_log_tail": []}
    workspace.record_deployment(data, result)
    order.workspace = data
    await db.commit()
    canonicalize_workspace_urls(order_id, data)
    return JSONResponse({**result, "history": data["deployments"]}, headers={"Cache-Control": "no-store"})
