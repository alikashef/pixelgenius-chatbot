# Backend Architecture — FastAPI

## ساختار فایل‌ها
```
backend/
  main.py          ← app entry, CORS, lifespan (auto create tables)
  database.py      ← async SQLAlchemy engine + get_db dependency
  models.py        ← Order model (PostgreSQL)
  schemas.py       ← Pydantic schemas (request/response)
  auth.py          ← JWT create/verify, get_current_admin dependency
  routers/
    chat.py        ← POST /api/chat
    payment.py     ← POST /api/payment/request, GET /api/payment/verify
    orders.py      ← GET /api/orders, /orders/stats, /orders/{id}
    auth.py        ← POST /api/auth/login
```

## Database
- جدول: `orders`
- PK: UUID string
- `features`: JSON array
- `status`: enum — pending / paid / cancelled
- `paid_at`: nullable timestamp

## Auth
- JWT با jose library
- credentials از env: `ADMIN_USERNAME`, `ADMIN_PASSWORD`
- توکن ۸ ساعته

## Zarinpal
- API v4: `api.zarinpal.com/pg/v4/...`
- Order قبل از redirect ساخته می‌شه
- authority روی Order ذخیره می‌شه برای verify

## Environment Variables
```
ANTHROPIC_API_KEY
ZARINPAL_MERCHANT_ID
DATABASE_URL
JWT_SECRET
ADMIN_USERNAME
ADMIN_PASSWORD
```
