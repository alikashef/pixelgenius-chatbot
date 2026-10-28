from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from uuid import UUID
from models import OrderStatus


# ── Chat ────────────────────────────────────────────────────────────────────
class MessageIn(BaseModel):
    role: str
    content: str


class ChatAttachmentIn(BaseModel):
    name: str
    url: str
    size: int | None = None
    content_type: Optional[str] = None


class ChatSessionCreateIn(BaseModel):
    bot_token: Optional[str] = None


class ChatRequest(BaseModel):
    progress_id: UUID | None = None
    project_path: Literal["design", "direct", "source"] | None = None
    source_url: str = Field(default="", max_length=2000)
    source_type: Literal["github", "zip"] | None = None
    source_file: ChatAttachmentIn | None = None
    messages: list[MessageIn]
    attachments: list[ChatAttachmentIn] = Field(default_factory=list)
    bot_token: Optional[str] = None
    mode: str = "sales"
    finalize: bool = False


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
class OrderFileOut(BaseModel):
    id: str
    name: str
    url: str
    size: int
    content_type: Optional[str] = None
    uploaded_by: str
    uploaded_at: datetime


class HandoffProposalIn(BaseModel):
    bot_token: Optional[str] = Field(default=None, max_length=64)
    project_path: Literal["design", "direct", "source"] | None = None
    source_url: str = Field(default="", max_length=2000)
    source_type: Literal["github", "zip"] | None = None
    source_file: OrderFileOut | None = None
    type: str
    projectName: str
    summary: str
    features: list[str]
    tech: str
    days: int
    price: int
    priceLabel: str
    mode: str = "sales"


class HandoffCreateIn(BaseModel):
    version: int = 1
    proposal: HandoffProposalIn
    chatHistory: list[MessageIn] = Field(default_factory=list)
    attachments: list[OrderFileOut] = Field(default_factory=list)


class HandoffCreateOut(BaseModel):
    handoff_id: str


class HandoffOut(HandoffCreateIn):
    pass


class OrderCreateIn(BaseModel):
    bot_token: Optional[str] = Field(default=None, max_length=64)
    project_path: Literal["design", "direct", "source"] | None = None
    source_url: str = Field(default="", max_length=2000)
    source_type: Literal["github", "zip"] | None = None
    source_file: OrderFileOut | None = None
    project_name: str
    summary: str
    chat_history: list[MessageIn] = Field(default_factory=list)
    features: list[str]
    tech_stack: str
    delivery_days: int
    price_estimate: int
    price_label: str
    order_files: list[OrderFileOut] = Field(default_factory=list)
    session_id: Optional[str] = None
    mode: str = "sales"


class MilestoneIn(BaseModel):
    title: str
    amount: int


class WorkspaceOutputIn(BaseModel):
    stage: Literal["design", "development"]
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(default="", max_length=2000)
    html: str = Field(default="", max_length=500000)
    notes: str = Field(default="", max_length=10000)


class WorkspaceCommentIn(BaseModel):
    version_id: str
    page: str = Field(default="/", max_length=2000)
    selector: str = Field(min_length=1, max_length=1000)
    text: str = Field(min_length=1, max_length=5000)


class WorkspaceCommentStatusIn(BaseModel):
    status: Literal["open", "in_progress", "review", "approved"]


class WorkspaceApproveIn(BaseModel):
    version_id: str


class WorkspaceCredentialsIn(BaseModel):
    admin_url: str = Field(default="", max_length=2000)
    username: str = Field(default="", max_length=500)
    password: str = Field(default="", max_length=2000)


class AdminApproveIn(BaseModel):
    final_price: int
    payment_percentage: int
    admin_note: Optional[str] = None
    milestones: list[MilestoneIn] = []


class OrderOut(BaseModel):
    id: str
    mode: str = "sales"
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
    ai_summary: Optional[str] = None
    milestones: list = []
    freelancer_id: Optional[str] = None
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


# ── Freelancer Auth ───────────────────────────────────────────────────────────
class FreelancerRegisterIn(BaseModel):
    email: str
    password: str
    name: Optional[str] = None


class FreelancerLoginIn(BaseModel):
    email: str
    password: str


class FreelancerTokenOut(BaseModel):
    access_token: str
    token_type: str
    freelancer_id: str
    name: Optional[str] = None
    onboarding_completed: bool
    bot_token: str


# ── Freelancer Onboarding ─────────────────────────────────────────────────────
class FreelancerOnboardingIn(BaseModel):
    name: str
    position: str
    services: str
    price_range: str
    timeline: str
    note: Optional[str] = None


WidgetColor = Literal["saffron", "ink", "emerald", "ocean", "rose", "plum"]


class WidgetSettings(BaseModel):
    """How a freelancer's chatbot looks and sounds on their own site."""
    brand_name: str = Field(default="", max_length=60)
    greeting: str = Field(default="", max_length=300)
    accent: WidgetColor = "saffron"
    robot_shape: Literal["circle", "rectangle", "square", "hexagon"] = "circle"
    robot_color: WidgetColor = "ink"
    voice: bool = True
    position: Literal["bottom-left", "bottom-right"] = "bottom-left"


class FreelancerService(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    price_min: int | None = Field(default=None, ge=0, le=100_000_000_000)
    price_max: int | None = Field(default=None, ge=0, le=100_000_000_000)
    unit: Literal["project", "hour", "month", "item"] = "project"
    days_min: int | None = Field(default=None, ge=0, le=3650)
    days_max: int | None = Field(default=None, ge=0, le=3650)
    description: str = Field(default="", max_length=400)


class FreelancerFaq(BaseModel):
    q: str = Field(max_length=300)
    a: str = Field(max_length=1000)


class FreelancerKnowledge(BaseModel):
    """What a freelancer teaches their own chatbot: field, services, prices, process."""
    field: Literal["web", "mobile", "uiux", "graphic", "motion", "content", "marketing", "seo", "other", ""] = ""
    field_label: str = Field(default="", max_length=80)
    experience_years: int | None = Field(default=None, ge=0, le=60)
    bio: str = Field(default="", max_length=800)
    portfolio_url: str = Field(default="", max_length=300)
    services: list[FreelancerService] = Field(default_factory=list, max_length=25)
    process: str = Field(default="", max_length=1500)
    intake_questions: list[str] = Field(default_factory=list, max_length=12)
    out_of_scope: str = Field(default="", max_length=800)
    payment_terms: str = Field(default="", max_length=600)
    faqs: list[FreelancerFaq] = Field(default_factory=list, max_length=20)
    tone: Literal["friendly", "formal"] = "friendly"


class BotProfileOut(BaseModel):
    name: str
    position: str
    widget: WidgetSettings


# ── Chat Session ──────────────────────────────────────────────────────────────
class ChatSessionCreateOut(BaseModel):
    id: str


class ChatSessionUpdateIn(BaseModel):
    messages: list[MessageIn]
    phone: Optional[str] = None
    converted: Optional[bool] = None
    order_id: Optional[str] = None
