import Link from "next/link";
import { IconArrowLeft, IconPlayerPlay } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import ChatMockup from "./ChatMockup";

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-[hsl(var(--border))] bg-grid">
      {/* radial glow top center */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_40%_at_50%_-10%,rgba(124,58,237,0.18),transparent)]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-73px)] max-w-7xl items-center gap-14 px-4 py-16 lg:grid-cols-[1fr_1fr]">
        {/* text side */}
        <div className="flex flex-col items-start">
          <Badge className="mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            هوش مصنوعی فارسی · ویژه فریلنسرها
          </Badge>

          <h1 className="text-4xl font-black leading-tight tracking-tight text-white md:text-5xl xl:text-6xl">
            دستیار هوشمند
            <br />
            <span className="text-gradient">فریلنسرهای</span>
            <br />
            حرفه‌ای
          </h1>

          <p className="mt-6 max-w-lg text-base leading-8 text-[hsl(var(--muted-foreground))]">
            ویجت AI رو روی سایتت بذار. مشتریت نیازمندی‌هاش رو شفاف می‌کنه،
            تو پروپوزال می‌دی، milestone تعریف می‌کنی و پرداخت می‌گیری —
            همه روی برند خودت.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link href="/register">
                شروع رایگان
                <IconArrowLeft size={18} />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href="#demo">
                <IconPlayerPlay size={16} />
                دمو ببین
              </Link>
            </Button>
          </div>

          {/* trust stats */}
          <div className="mt-12 grid grid-cols-3 gap-4">
            {[
              { value: "۳ دقیقه", label: "زمان راه‌اندازی" },
              { value: "۰٪", label: "کمیسیون اول ماه" },
              { value: "فارسی", label: "AI بومی" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-4">
                <p className="text-lg font-black text-white">{stat.value}</p>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* mockup side */}
        <div className="hidden lg:block">
          <ChatMockup />
        </div>
      </div>
    </section>
  );
}
