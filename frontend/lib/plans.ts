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

/** Wallet: 1 credit = TOMAN_PER_CREDIT toman. Mirrors backend/services/credits.py. */
export const TOMAN_PER_CREDIT = 100;
export const MIN_TOPUP_TOMAN = 50_000;
export const CREDIT_PACKS = [50_000, 100_000, 200_000, 500_000];

export interface CreditLine {
  label: string;
  /** Credits; a string when the price depends on usage. */
  credits: number | string;
  note?: string;
}
export interface CreditGroup {
  id: string;
  title: string;
  description: string;
  lines: CreditLine[];
}

/** Credit prices per section. Video numbers mirror CREDIT_PRICES and STYLE_CATALOG in backend/services/video_maker.py. */
export const CREDIT_GROUPS: CreditGroup[] = [
  {
    id: "sales",
    title: "فروش",
    description: "گفتگو با دستیار فروش، برآورد قیمت و ثبت درخواست.",
    lines: [{ label: "گفتگوی فروش و ثبت سفارش", credits: "رایگان", note: "کردیت کم نمی‌کنه" }],
  },
  {
    id: "design",
    title: "طراحی محصول",
    description: "هزینه‌ی هر پیام برابر مصرف واقعی هوش مصنوعی همون پیامه (به‌علاوه‌ی سهم کوچک پلتفرم). گفتگوی کوتاه ارزون‌تر، گفتگوی طولانی با فایل و سورس گرون‌تره.",
    lines: [
      { label: "پیام کوتاه", credits: "حدود ۳", note: "گفتگوی تازه، بدون فایل" },
      { label: "پیام معمولی", credits: "حدود ۸", note: "چند پیام قبلی در گفتگو" },
      { label: "پیام سنگین", credits: "حدود ۱۵ تا ۳۰", note: "گفتگوی طولانی، فایل یا سورس پروژه" },
    ],
  },
  {
    id: "video",
    title: "ویدیوساز",
    description: "قیمت دقیق قبل از ساخت ویدیو نشون داده می‌شه؛ ویدیوی ۳۰ ثانیه‌ای با سبک ساده حدود ۳۴۰ کردیت.",
    lines: [
      { label: "تحلیل و نوشتن سناریو", credits: 80 },
      { label: "صدای گوینده", credits: 120, note: "برای هر ۳۰ ثانیه" },
      { label: "زیرنویس", credits: 40 },
      { label: "کاور", credits: 60 },
      { label: "رندر نهایی", credits: 40 },
      { label: "ویرایش با دستیار (هر بار)", credits: 120 },
      { label: "سبک‌های ساده: تایپوگرافی", credits: "۰", note: "بدون هزینه‌ی اضافه" },
      { label: "سبک اشکال هندسی یا ذرات", credits: "+۴۰" },
      { label: "سبک موج صدا یا مراحل", credits: "+۳۰" },
      { label: "سبک قاب موبایل", credits: "+۵۰" },
      { label: "سبک کلیپ‌های تو", credits: "+۲۰" },
      { label: "سبک قبل و بعد", credits: "+۳۰" },
    ],
  },
  {
    id: "assistant",
    title: "دستیار فریلنسر",
    description: "پنل و ویجت رایگانه؛ فقط وقتی مشتری‌هات با دستیار حرف می‌زنن، هزینه‌ی همون پاسخ‌ها از کیف پول خودت کم می‌شه. با موجودی صفر ویجت خاموش می‌شه.",
    lines: [
      { label: "هر پاسخ دستیار به مشتری تو", credits: "حدود ۳ تا ۸", note: "بر اساس طول گفتگو" },
      { label: "پنل فریلنسر، آموزش دستیار و ویجت", credits: "رایگان" },
    ],
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
