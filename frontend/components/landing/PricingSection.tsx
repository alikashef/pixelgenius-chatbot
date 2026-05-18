import { IconCheck } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import Link from "next/link";

const PLANS = [
  {
    name: "رایگان",
    price: "۰",
    period: "تومان/ماه",
    description: "برای شروع و آزمایش",
    highlight: false,
    features: [
      "تا ۳ پروژه فعال",
      "ویجت با برند FreelioAI",
      "چت AI پایه",
      "پرداخت آنلاین",
    ],
    cta: "شروع رایگان",
    href: "/register",
  },
  {
    name: "حرفه‌ای",
    price: "۱۹۹,۰۰۰",
    period: "تومان/ماه",
    description: "برای فریلنسرهای فعال",
    highlight: true,
    badge: "محبوب‌ترین",
    features: [
      "پروژه نامحدود",
      "ویجت با برند خودت (White-label)",
      "AI پیشرفته + تسک خودکار",
      "مدیریت Milestone کامل",
      "چت پروژه زنده",
      "پشتیبانی اولویت‌دار",
    ],
    cta: "۷ روز رایگان امتحان کن",
    href: "/register?plan=pro",
  },
  {
    name: "تیم",
    price: "۴۹۹,۰۰۰",
    period: "تومان/ماه",
    description: "برای آژانس‌ها و تیم‌ها",
    highlight: false,
    features: [
      "همه امکانات حرفه‌ای",
      "تا ۵ کاربر",
      "داشبورد تیمی",
      "گزارش‌های پیشرفته",
      "API دسترسی",
      "پشتیبانی اختصاصی",
    ],
    cta: "تماس بگیر",
    href: "/contact",
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-4 py-24">
      <div className="mb-14 text-center">
        <p className="mb-3 text-sm font-semibold text-violet-400">قیمت‌گذاری</p>
        <h2 className="text-3xl font-black text-white md:text-4xl">
          ساده، شفاف، بدون هزینه پنهان
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[hsl(var(--muted-foreground))]">
          با پلن رایگان شروع کن. هر وقت آماده بودی ارتقا بده.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.name}
            className={`relative flex flex-col p-7 transition-all duration-200 ${
              plan.highlight
                ? "border-[--violet-border] bg-[--violet-glow] shadow-2xl shadow-[--violet-glow]"
                : "hover:border-[--violet-border]"
            }`}
          >
            {plan.badge && (
              <div className="absolute -top-3 right-6">
                <Badge>{plan.badge}</Badge>
              </div>
            )}

            <div className="mb-6">
              <p className="text-sm font-bold text-[hsl(var(--muted-foreground))]">{plan.name}</p>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-4xl font-black text-white">{plan.price}</span>
                <span className="text-sm text-[hsl(var(--muted-foreground))]">{plan.period}</span>
              </div>
              <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{plan.description}</p>
            </div>

            <ul className="mb-8 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5 text-sm">
                  <IconCheck
                    size={16}
                    className="mt-0.5 shrink-0 text-violet-400"
                    stroke={2.5}
                  />
                  <span className="text-[hsl(var(--muted-foreground))]">{feature}</span>
                </li>
              ))}
            </ul>

            <Button
              variant={plan.highlight ? "default" : "secondary"}
              className="w-full"
              asChild
            >
              <Link href={plan.href}>{plan.cta}</Link>
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
