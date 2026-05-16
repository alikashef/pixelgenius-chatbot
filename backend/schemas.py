from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models import OrderStatus


# ── Chat ────────────────────────────────────────────────────────────────────
class MessageIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[MessageIn]


class ChatResponse(BaseModel):
    content: str


# ── Customer Auth ────────────────────────────────────────────────────────────
class OtpSendRequest(BaseModel):
    phone: str


class OtpVerifyRequest(BaseModel):
    phone: str
    code: str


class CustomerTokenOut(BaseModel):
    access_token: str
    token_type: str
    customer_id: str


# ── Orders ───────────────────────────────────────────────────────────────────
class OrderCreateIn(BaseModel):
    project_name: str
    summary: str
    features: list[str]
    tech_stack: str
    delivery_days: int
    price_estimate: int
    price_label: str


class AdminApproveIn(BaseModel):
    final_price: int
    payment_percentage: int
    admin_note: Optional[str] = None


class OrderOut(BaseModel):
    id: str
    customer_id: Optional[str] = None
    project_name: str
    summary: str
    features: list
    tech_stack: str
    delivery_days: int
    price_estimate: int
    price_label: str
    final_price: Optional[int] = None
    payment_percentage: Optional[int] = None
    payment_amount: Optional[int] = None
    proposal_file: Optional[str] = None
    admin_note: Optional[str] = None
    status: OrderStatus
    zarinpal_authority: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminStatsOut(BaseModel):
    total_orders: int
    paid_orders: int
    pending_review: int
    total_revenue: int


# ── Payment ───────────────────────────────────────────────────────────────────
class PaymentRequestIn(BaseModel):
    order_id: str
    callback_url: str


class PaymentRequestOut(BaseModel):
    payment_url: str
    authority: str


class PaymentVerifyOut(BaseModel):
    success: bool
    ref_id: Optional[str] = None
    order_id: Optional[str] = None
    message: str


# ── Admin Auth ────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str
