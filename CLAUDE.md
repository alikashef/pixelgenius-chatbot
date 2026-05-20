# FreelioAI — Project Instructions

این فایل راهنمای Claude Code برای این پروژه‌ست.
قبل از هر کاری، بخش مرتبط رو بخون.

---

## چشم‌انداز محصول

پلتفرم ارائه **Agent هوشمند** برای فریلنسرهاست.
هر فریلنسر یک چت‌بات اختصاصی دریافت می‌کند، آن را روی سایتش embed می‌کند،
مشتریانش نیازمندی‌ها را توضیح می‌دهند، AI مکالمه را مدیریت می‌کند،
درخواست ساختاریافته ثبت می‌شود، فریلنسر Proposal + Milestone ارسال می‌کند،
مشتری تایید و پرداخت مرحله‌ای انجام می‌دهد، و AI در طول پروژه همراه است.

**شرح کامل فلو:** `.codex/project/overview.md`

> وضعیت فعلی: MVP — فلوی intake تا پرداخت اولیه پیاده شده.

---

## راهنمای بخش‌ها

| بخش | فایل راهنما |
|-----|-------------|
| **پروژه کلی + فلوی کامل** | `.codex/project/overview.md` |
| **چت‌بات (system prompt + قوانین)** | `.codex/chat/rules.md` |
| **بک‌اند (FastAPI)** | `.codex/backend/architecture.md` |
| **فرانت‌اند (Next.js)** | `.codex/frontend/architecture.md` |
| **تحقیق بازار** | `.codex/market-research/` |

---

## Stack فنی

```
Frontend:  Next.js 14 (App Router) + Tailwind CSS + shadcn/ui  → port 3000
Backend:   FastAPI (Python) + SQLAlchemy async                  → port 8000
Database:  PostgreSQL 16
Payment:   Zarinpal v4 API
AI:        Anthropic Claude (claude-sonnet-4-20250514)
Deploy:    Docker Compose + Caddy (TLS auto)
```

---

## ساختار فایل‌ها

```
frontend/
  app/
    layout.tsx                  ← root layout (html, body, CSS vars)
    (landing)/
      layout.tsx                ← Navbar + Footer فقط لندینگ
      page.tsx                  ← صفحه اصلی (server component)
    chat/page.tsx               ← ویجت چت intake (client)
    panel/
      page.tsx                  ← پنل مشتری (client)
      [id]/page.tsx             ← جزئیات سفارش (client)
    login/page.tsx              ← OTP login مشتری (client)
    proposal/page.tsx           ← نمایش پروپوزال (client)
    payment/verify/page.tsx     ← تایید پرداخت (client)
    admin/
      login/page.tsx
      dashboard/page.tsx
  components/
    ui/                         ← shadcn/ui (button, badge, card)
    landing/                    ← sections لندینگ (server components)
    ChatBubble.tsx
  lib/
    utils.ts                    ← cn()
    api.ts                      ← همه fetch calls

backend/
  main.py                       ← FastAPI app
  models.py                     ← SQLAlchemy models
  schemas.py                    ← Pydantic schemas
  prompts/                      ← system prompt در بخش‌های جدا
  lib/ai/                       ← لایه AI
  routers/                      ← endpoints
  services/
```

---

## Design System

### تم: تاریک + Violet

```css
--background:   #09090b          /* پس‌زمینه اصلی */
--violet:       #7c3aed          /* accent اصلی */
--violet-glow:  rgba(124,58,237,0.18)
--violet-border:rgba(124,58,237,0.25)
--surface:      #110f1e          /* کارت / سطح */
--surface-2:    #1a1730          /* سطح داخلی */
```

- فونت: **Vazirmatn** — همه جا
- direction: **RTL** در html و body
- هیچ light mode نداریم
- رنگ hardcode نکن — فقط از CSS variables یا Tailwind violet palette

### shadcn/ui موجود

`components/ui/button.tsx` — variants: default, outline, ghost, secondary
`components/ui/badge.tsx` — variants: default, secondary, outline
`components/ui/card.tsx` — + Header, Title, Description, Content, Footer

```ts
import { cn } from "@/lib/utils"
```

---

## قوانین Claude Code

### همیشه
- قبل از تغییر هر بخش، فایل `.codex` مربوطش را بخوان
- فایل جدید نساز مگر واقعاً ضروری باشد
- کامنت فارسی ننویس مگر صریح خواسته شود
- commit message به انگلیسی

### فرانت‌اند
- لندینگ sections → **server component** (بدون `"use client"`)
- صفحات با state → **client component**
- layout مشترک → در `layout.tsx` بگذار، نه در `page.tsx`
- shadcn components → از `components/ui/` import کن، دوباره نساز

### قبل از commit
```bash
cd frontend && pnpm build   # باید بدون خطا کامل شود
```

---

## دستورات محیط

```bash
# dev
cd frontend && pnpm dev
cd backend && uvicorn main:app --reload

# screenshot موبایل (390×844)
npx playwright screenshot --browser chromium \
  --viewport-size "390,844" --full-page http://localhost:3000 out.png

# screenshot دسکتاپ فول‌پیج
npx playwright screenshot --browser chromium \
  --viewport-size "1440,900" --full-page http://localhost:3000 out.png
```
