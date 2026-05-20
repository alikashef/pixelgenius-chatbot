# FreelioAI — Project Instructions

> این فایل تنها منبع راهنمای پروژه است — هم برای Claude Code هم برای Codex.
> تحقیق بازار و سوالات مصاحبه در `.codex/market-research/` نگه داشته شده‌اند.

---

## چشم‌انداز محصول

پلتفرم ارائه **Agent هوشمند** برای فریلنسرهای ایرانی.

هر فریلنسر یک چت‌بات اختصاصی دریافت می‌کند و آن را روی سایت خودش embed می‌کند.
مشتریانش نیازمندی‌های پروژه را با AI توضیح می‌دهند، Agent مکالمه را با داده‌های
فریلنسر مدیریت می‌کند، درخواست ساختاریافته ثبت می‌شود، فریلنسر Proposal +
Milestone ارسال می‌کند، مشتری تایید و پرداخت مرحله‌ای انجام می‌دهد، و AI در
طول کل پروژه همراه هر دو طرف است.

**مدل درآمدی:** اشتراک ماهانه از فریلنسر

> **وضعیت فعلی:** MVP — فلوی intake تا پرداخت اولیه پیاده شده.

---

## فلوی کامل محصول

### ۱ — Intake

```
مشتری وارد سایت فریلنسر می‌شود
  → ویجت چت‌بات load می‌شود (embed از FreelioAI)
  → Agent با داده‌های فریلنسر مکالمه را آغاز می‌کند
     (نوع خدمات، محدوده قیمت، فرآیند کاری، سوالات موردنیاز)
  → نیازمندی‌ها مرحله‌به‌مرحله جمع‌آوری می‌شود
  → درخواست ساختاریافته + محدوده تقریبی قیمت تولید می‌شود
  → شماره مشتری دریافت و OTP تایید می‌شود
  → درخواست برای فریلنسر ثبت می‌شود
```

### ۲ — Proposal

```
فریلنسر درخواست را در پنل می‌بیند
  → AI خلاصه دقیق نیازمندی‌ها + پیشنهاد قیمت اولیه نمایش می‌دهد
  → فریلنسر: مبلغ نهایی + Milestoneها + Proposal رسمی را تعریف می‌کند
  → Proposal برای مشتری ارسال می‌شود
```

### ۳ — تایید و پرداخت

```
مشتری Proposal را بررسی می‌کند
  → در صورت تایید، Project Space ایجاد می‌شود
  → پرداخت مرحله‌ای per Milestone (Zarinpal)
```

### ۴ — Project Space

```
فضای مشترک مشتری و فریلنسر:
  ├── چت یک‌به‌یک مستقیم
  ├── مدیریت Milestone (وضعیت، تایید، پرداخت)
  ├── ارسال و دریافت فایل و مستندات
  └── پیگیری وضعیت پروژه
```

### ۵ — AI Agent پروژه

```
وقتی فریلنسر آنلاین نیست:
  → Agent با داده‌های پروژه + تاریخچه گفتگوها به مشتری پاسخ می‌دهد
  → تغییرات درخواستی را شناسایی و به فریلنسر گزارش می‌دهد
  → در صورت نیاز Task جدید برای فریلنسر تعریف می‌کند
```

---

## وضعیت ماژول‌ها

| ماژول | وضعیت |
|-------|--------|
| Intake Widget (چت‌بات embed) | ✅ MVP آماده |
| OTP Auth مشتری | ✅ پیاده شده |
| Proposal Engine (AI خلاصه + قیمت) | ✅ پیاده شده |
| پرداخت پایه Zarinpal | ✅ پیاده شده |
| پنل مشتری | ✅ پیاده شده |
| پنل ادمین | ✅ پیاده شده |
| لندینگ پیج SaaS | ✅ پیاده شده |
| Proposal ارسالی فریلنسر (Milestone + مبلغ) | 🔲 ساخته نشده |
| Project Space (چت، فایل، milestone) | 🔲 ساخته نشده |
| پرداخت مرحله‌ای per Milestone | 🔲 ساخته نشده |
| AI Agent پروژه | 🔲 ساخته نشده |
| Multi-tenant SaaS (هر فریلنسر workspace جدا) | 🔲 ساخته نشده |
| White-label Widget (embed با برند فریلنسر) | 🔲 ساخته نشده |

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
    layout.tsx                    ← root layout (html, body, CSS vars, Vazirmatn)
    (landing)/
      layout.tsx                  ← layout اختصاصی لندینگ
      page.tsx                    ← صفحه اصلی (server component)
    chat/page.tsx                 ← ویجت چت intake (client)
    panel/
      page.tsx                    ← پنل مشتری (client)
      [id]/page.tsx               ← جزئیات سفارش (client)
    login/page.tsx                ← OTP login مشتری (client)
    proposal/page.tsx             ← نمایش پروپوزال (client)
    payment/verify/page.tsx       ← تایید پرداخت Zarinpal (client)
    admin/
      login/page.tsx              ← JWT login ادمین
      dashboard/page.tsx          ← داشبورد ادمین
  components/
    ui/                           ← shadcn/ui (button, badge, card)
    landing/                      ← sections لندینگ (همه server component)
      Navbar.tsx, HeroSection.tsx, ChatMockup.tsx
      HowItWorksSection.tsx, FeaturesSection.tsx
      PricingSection.tsx, CTASection.tsx, Footer.tsx
    ChatBubble.tsx                ← حباب پیام (client، پشتیبانی attachment)
  lib/
    utils.ts                      ← cn() با clsx + tailwind-merge
    api.ts                        ← همه fetch calls به backend

backend/
  main.py                         ← FastAPI app، CORS، lifespan
  database.py                     ← async SQLAlchemy engine + get_db
  models.py                       ← SQLAlchemy models (Order, Customer, ...)
  schemas.py                      ← Pydantic schemas
  auth.py                         ← JWT admin auth
  otp_store.py                    ← OTP in-memory store
  sms.py                          ← ملی‌پیامک
  prompts/                        ← system prompt در بخش‌های جدا
    system_prompt.py
    pricing_knowledge.py          ← جدول قیمت‌ها اینجاست
    question_flow.py
    sales_rules.py
    technical_advice.py
    output_schema.py
  lib/ai/
    analyze_lead.py
    build_messages.py
    parse_ai_response.py
  routers/
    chat.py                       ← POST /api/chat
    payment.py                    ← POST /api/payment/request + GET /api/payment/verify
    orders.py                     ← GET /api/orders, /orders/stats, /orders/{id}
    auth.py                       ← POST /api/auth/login (admin JWT)
    customer.py                   ← GET/PATCH /api/customer/profile
    customer_auth.py              ← POST /api/customer/auth/send-otp + verify-otp
    settings.py                   ← تنظیمات AI
  services/
    ai_settings.py
```

---

## Backend — نکات مهم

### Database
- جدول اصلی: `orders` — PK: UUID، `features`: JSON array، `status`: enum
- Auth ادمین: JWT با jose، توکن ۸ ساعته، credentials از env
- Auth مشتری: OTP → توکن در localStorage

### Zarinpal
- API v4: `api.zarinpal.com/pg/v4/...`
- Order قبل از redirect ساخته می‌شود
- authority روی Order ذخیره می‌شود برای verify

### Environment Variables — Backend
```
ANTHROPIC_API_KEY
ZARINPAL_MERCHANT_ID
DATABASE_URL          postgresql+asyncpg://postgres:postgres@db:5432/freelance_intake
JWT_SECRET
ADMIN_USERNAME
ADMIN_PASSWORD
SMS_API_KEY           ← ملی‌پیامک
SMS_LINE_NUMBER
```

### Environment Variables — Frontend
```
NEXT_PUBLIC_API_URL   ← پیش‌فرض http://localhost:8000
```

---

## System Prompt — قوانین

- هر سوال غیرمرتبط با پروژه → **فوری رد کن** (یک جمله، بدون توضیح اضافه)
- JSON output ساختار نباید تغییر کند — فرانت وابسته است
- قیمت‌ها فقط در `backend/prompts/pricing_knowledge.py` تغییر می‌کنند:

| نوع پروژه | قیمت (تومان) | روز |
|-----------|-------------|-----|
| لندینگ پیج | ۴ میلیون | ۳ |
| سایت کاتالوگ | ۸ میلیون | ۵ |
| فروشگاه آنلاین | ۱۸ میلیون | ۱۲ |
| داشبورد/پنل | ۱۴ میلیون | ۱۰ |
| پنل ادمین اضافه | ۳ میلیون | ۲ |
| SEO پیشرفته | ۲.۵ میلیون | ۲ |
| API/بکاند | ۶ میلیون | ۵ |

---

## Design System

### رنگ‌ها

```css
--background:    #09090b                    /* پس‌زمینه اصلی */
--foreground:    hsl(0 0% 95%)              /* متن */
--card:          hsl(258 30% 8%)            /* سطح کارت */
--primary:       #7c3aed                    /* violet accent */
--border:        hsl(258 25% 16%)           /* بوردر */
--violet:        #7c3aed
--violet-light:  #a78bfa
--violet-glow:   rgba(124, 58, 237, 0.18)
--violet-border: rgba(124, 58, 237, 0.25)
--surface:       #110f1e
--surface-2:     #1a1730
```

### قوانین طراحی

- تم همیشه **تاریک** — هیچ light mode نداریم
- فونت: **Vazirmatn** همه‌جا
- direction: **RTL** در html و body
- رنگ hardcode نکن — فقط از CSS variables یا `violet-*` Tailwind palette
- hover استاندارد: `hover:-translate-y-1` یا `hover:border-[--violet-border]`
- glow روی primary: `shadow-[--violet-glow]`

### shadcn/ui موجود

| کامپوننت | مسیر | variants |
|----------|------|---------|
| Button | `components/ui/button.tsx` | default, outline, ghost, secondary |
| Badge | `components/ui/badge.tsx` | default, secondary, outline |
| Card | `components/ui/card.tsx` | + Header, Title, Description, Content, Footer |

```ts
import { cn } from "@/lib/utils"
```

---

## قوانین Git

- فقط دو برنچ داریم: **`main`** و **`dev`**
- هیچ برنچ دیگه‌ای نساز — feature branch، hotfix branch، یا هر چیز دیگه‌ای
- **همه تغییرات فقط روی `dev` push می‌شن** — هرگز مستقیم به `main` push نکن
- merge به `main` فقط وقتی کاربر صریح بگوید: "بریز روی main" یا "merge کن به main"

---

## قوانین کدنویسی

- **فایل جدید نساز** مگر واقعاً ضروری باشد
- **کامنت فارسی ننویس** مگر صریح خواسته شود
- **commit message به انگلیسی**
- لندینگ sections → **server component** (بدون `"use client"`)
- صفحات با state → **client component**
- layout مشترک → در `layout.tsx`، نه در `page.tsx`
- shadcn components → از `components/ui/` import کن، دوباره نساز

### قبل از هر commit

```bash
cd frontend && pnpm build    # باید بدون خطا کامل شود
```

---

## دستورات محیط

```bash
# dev
cd frontend && pnpm dev
cd backend && uvicorn main:app --reload

# screenshot موبایل iPhone 14
npx playwright screenshot --browser chromium \
  --viewport-size "390,844" --full-page http://localhost:3000 mobile.png

# screenshot دسکتاپ فول‌پیج
npx playwright screenshot --browser chromium \
  --viewport-size "1440,900" --full-page http://localhost:3000 desktop.png
```
