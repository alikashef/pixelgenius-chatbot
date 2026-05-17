# Frontend Architecture — Next.js 14

## ساختار صفحات
```
app/
  page.tsx                    ← redirect به /chat
  chat/page.tsx               ← چت‌بات اصلی
  proposal/page.tsx           ← نمایش پیشنهاد + دکمه پرداخت
  payment/verify/page.tsx     ← تایید پرداخت Zarinpal
  admin/
    page.tsx                  ← redirect به /admin/login
    login/page.tsx            ← فرم ورود JWT
    dashboard/page.tsx        ← پنل مدیریت سفارشات
```

## فایل‌های مشترک
```
lib/api.ts          ← همه fetch calls به backend
components/
  ChatBubble.tsx    ← حباب پیام در چت
```

## انتقال داده بین صفحات
- proposal از `/chat` به `/proposal` از طریق `localStorage` ("proposal" key)
- بعد پرداخت موفق localStorage پاک می‌شه

## Design System
- رنگ پس‌زمینه: `#0a0a0a` (bg)
- رنگ surface: `#141414`
- accent: `#22c55e`
- فونت: Vazirmatn (Google Fonts)
- direction: RTL

## API Base URL
از env: `NEXT_PUBLIC_API_URL` — پیش‌فرض `http://localhost:8000`

## نکات
- همه صفحات `"use client"` هستن (state management لازم دارن)
- Proposal JSON detection: اگه جواب Claude با `{` شروع بشه و `"type": "proposal"` داشته باشه
