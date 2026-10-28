# PixelGenius — Project Instructions

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
  → ویجت چت‌بات load می‌شود (embed از PixelGenius)
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
| Multi-tenant SaaS (هر فریلنسر workspace جدا) | 🟡 نسبی — دستیار، ویجت و سفارش‌ها per-freelancer؛ پرداخت هنوز مشترک |
| White-label Widget (embed با برند فریلنسر) | ✅ پیاده شده — روبات، رنگ، صدا، جایگاه |
| آموزش دستیار فریلنسر (حوزه، خدمات، قیمت، FAQ) | ✅ پیاده شده |

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
    layout.tsx                    ← root layout (html, body, YekanBakh font, theme script)
    (landing)/
      layout.tsx                  ← layout اختصاصی لندینگ
      page.tsx                    ← صفحه اصلی (server component)
    chat/page.tsx                 ← ویجت چت intake (client)
    panel/
      page.tsx                    ← پنل مشتری (client)
      [id]/page.tsx               ← جزئیات سفارش (client)
    login/page.tsx                ← ورود واحد همه (OTP + ایمیل/رمز)؛ نشست همه‌ی پنل‌ها را می‌سازد
    proposal/page.tsx             ← نمایش پروپوزال (client)
    payment/verify/page.tsx       ← تایید پرداخت Zarinpal (client)
    admin/
      dashboard/page.tsx          ← داشبورد ادمین (لینکش هیچ‌جا نمایش داده نمی‌شود)
  components/
    ui/                           ← shadcn/ui (button, badge, card)
    landing/                      ← sections لندینگ (همه server component)
      Navbar.tsx, HeroSection.tsx, ChatMockup.tsx
      HowItWorksSection.tsx, FeaturesSection.tsx
      PricingSection.tsx, CTASection.tsx, Footer.tsx
    ChatBubble.tsx                ← پیام چت (client، پشتیبانی attachment)
    Brand.tsx                     ← لوگو و BrandMark
    AppShell.tsx                  ← سایدبار پنل‌ها (client)
    AuthLayout.tsx                ← لِی‌اوت دوبخشی صفحات ورود
    ThemeToggle.tsx               ← سوییچ تم (client)
    McpTour.tsx                   ← تور آموزشی اتصال MCP در پنل مشتری + CopyBlock و BUILD_PROMPT مشترک
    OrderManager.tsx              ← بررسی/قیمت‌گذاری سفارش؛ مشترک ادمین و فریلنسر (scope)
    GuidedTour.tsx                ← تور خوش‌آمد (اسپات‌لایت + روبات راهنما + صدا)
    PreviewReview.tsx             ← بازبینی نسخه در فضای پروژه: پیش‌نمایش خودکار، «یادداشت‌گذاری» با انتخاب المان (تگ HTML + selector) و جدول تسک‌ها؛ تسک‌ها با MCP (`get_workspace.tasks`، `update_feedback` با `note`) به ایجنت می‌رسند
    public/review-bridge.js       ← اسکریپت انتخاب المان داخل پیش‌نمایش؛ فقط در حالت بازبینی (`?pg_review=1`) توسط backend به سایت تزریق می‌شود
    HostingSites.tsx              ← تب «سایت‌ها و دامنه» پنل: مهلت، تمدید رایگان، اتصال دامنه‌ی اختصاصی
    GithubRepoPicker.tsx          ← اتصال OAuth به GitHub و انتخاب مخزن در مسیر «انتشار سورس آماده»
    FreelancerPromo.tsx           ← بنر جذب فریلنسر در سایدبار صفحه اصلی (قابل بستن برای ۷ روز)
    admin/FreelancerInvites.tsx   ← ادمین: ساخت/لغو کد دعوت + لیست فریلنسرها (`/admin/dashboard?tab=freelancers`)
  lib/tours.json                  ← متن مراحل تورها (منبع مشترک UI و تولید صدا)
  lib/plans.ts                    ← تعرفه‌ها (میزبانی + فریلنسر) و BILLING_ENABLED؛ صفحه‌ی /pricing
  lib/widget.ts                   ← پالت رنگ ویجت و رنگ روبات فریلنسر
  app/freelancer/settings/        ← آموزش دستیار (حوزه، خدمات و قیمت، روش کار، FAQ)
  app/freelancer/widget/          ← ظاهر و نصب ویجت با پیش‌نمایش زنده
  app/freelancer/orders/[id]/     ← مدیریت سفارش توسط خود فریلنسر
  public/embed.js                 ← لودر ویجت: دکمه + iframe از /chat?embed=1&bot=TOKEN
  public/audio/tour/              ← صداهای تور + manifest.json (خروجی اسکریپت)
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
    freelancer_prompt.py          ← پرامپت دستیار فریلنسر؛ فقط از خدمات و قیمت‌های خودش
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
    customer_auth.py              ← POST /api/customer/otp/send + verify (خروجی: نشست واحد با همه‌ی نقش‌ها)
    hosting.py                    ← /api/customer/sites: لیست سایت‌ها، renew رایگان، دامنه‌ی اختصاصی (add/verify/delete)
    github.py                     ← /api/github/status|connect|callback|repos + DELETE (توکن رمزشده روی customers)
    settings.py                   ← تنظیمات AI
  services/
    ai_settings.py
```

---

## Backend — نکات مهم

### Database
- جدول اصلی: `orders` — PK: UUID، `features`: JSON array، `status`: enum

### ورود واحد (Unified login)
- همه از `/login` وارد می‌شوند؛ `/freelancer/login` و `/admin/login` در `next.config.js` به آن redirect می‌شوند
- شناسه‌ی اصلی **شماره موبایل** است: `build_session` در `auth.py` از روی شماره، حساب مشتری + فریلنسر (`freelancers.phone`) + ادمین (`ADMIN_PHONES`) را پیدا می‌کند و برای هر نقش توکن JWT جدا (`role`) می‌دهد
- فرانت با `saveSession` در `lib/api.ts` توکن‌ها را در کلیدهای قبلی (`customer_token`، `freelancer_token`، `admin_token`) می‌گذارد؛ خروج = `clearSession()` (خروج از همه)
- ورود ایمیل/رمز (`POST /api/auth/password-login`) برای فریلنسرهای قدیمی و ادمین env؛ فریلنسر بدون شماره بعد از ورود به `link-phone` هدایت می‌شود
- **ناوبری دو سطحی:** سایدبار صفحه‌ی اصلی (چت) فقط لینک بخش‌ها را دارد (`useSectionLinks`: طراحی محصول، فروش، فریلنسر؛ حساب کاربری از لینک پایین سایدبار) و زیرش «گفتگوهای اخیر» با چیپ ظریف «فروش» (کهربایی) یا «محصول» (بنفش). هر بخش صفحه‌ی خودش را با `AppShell` باز می‌کند (با `backHref="/"` دکمه‌ی «بازگشت» دارد) و سایدبارش فقط لینک‌های داخلی همان بخش است (`useAccountNav` بر اساس `active`). بخش «فریلنسر» فقط با دسترسی فریلنسر. بدون چیپ و بدون سوییچ پنل
- **پنل ادمین خصوصی است:** در انتخاب پنل و سایدبار هرگز نمایش داده نمی‌شود

### میزبانی و دامنه
- هر سایت منتشرشده ۵ روز رایگان (`SITE_TTL_DAYS`، `LIARA_TTL_HOURS=120`)؛ سایت استاتیک منقضی‌شده تا `SITE_GRACE_DAYS` (۷) فایل‌هایش می‌ماند
- پرداخت فعلاً خاموش (`HOSTING_BILLING` در backend، `BILLING_ENABLED` در `lib/plans.ts`)؛ تا آن موقع «تمدید رایگان» در دو روز آخر مهلت
- دامنه‌ی اختصاصی از gateway خودمان (نه API ارائه‌دهنده): جدول `site_domains`، تأیید با مقایسه‌ی DNS، کش `site_mcp.CUSTOM_DOMAINS`؛ بلوک catch-all `https://` در Caddy با on-demand TLS
- **نام ارائه‌دهنده‌ی هاست هرگز به مشتری نمایش داده نمی‌شود**: `liara.scrub()` روی خطاها و لاگ‌ها؛ فقط پنل ادمین آن را می‌بیند

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
ADMIN_PHONES          ← شماره‌هایی که با OTP پنل ادمین هم می‌گیرند (با کاما)
PUBLIC_APP_URL        ← آدرس سایت (پیش‌فرض: PUBLIC_MCP_URL بدون /mcp)
GITHUB_CLIENT_ID      ← GitHub OAuth App؛ callback: PUBLIC_APP_URL/api/github/callback
GITHUB_CLIENT_SECRET
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

## Design System — "Studio"

رنگ اپ **بنفش `#7c3aed`** (دکمه‌های اصلی، حالت فعال، لینک‌ها و نشان برند)؛ رنگ ثانویه **کهربایی** (`accent`)
فقط برای تأکیدهای کوچک (badge «پیشنهادی»، برچسب «به‌زودی»، تیک‌های پنل برند). پایه‌ی خنثی‌ها سرد و آرام.
بدون گرادیان و glow؛ عمق فقط با بوردر و سایه‌ی خیلی نرم. ساختار: سایدبار + محتوای متمرکز.

### توکن‌ها

همه رنگ‌ها در `frontend/app/globals.css` به‌صورت کانال HSL (`:root` = لایت، `.dark` = دارک)
و در `tailwind.config.js` با `<alpha-value>` نگاشت شده‌اند (`bg-brand-solid/10` کار می‌کند).

| کلاس Tailwind | کاربرد |
|---------------|--------|
| `bg-background` / `text-foreground` | پس‌زمینه کاغذی و متن جوهری |
| `bg-surface` / `bg-surface-2` | کارت / سطح فرعی (سایدبار، سگمنت، هدر جدول) |
| `text-muted-foreground` / `text-secondary-foreground` | متن کم‌رنگ / متن ثانویه |
| `border-border` / `border-input` | بوردر عمومی / بوردر فیلد |
| `bg-primary` + `text-primary-foreground` | دکمه اصلی (بنفش `#7c3aed`، متن سفید) |
| `bg-brand-solid` + `text-brand-foreground` | بنفش برند |
| `bg-brand-soft` / `border-brand-line` / `text-brand` | تینت بنفش و متن بنفش (کنتراست AA) |
| `bg-accent-solid` / `bg-accent-soft` / `text-accent` | کهربایی ثانویه؛ فقط تأکیدهای کوچک |
| `ring-ring` | فوکوس (بنفش) |
| `success` / `warning` / `pending` / `danger` / `info` | وضعیت‌ها؛ pill = `bg-x/10 text-x` + نقطه |

سایه‌ها: `shadow-card` (خیلی نرم)، `shadow-elevated` (پاپ‌اور/کامپوزر)، `shadow-glow` (حلقه انتخاب).
Utilityها: `glass` (هدر)، `bg-dots` (بافت پنل برند). فیلد فرم: `field` و `field-label`؛ برچسب بخش: `eyebrow`.
شعاع: `--radius` = 10px (`rounded-lg`)؛ کارت‌ها `rounded-xl`.

### کامپوننت‌های ساختاری

| کامپوننت | کاربرد |
|----------|--------|
| `components/Brand.tsx` | لوگوی pixelgenius: `BrandMark` (مکعب PG)، `BrandLockup` (لوگوی کامل + خط فارسی «طراحی خلاق، توسعه هوشمند با نابغه پیکسل»)، `BrandLogo` (لینک لوگو) — SVG با `currentColor` (روی پنل معکوس `text-background` بده)؛ فاوآیکن: `app/icon.svg` |
| `components/AppShell.tsx` | سایدبار (دسکتاپ) / دراور (موبایل) + عنوان صفحه؛ پنل مشتری، ادمین و فریلنسر |
| `components/AuthLayout.tsx` | صفحه‌ی دوبخشی ورود: فرم + پنل برند معکوس (variant: customer / freelancer / admin) |
| `components/ThemeToggle.tsx` | روشن / تیره / سیستم |
| `components/GuidedTour.tsx` | تور اولین ورود: اسپات‌لایت روی المان‌های `data-tour`، روبات دایره‌ای بنفش که حین پخش صدا «حرف می‌زند»؛ با `startTour(id)` دوباره باز می‌شود |
| `components/McpTour.tsx` | تور ۵ مرحله‌ای اتصال ابزار AI به سرور MCP (`/panel?tab=connect`)، پیشرفت در `localStorage.mcp_tour` |

### قوانین طراحی

- دو تم **لایت و دارک**؛ پیش‌فرض تابع سیستم، ذخیره در `localStorage.theme_mode`؛ اسکریپت `app/layout.tsx` قبل از رندر `.dark` را می‌گذارد
- صفحه‌ی جدید داخل پنل → `AppShell`؛ صفحه‌ی ورود → `AuthLayout`؛ هر دو `ThemeToggle` دارند
- فونت: **YekanBakh FaNum** (لوکال در `frontend/app/fonts/`، `--font-yekan`) — Light(300) · Bold(700) · ExtraBold · Black · ExtraBlack
- direction: **RTL**
- رنگ hardcode نکن (hex، `text-white`، palette مثل `violet-300`) — فقط توکن‌ها
- گرادیان و glow استفاده نکن؛ کهربایی را کم و هدفمند خرج کن
- رنگ‌های hex روبات‌ها (`robot-heads` فقط hex می‌گیرد): بنفش `#7c3aed`، جوهری `#1e1b2e`؛ ویجت فریلنسر پیش‌فرض `violet` و `accentStyle` توکن‌های primary/brand را با رنگ فریلنسر عوض می‌کند
- انتخاب‌شده‌ها: بوردر `foreground` (کارت) یا سطح `surface` روی `surface-2` (سگمنت)
- چت: پیام دستیار بدون حباب کنار `BrandMark`؛ پیام کاربر در حباب `surface-2`
- ایموجی به‌عنوان آیکون UI ممنوع — `@tabler/icons-react` با `aria-hidden`
- transition ۱۵۰–۲۰۰ms؛ `prefers-reduced-motion` رعایت شده

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
- **کد** (frontend/، backend/) → همیشه روی `dev` push می‌شه
- **داکیومنت** (CLAUDE.md، AGENTS.md، .codex/) → روی `main` push می‌شه
- merge کد از `dev` به `main` فقط وقتی کاربر صریح بگوید

---

## قوانین کدنویسی

- **فایل جدید نساز** مگر واقعاً ضروری باشد
- **کامنت فارسی ننویس** مگر صریح خواسته شود
- **commit message به انگلیسی**
- لندینگ sections → **server component** (بدون `"use client"`)
- صفحات با state → **client component**
- layout مشترک → در `layout.tsx`، نه در `page.tsx`
- shadcn components → از `components/ui/` import کن، دوباره نساز

### صدای تور (ElevenLabs)

متن تورها فقط در `frontend/lib/tours.json` تغییر می‌کند. بعد از هر تغییر:

```bash
ELEVENLABS_API_KEY=... python3 scripts/generate_tour_audio.py
```

کلید فقط از env خوانده می‌شود و **هرگز** commit نمی‌شود. اختیاری: `ELEVENLABS_VOICE_ID`، `ELEVENLABS_MODEL_ID` (پیش‌فرض `eleven_v3`).
اگر فایل صدا نباشد، تور بدون صدا (فقط متن) کار می‌کند.

### دستیار و ویجت فریلنسر

- چت با `bot_token` از `prompts/freelancer_prompt.py` استفاده می‌کند، نه پرامپت و جدول قیمت آژانس؛ دانش فریلنسر در `freelancers.knowledge` (JSON)
- ظاهر ویجت در `freelancers.widget_settings`؛ پروفایل عمومی: `GET /api/bot/{token}`
- سفارش‌ها با `bot_token` به فریلنسر نسبت داده می‌شوند (در proposal/handoff)؛ فریلنسر فقط سفارش‌های خودش را از `/api/freelancer/orders/*` می‌بیند
- نصب: `<script src="https://APP/embed.js" data-bot="TOKEN" async></script>`
- ثبت‌نام فریلنسر = فعال‌کردن پنل فریلنسر روی حساب واردشده با موبایل (`/freelancer/register`)، **فقط با کد دعوت** (جدول `invite_codes`، کد `FRL-XXXXXXXX`، مصرف اتمیک با `used_count < max_uses`)؛ لینک دعوت: `/freelancer/register?invite=CODE`
- ادمین: `GET/POST /api/admin/invites`، `DELETE /api/admin/invites/{code}` (لغو)، `GET /api/admin/freelancers`

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
