import Link from "next/link";
import { IconArrowLeft, IconSparkles } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

export default function CTASection() {
  return (
    <section className="border-t border-border bg-surface/30">
      <div className="mx-auto max-w-7xl px-4 py-24">
        <div className="relative overflow-hidden rounded-3xl border border-brand-line bg-surface p-10 text-center md:p-16">
          {/* background glow */}
          <div className="pointer-events-none absolute inset-0" />

          <div className="relative">
            <span className="mb-6 inline-grid h-16 w-16 place-items-center rounded-3xl bg-primary">
              <IconSparkles size={30} className="text-foreground" stroke={1.8} />
            </span>

            <h2 className="text-3xl font-black text-foreground md:text-4xl lg:text-5xl">
              همین الان شروع کن
              <br />
              <span className="text-brand">رایگانه</span>
            </h2>

            <p className="mx-auto mt-5 max-w-lg text-muted-foreground">
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
