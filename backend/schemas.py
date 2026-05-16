from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from models import OrderStatus


class MessageIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[MessageIn]


class ChatResponse(BaseModel):
    content: str


class PaymentRequestIn(BaseModel):
    project_name: str
    summary: str
    features: list[str]
    tech_stack: str
    delivery_days: int
    price: int
    price_label: str
    callback_url: str


class PaymentRequestOut(BaseModel):
    payment_url: str
    authority: str
    order_id: str


class PaymentVerifyOut(BaseModel):
    success: bool
    ref_id: Optional[str] = None
    order_id: Optional[str] = None
    message: str


class OrderOut(BaseModel):
    id: str
    project_name: str
    summary: str
    features: list
    tech_stack: str
    delivery_days: int
    price: int
    price_label: str
    status: OrderStatus
    zarinpal_authority: Optional[str] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminStatsOut(BaseModel):
    total_orders: int
    paid_orders: int
    total_revenue: int


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str
