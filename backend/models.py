import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Enum, DateTime, JSON, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


class OrderStatus(str, enum.Enum):
    pending_review = "pending_review"
    approved = "approved"
    awaiting_payment = "awaiting_payment"
    paid = "paid"
    cancelled = "cancelled"


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    first_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(80), nullable=True)
    business_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    orders: Mapped[list["Order"]] = relationship("Order", back_populates="customer")


class AIConfig(Base):
    __tablename__ = "ai_configs"

    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[dict | list | str | int | float | bool | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    customer_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("customers.id"), nullable=True)
    customer: Mapped["Customer | None"] = relationship("Customer", back_populates="orders")

    project_name: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    chat_history: Mapped[list] = mapped_column(JSON, default=list)
    features: Mapped[list] = mapped_column(JSON, default=list)
    tech_stack: Mapped[str] = mapped_column(String(255))
    delivery_days: Mapped[int] = mapped_column(Integer)
    price_estimate: Mapped[int] = mapped_column(Integer)
    price_label: Mapped[str] = mapped_column(String(100))
    order_files: Mapped[list] = mapped_column(JSON, default=list)

    # set by admin after review
    final_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)  # e.g. 50
    payment_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    proposal_file: Mapped[str | None] = mapped_column(String(500), nullable=True)
    admin_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.pending_review)
    zarinpal_authority: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
