import Link from "next/link";
import { IconArrowLeft, IconSparkles } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

export default function CTASection() {
  return (
    <section className="border-t border-[hsl(var(--border))] bg-[--surface]/30">
      <div className="mx-auto max-w-7xl px-4 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-[--violet-border] bg-[--surface] p-10 text-center md:p-16">
          {/* background glow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_100%,rgba(124,58,237,0.15),transparent)]" />

          <div className="relative">
            <span className="mb-6 inline-grid h-16 w-16 place-items-center rounded-3xl bg-[--violet] shadow-2xl shadow-[--violet-glow]">
              <IconSparkles size={30} className="text-white" stroke={1.8} />
            </span>

            <h2 className="text-3xl font-black text-white md:text-4xl lg:text-5xl">
              همین الان شروع کن
              <br />
              <span className="text-gradient">رایگانه</span>
            </h2>

            <p className="mx-auto mt-5 max-w-lg text-[hsl(var(--muted-foreground))]">
              کمتر از ۳ دقیقه طول می‌کشه تا ویجت رو روی سایتت راه بندازی.
              کارت بانکی لازم نیست.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" asChild>
                <Link href="/register">
                  شروع رایگان
                  <IconArrowLeft size={18} />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/contact">
                  صحبت با تیم
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
