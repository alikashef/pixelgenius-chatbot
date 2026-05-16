# Project Overview

## هدف
سیستم دریافت پروژه فریلنس — مشتری از طریق چت با Claude پروژه‌اش رو توضیح می‌ده،
پیشنهاد قیمت دریافت می‌کنه و آنلاین پرداخت می‌کنه.

## Stack
- Frontend: Next.js 14 (App Router) + Tailwind CSS — پورت 3000
- Backend: FastAPI (Python) — پورت 8000
- Database: PostgreSQL 16 + SQLAlchemy async
- Payment: Zarinpal (v4 API)
- AI: Anthropic Claude (claude-sonnet-4-20250514)

## ساختار monorepo
```
/frontend   ← Next.js
/backend    ← FastAPI
docker-compose.yml
```

## فلوی اصلی
```
/chat  →  Claude جمع‌آوری اطلاعات  →  JSON proposal  →  /proposal  →  Zarinpal  →  /payment/verify
```

## نکات مهم
- تمام UI به فارسی و RTL
- فونت Vazirmatn
- تم تاریک (#0a0a0a) با accent سبز (#22c55e)
- proposal بین صفحات از طریق localStorage منتقل می‌شه
