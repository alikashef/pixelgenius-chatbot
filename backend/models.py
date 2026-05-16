import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, Integer, Enum, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from database import Base
import enum


class OrderStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    cancelled = "cancelled"


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_name: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    features: Mapped[list] = mapped_column(JSON, default=list)
    tech_stack: Mapped[str] = mapped_column(String(255))
    delivery_days: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)
    price_label: Mapped[str] = mapped_column(String(100))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.pending)
    zarinpal_authority: Mapped[str | None] = mapped_column(String(100), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
