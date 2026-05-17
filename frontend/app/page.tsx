import Link from "next/link";
import {
  IconArrowLeft,
  IconBrandReact,
  IconChartBar,
  IconChecklist,
  IconCreditCard,
  IconMessageCircle2,
  IconRocket,
  IconShieldCheck,
  IconSparkles,
  IconUserCheck,
} from "@tabler/icons-react";

const SERVICES = [
  { title: "فروشگاه آنلاین", text: "محصول، سفارش، پرداخت و پنل مدیریت", icon: IconCreditCard },
  { title: "داشبورد اختصاصی", text: "گزارش، احراز هویت، نقش‌ها و نمودار", icon: IconChartBar },
  { title: "لندینگ و سایت شرکتی", text: "معرفی حرفه‌ای، فرم جذب لید و سئو پایه", icon: IconRocket },
  { title: "بک‌اند و API", text: "اتصال دیتابیس، پرداخت، پیامک و سرویس‌ها", icon: IconBrandReact },
];

const STEPS = [
  { title: "نیاز را می‌گویی", text: "چت هوشمند ابهام‌های مهم پروژه را کوتاه و مرحله‌ای می‌پرسد.", icon: IconMessageCircle2 },
  { title: "پیشنهاد می‌گیری", text: "امکانات، تکنولوژی، زمان و قیمت اولیه به صورت شفاف آماده می‌شود.", icon: IconChecklist },
  { title: "در پنل پیگیری می‌کنی", text: "درخواست ذخیره می‌شود و وضعیت بررسی، فایل پروپوزال و پرداخت را می‌بینی.", icon: IconUserCheck },
];

const TRUST = [
  { label: "برآورد سریع", value: "کمتر از ۳ دقیقه" },
  { label: "مسیر شفاف", value: "چت تا پرداخت" },
  { label: "مناسب MVP", value: "شروع سریع" },
];

function ProductMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <div className="absolute -left-8 top-12 hidden h-24 w-24 rounded-full border border-emerald-200 bg-emerald-50 md:block landing-float" />
      <div className="absolute -right-5 bottom-10 hidden h-20 w-20 rounded-3xl border border-sky-200 bg-sky-50 md:block landing-float-delayed" />

      <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.14)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-4">
          <span className="h-3 w-3 rounded-full bg-rose-300" />
          <span className="h-3 w-3 rounded-full bg-amber-300" />
          <span className="h-3 w-3 rounded-full bg-emerald-300" />
          <span className="mr-auto rounded-full bg-white px-3 py-1 text-xs text-slate-500 shadow-sm">
            intake.ai/chat
          </span>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 border-l border-slate-100 p-5">
            <div className="max-w-[86%] rounded-2xl rounded-tr-sm bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">
              سلام علی جان، پروژه وب جدیدت چه امکاناتی لازم دارد؟
            </div>
            <div className="mr-auto max-w-[88%] rounded-2xl rounded-tl-sm bg-emerald-600 px-4 py-3 text-sm leading-7 text-white">
              فروشگاه پوشاک می‌خوام؛ پرداخت آنلاین، فیلتر سایز و پنل مدیریت.
            </div>
            <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-slate-100 px-4 py-3 text-sm leading-7 text-slate-700">
              اطلاعات کافی است. پیشنهاد اولیه آماده شد و در پنل ثبت می‌شود.
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              {[64, 82, 52].map((width) => (
                <span key={width} className="h-2 rounded-full bg-slate-100" style={{ width: `${width}%` }} />
              ))}
            </div>
          </div>

          <div className="bg-slate-950 p-5 text-white">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-sm font-bold">پیشنهاد پروژه</span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs text-emerald-300">آماده ثبت</span>
            </div>
            <div className="space-y-3">
              {[
                ["فروشگاه آنلاین پوشاک", "bg-emerald-400"],
                ["پنل مدیریت و سفارش‌ها", "bg-sky-400"],
                ["درگاه پرداخت و سئو پایه", "bg-violet-400"],
              ].map(([text, color]) => (
                <div key={text} className="flex items-center gap-3 rounded-2xl bg-white/7 p-3">
                  <span className={`h-3 w-3 rounded-full ${color}`} />
                  <span className="text-xs text-slate-200">{text}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl bg-white p-4 text-slate-950">
              <p className="text-xs text-slate-500">برآورد اولیه</p>
              <p className="mt-1 text-2xl font-black">۱۸ میلیون تومان</p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-2/3 rounded-full bg-emerald-500 landing-progress" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VectorMark() {
  return (
    <svg className="h-16 w-16 landing-float" viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="12" y="18" width="64" height="50" rx="18" fill="#ECFDF5" />
      <path d="M30 42h29M30 54h18" stroke="#059669" strokeWidth="7" strokeLinecap="round" />
      <circle cx="70" cy="68" r="14" fill="#10B981" />
      <path d="m64 68 4 4 8-10" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f7faf8] text-slate-950">
      <section className="relative border-b border-emerald-100 bg-[linear-gradient(180deg,#ffffff_0%,#f4fbf7_100%)]">
        <div className="absolute inset-x-0 top-0 h-40 bg-[linear-gradient(90deg,rgba(16,185,129,0.12),rgba(14,165,233,0.10),rgba(255,255,255,0))]" />

        <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-4 py-5">
          <Link href="/" className="flex items-center gap-2 font-black text-slate-950">
            <span className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-600 text-white">
              <IconSparkles size={20} stroke={2.2} />
            </span>
            مشاور پروژه
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/login?redirect=/panel" className="hidden text-slate-600 transition-colors hover:text-slate-950 sm:inline">
              ورود مشتری
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 font-bold text-white shadow-lg shadow-slate-950/10 transition-transform hover:-translate-y-0.5"
            >
              شروع چت
              <IconArrowLeft size={18} />
            </Link>
          </nav>
        </header>

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-78px)] max-w-7xl items-center gap-12 px-4 py-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm">
              <VectorMark />
              سفارش پروژه وب با مشاور هوشمند
            </div>
            <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-normal text-slate-950 md:text-6xl">
              از ایده مبهم تا درخواست ثبت‌شده، بدون فرم‌های طولانی
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-9 text-slate-600">
              با چند پیام ساده نیاز پروژه را توضیح بده. سیستم امکانات، زمان و برآورد اولیه را جمع‌بندی می‌کند و اگر وارد شده باشی، درخواست مستقیم در پنل تو ثبت می‌شود.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/chat"
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-black text-white shadow-xl shadow-emerald-600/20 transition-transform hover:-translate-y-0.5"
              >
                شروع مشاوره رایگان
                <IconArrowLeft size={20} />
              </Link>
              <Link
                href="/login?redirect=/panel"
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-900 shadow-sm transition-colors hover:border-emerald-200"
              >
                ورود به پنل
                <IconUserCheck size={20} />
              </Link>
            </div>

            <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
              {TRUST.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 text-sm font-black text-slate-950">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <ProductMockup />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-700">چه پروژه‌هایی مناسب‌اند؟</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950">از لندینگ ساده تا پنل اختصاصی</h2>
          </div>
          <p className="max-w-xl text-sm leading-7 text-slate-600">
            تمرکز روی پروژه‌هایی است که باید سریع، تمیز و قابل پیگیری شروع شوند.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {SERVICES.map((service) => {
            const Icon = service.icon;
            return (
              <div key={service.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition-transform hover:-translate-y-1">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Icon size={24} stroke={2.1} />
                </span>
                <h3 className="mt-5 text-lg font-black text-slate-950">{service.title}</h3>
                <p className="mt-2 text-sm leading-7 text-slate-600">{service.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16">
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="relative rounded-3xl border border-slate-200 bg-[#f8fbfa] p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-emerald-700">{(index + 1).toLocaleString("fa-IR")}</span>
                    <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-slate-800 shadow-sm">
                      <Icon size={23} stroke={2.1} />
                    </span>
                  </div>
                  <h3 className="mt-8 text-xl font-black text-slate-950">{step.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{step.text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <div className="overflow-hidden rounded-[32px] bg-slate-950 p-8 text-white shadow-2xl shadow-slate-950/15 md:p-10">
          <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm text-emerald-200">
                <IconShieldCheck size={18} />
                چت ذخیره می‌شود و درخواست در پنل قابل پیگیری است
              </div>
              <h2 className="max-w-2xl text-3xl font-black leading-tight md:text-4xl">
                همین حالا پروژه‌ات را توضیح بده؛ پیشنهاد اولیه آماده می‌شود.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-300">
                اگر لاگین کرده باشی، بعد از جمع‌بندی پروژه دیگر شماره نمی‌گیریم و درخواست مستقیم ثبت می‌شود.
              </p>
            </div>
            <Link
              href="/chat"
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-4 text-sm font-black text-slate-950 transition-transform hover:-translate-y-0.5"
            >
              رفتن به چت
              <IconArrowLeft size={20} />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
