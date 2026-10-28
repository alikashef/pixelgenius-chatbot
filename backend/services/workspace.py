"""Project workspace state shared by the owner UI and external MCP agents."""
import base64
import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from urllib.parse import urlsplit

from cryptography.fernet import Fernet
from fastapi import HTTPException

from auth import JWT_SECRET
from models import Order


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def state(order: Order) -> dict:
    return copy.deepcopy(order.workspace) if order.workspace else {
        "path": None, "source_url": "", "versions": [], "comments": [],
        "approvals": {}, "activity": [], "deployments": [],
    }


def event(data: dict, text: str, actor: str = "owner") -> None:
    data["activity"].append({"id": str(uuid.uuid4()), "text": text, "actor": actor, "created_at": now()})


def url(value: str) -> str:
    try:
        parsed = urlsplit(value)
        valid = not value or (parsed.scheme in ("http", "https") and parsed.hostname and not parsed.username)
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(422, "آدرس باید با http یا https شروع شود و شامل اطلاعات ورود نباشد")
    return value


def choose_path(data: dict, path: str, source_url: str) -> None:
    if data["path"] != path and (data["versions"] or data["deployments"]):
        raise HTTPException(409, "بعد از ثبت خروجی، مسیر پروژه قابل تغییر نیست")
    data.update(path=path, source_url=url(source_url))
    event(data, "مسیر پروژه انتخاب شد")


def add_output(data: dict, body: dict, actor: str) -> None:
    if not data["path"]:
        raise HTTPException(409, "ابتدا مسیر پروژه را انتخاب کنید")
    stage = body["stage"]
    if stage == "design" and data["path"] != "design":
        raise HTTPException(409, "این مسیر مرحله طراحی مستقل ندارد")
    if stage == "development" and data["path"] == "design" and not data["approvals"].get("design"):
        raise HTTPException(409, "ابتدا طراحی باید توسط صاحب پروژه تأیید شود")
    if not body["html"].strip() and not body["url"].strip():
        raise HTTPException(422, "آدرس پیش‌نمایش یا HTML خروجی لازم است")
    url(body["url"])
    data["approvals"].pop(stage, None)
    if stage == "design":
        data["approvals"].pop("development", None)
    version = {**body, "id": str(uuid.uuid4()), "created_at": now(), "number": len(data["versions"]) + 1}
    if stage == "development" and data["path"] == "design":
        version["design_version_id"] = data["approvals"]["design"]["version_id"]
    data["versions"].append(version)
    event(data, f'نسخه {version["number"]}: {body["title"]}', actor)


def add_comment(data: dict, body: dict) -> None:
    version = next((v for v in data["versions"] if v["id"] == body["version_id"]), None)
    if not version:
        raise HTTPException(404, "نسخه یافت نشد")
    data["comments"].append({**body, "stage": version["stage"], "id": str(uuid.uuid4()), "status": "open", "created_at": now()})
    data["approvals"].pop(version["stage"], None)
    if version["stage"] == "design":
        data["approvals"].pop("development", None)
    event(data, f'بازخورد برای نسخه {version["number"]} ثبت شد')


def approve(data: dict, version_id: str) -> None:
    version = next((v for v in data["versions"] if v["id"] == version_id), None)
    if not version:
        raise HTTPException(404, "نسخه یافت نشد")
    stage = version["stage"]
    latest = next(v for v in reversed(data["versions"]) if v["stage"] == stage)
    if latest["id"] != version_id:
        raise HTTPException(409, "فقط آخرین نسخه هر مرحله قابل تأیید است")
    if stage == "development" and data["path"] == "design" and not data["approvals"].get("design"):
        raise HTTPException(409, "ابتدا طراحی باید تأیید شود")
    if stage == "development" and data["path"] == "design" and version.get("design_version_id") != data["approvals"]["design"]["version_id"]:
        raise HTTPException(409, "این خروجی براساس طراحی قبلی است؛ نسخه توسعه جدید لازم است")
    if any(c["version_id"] == version_id and c["status"] != "approved" for c in data["comments"]):
        raise HTTPException(409, "ابتدا بازخوردهای این نسخه را تأیید کنید")
    data["approvals"][stage] = {"version_id": version_id, "approved_at": now()}
    event(data, "طراحی تأیید شد" if stage == "design" else "توسعه تأیید شد")


def change_comment(data: dict, comment_id: str, status: str, actor: str, note: str = "") -> None:
    comment = next((c for c in data["comments"] if c["id"] == comment_id), None)
    if not comment:
        raise HTTPException(404, "بازخورد یافت نشد")
    if actor == "agent" and status == "approved":
        raise HTTPException(403, "تأیید بازخورد فقط توسط صاحب پروژه انجام می‌شود")
    comment["status"] = status
    comment["updated_at"] = now()
    comment["updated_by"] = actor
    if actor == "agent" and note.strip():
        comment["agent_note"] = note.strip()
    if status != "approved":
        data["approvals"].pop(comment["stage"], None)
        if comment["stage"] == "design":
            data["approvals"].pop("development", None)
    event(data, "وضعیت بازخورد تغییر کرد", actor)


def agent_tasks(data: dict, site_url: str = "") -> list[dict]:
    """Owner annotations as a to-do list for the coding agent, numbered as in the owner's table."""
    versions = {v["id"]: v for v in data["versions"]}
    counters: dict[str, int] = {}
    tasks = []
    for c in data["comments"]:
        number = counters[c["version_id"]] = counters.get(c["version_id"], 0) + 1
        if c["status"] == "approved":
            continue
        version = versions.get(c["version_id"], {})
        tasks.append({
            "comment_id": c["id"],
            "number": number,
            "version": version.get("number"),
            "stage": c.get("stage"),
            "preview_url": version.get("url") or ("" if version.get("html") else site_url),
            "page": c.get("page", "/"),
            "selector": c.get("selector", ""),
            "html": c.get("html") or c.get("element", ""),
            "request": c["text"],
            "status": c["status"],
            "agent_note": c.get("agent_note", ""),
        })
    return tasks


def require_deploy_approval(data: dict) -> None:
    if not data["approvals"].get("development"):
        raise HTTPException(409, "ابتدا نسخه توسعه را در Workspace تأیید کنید")
    if data["path"] == "design" and not data["approvals"].get("design"):
        raise HTTPException(409, "ابتدا طراحی را در Workspace تأیید کنید")


def encrypt_credentials(body: dict) -> str:
    url(body["admin_url"])
    key = base64.urlsafe_b64encode(hashlib.sha256(JWT_SECRET.encode()).digest())
    return Fernet(key).encrypt(json.dumps(body).encode()).decode()


def credentials(order: Order) -> dict:
    if not order.workspace_credentials:
        return {"admin_url": "", "username": "", "password": ""}
    key = base64.urlsafe_b64encode(hashlib.sha256(JWT_SECRET.encode()).digest())
    return json.loads(Fernet(key).decrypt(order.workspace_credentials.encode()))


def record_deployment(data: dict, result: dict) -> None:
    status = result.get("state")
    if not status or status == "NOT_STARTED":
        return
    key = result.get("attempt_id") or result.get("release_id") or f'static-{result.get("expires_at", "")}'
    entry = next((d for d in data["deployments"] if d["id"] == key), None)
    if entry is None:
        entry = {"id": key, "created_at": now()}
        data["deployments"].append(entry)
    if entry.get("state") != status:
        event(data, f"وضعیت انتشار: {status}", "system")
    entry.update(version_id=result.get("version_id") or entry.get("version_id") or data["approvals"].get("development", {}).get("version_id"), state=status, url=result.get("url", entry.get("url", "")), expires_at=result.get("expires_at"), updated_at=now())


async def record_for_order(order_id: str, result: dict) -> None:
    from database import SessionLocal
    from sqlalchemy import select

    async with SessionLocal() as db:
        row = await db.execute(select(Order).where(Order.id == order_id).with_for_update())
        order = row.scalar_one_or_none()
        if order and order.mode == "designer":
            data = state(order)
            record_deployment(data, result)
            order.workspace = data
            await db.commit()
