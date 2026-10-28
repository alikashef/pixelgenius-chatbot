import { ReactNode } from "react";
import { IconCheck } from "@tabler/icons-react";
import { BrandLogo, BrandMark } from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";

const PANELS = {
  customer: {
    headline: "از ایده تا پروژه‌ی قابل‌ساخت، با یک گفتگو.",
    points: [
      "نیازت رو به زبان خودت توضیح بده",
      "ساختار، استک و برآورد پروژه رو بگیر",
      "وضعیت پروژه و پرداخت‌ها رو یک‌جا دنبال کن",
    ],
    quote: { from: "مشتری", text: "یه سیستم نوبت‌دهی برای کلینیک می‌خوام" },
    reply: "عالیه! چند پزشک دارید و پرداخت آنلاین لازمه؟",
  },
  freelancer: {
    headline: "دستیار هوشمندی که جای تو با مشتری حرف می‌زنه.",
    points: [
      "نیازسنجی کامل مشتری، حتی وقتی آنلاین نیستی",
      "درخواست ساختاریافته با برآورد قیمت",
      "پروپوزال، مایلستون و پرداخت در یک پنل",
    ],
    quote: { from: "مشتری", text: "برای فروشگاهم چقدر هزینه می‌شه؟" },
    reply: "بر اساس نیازهاتون بین ۱۸ تا ۲۲ میلیون تومان برآورد می‌شه.",
  },
  admin: {
    headline: "همه‌ی سفارش‌ها، تنظیمات و انتشارها در یک نگاه.",
    points: ["بررسی و قیمت‌گذاری سفارش‌ها", "مدیریت رفتار دستیار هوشمند", "کنترل سایت‌های منتشرشده"],
    quote: null,
    reply: null,
  },
} as const;

export default function AuthLayout({
  title,
  description,
  children,
  footer,
  variant = "customer",
  wide = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: keyof typeof PANELS;
  wide?: boolean;
}) {
  const panel = PANELS[variant];
  return (
    <div className="flex min-h-[100dvh] bg-background">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between px-5 sm:px-8">
          <BrandLogo />
          <ThemeToggle />
        </header>
        <main className="flex flex-1 items-center justify-center px-5 pb-12 pt-4 sm:px-8">
          <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} animate-fade-up`}>
            <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-[1.75rem]">{title}</h1>
            {description && <p className="mt-2 text-sm leading-7 text-muted-foreground">{description}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">{footer}</div>}
          </div>
        </main>
      </div>

      <aside
        aria-hidden="true"
        className="relative hidden w-[44%] max-w-2xl shrink-0 flex-col justify-between overflow-hidden bg-foreground p-12 text-background lg:flex"
      >
        <div className="pointer-events-none absolute inset-0 bg-dots opacity-[0.35] [--foreground:var(--background)]" />
        <BrandMark size="lg" className="relative" />
        <div className="relative">
          <p className="max-w-md text-[2rem] font-black leading-[1.45] tracking-tight">{panel.headline}</p>
          <ul className="mt-8 space-y-3">
            {panel.points.map((point) => (
              <li key={point} className="flex items-center gap-3 text-[15px] opacity-80">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-solid text-brand-foreground">
                  <IconCheck size={14} stroke={2.6} />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>
        {panel.quote && panel.reply ? (
          <div className="relative max-w-md space-y-3 rounded-2xl border border-background/10 bg-background/[0.06] p-5">
            <div className="mr-auto w-fit max-w-[85%] rounded-2xl rounded-tr-md bg-background/10 px-4 py-2.5 text-sm">{panel.quote.text}</div>
            <div className="flex items-start gap-2.5">
              <BrandMark size="sm" />
              <p className="pt-1 text-sm leading-7 opacity-85">{panel.reply}</p>
            </div>
          </div>
        ) : (
          <p className="relative text-sm opacity-60">FreelioAI · پنل مدیریت</p>
        )}
      </aside>
    </div>
  );
}
