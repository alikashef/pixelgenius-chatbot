/**
 * Tariffs shown in the app. Payment is not live yet: every plan works for free until the
 * gateway is connected, so purchase buttons render as "coming soon" while BILLING_ENABLED is false.
 */
export const BILLING_ENABLED = false;

export interface Plan {
  id: string;
  name: string;
  /** Monthly price in toman. */
  monthly: number;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

/** Yearly billing: twelve months for the price of ten. */
export const yearly = (plan: Plan) => plan.monthly * 10;

export const FREELANCER_PLANS: Plan[] = [
  {
    id: "starter",
    name: "شروع",
    monthly: 149_000,
    tagline: "برای فریلنسری که تازه دستیار می‌خواد",
    features: ["۵۰ گفتگوی مشتری در ماه", "آموزش دستیار با خدمات و قیمت‌های خودت", "ویجت با روبات و صدا"],
  },
  {
    id: "pro",
    name: "حرفه‌ای",
    monthly: 349_000,
    tagline: "برای فریلنسرهای فعال",
    highlight: true,
    features: [
      "۳۰۰ گفتگوی مشتری در ماه",
      "همه‌ی امکانات شروع",
      "حذف «قدرت گرفته از pixelgenius»",
      "خلاصه‌ی AI و پیشنهاد قیمت روی هر درخواست",
    ],
  },
  {
    id: "studio",
    name: "استودیو",
    monthly: 790_000,
    tagline: "برای چند سایت یا چند برند",
    features: ["۱۰۰۰ گفتگوی مشتری در ماه", "همه‌ی امکانات حرفه‌ای", "تا ۳ دستیار جدا"],
  },
];

export const HOSTING_PLANS: Plan[] = [
  {
    id: "static",
    name: "سایت استاتیک",
    monthly: 99_000,
    tagline: "لندینگ، کاتالوگ و سایت شرکتی",
    features: ["دامنه‌ی اختصاصی + SSL خودکار", "۵ روز آزمایشی رایگان", "انتشار دوباره با هر تغییر"],
  },
  {
    id: "dynamic",
    name: "سایت داینامیک",
    monthly: 290_000,
    tagline: "سایت با بک‌اند و پنل مدیریت",
    highlight: true,
    features: ["دامنه‌ی اختصاصی + SSL خودکار", "۵ روز آزمایشی رایگان", "Next.js، Node، Python، PHP و …"],
  },
  {
    id: "dynamic-db",
    name: "داینامیک + دیتابیس",
    monthly: 490_000,
    tagline: "فروشگاه و هر پروژه‌ای با دیتابیس",
    features: ["همه‌ی امکانات داینامیک", "دیتابیس PostgreSQL اختصاصی", "۵ روز آزمایشی رایگان"],
  },
];

export const formatToman = (value: number) => value.toLocaleString("fa-IR");
