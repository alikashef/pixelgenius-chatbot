from pydantic import BaseModel, Field
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


class LeadAnalysisOut(BaseModel):
    project_type: str
    project_goal: str
    budget_level: str
    budget_fit: str
    recommended_solution: str
    recommended_stack: str
    estimated_price_range: str
    estimated_timeline: str
    client_risk_level: str
    lead_score: int
    client_message: str
    admin_summary: str
    missing_questions: list[str]


class AISettingsOut(BaseModel):
    settings: dict


class AISettingsUpdateIn(BaseModel):
    settings: dict


# ── Customer Auth ────────────────────────────────────────────────────────────
class OtpSendRequest(BaseModel):
    phone: str


class OtpVerifyRequest(BaseModel):
    phone: str
    code: str
    first_name: Optional[str] = None


class CustomerTokenOut(BaseModel):
    access_token: str
    token_type: str
    customer_id: str
    first_name: Optional[str] = None


class CustomerProfileOut(BaseModel):
    id: str
    phone: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    business_type: Optional[str] = None

    model_config = {"from_attributes": True}


class CustomerProfileUpdateIn(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    business_type: Optional[str] = None


# ── Orders ───────────────────────────────────────────────────────────────────
class OrderCreateIn(BaseModel):
    project_name: str
    summary: str
    chat_history: list[MessageIn] = Field(default_factory=list)
    features: list[str]
    tech_stack: str
    delivery_days: int
    price_estimate: int
    price_label: str


class AdminApproveIn(BaseModel):
    final_price: int
    payment_percentage: int
    admin_note: Optional[str] = None


class OrderFileOut(BaseModel):
    id: str
    name: str
    url: str
    size: int
    content_type: Optional[str] = None
    uploaded_by: str
    uploaded_at: datetime


class OrderOut(BaseModel):
    id: str
    customer_id: Optional[str] = None
    project_name: str
    summary: str
    chat_history: list[MessageIn]
    features: list
    tech_stack: str
    delivery_days: int
    price_estimate: int
    price_label: str
    order_files: list[OrderFileOut] = Field(default_factory=list)
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
