"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowLeft, IconCheck, IconLayoutDashboard, IconX } from "@tabler/icons-react";

const RobotHead = dynamic(() => import("robot-heads").then((module) => module.RobotHead), {
  ssr: false,
  loading: () => <span className="block h-14 w-14" />,
});

const DISMISS_KEY = "freelancer_promo_dismissed_at";
const DISMISS_DAYS = 7;
const PERKS = ["نیازسنجی ۲۴ ساعته‌ی مشتری", "برآورد قیمت با نرخ‌های خودت", "ویجت با برند خودت روی سایتت"];

/** Sidebar banner on the main site that invites freelancers to build their own chatbot. */
export default function FreelancerPromo({ onNavigate }: { onNavigate?: () => void }) {
  const [state, setState] = useState<"hidden" | "promo" | "freelancer">("hidden");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    try {
      if (localStorage.getItem("freelancer_token")) return setState("freelancer");
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
      if (Date.now() - dismissedAt < DISMISS_DAYS * 86_400_000) return;
    } catch {
      // storage blocked: just show the banner
    }
    setState("promo");
  }, []);

  function dismiss() {
    setState("hidden");
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // storage blocked: hidden for this visit only
    }
  }

  if (state === "freelancer") {
    return (
      <div className="px-3 pb-3">
        <Link
          href="/freelancer/dashboard"
          onClick={onNavigate}
          className="flex h-10 items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm font-bold text-foreground outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconLayoutDashboard size={17} className="text-brand" aria-hidden="true" />
          پنل فریلنسر
        </Link>
      </div>
    );
  }

  if (state !== "promo") return null;

  return (
    <div className="px-3 pb-3">
      <section
        aria-labelledby="freelancer-promo-title"
        className="relative overflow-hidden rounded-2xl bg-foreground p-4 text-background animate-fade-up"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-dots opacity-30 [--foreground:var(--background)]" />
        <button
          type="button"
          onClick={dismiss}
          aria-label="بستن پیشنهاد"
          className="absolute left-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg text-background/60 outline-none transition-colors hover:bg-background/10 hover:text-background focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconX size={15} aria-hidden="true" />
        </button>

        <div className="relative flex items-center gap-3">
          <div className="h-14 w-14 shrink-0" aria-hidden="true">
            <RobotHead
              shape="circle"
              state="speaking"
              size={56}
              antenna={false}
              floorShadow={false}
              interactive={false}
              paused={reducedMotion}
              color="#7c3aed"
              trimColor="#1e1b2e"
              screenColor="#f3efff"
            />
          </div>
          <div className="min-w-0 pl-6">
            <p className="text-[11px] font-bold text-accent-solid">ویژه‌ی فریلنسرها</p>
            <h2 id="freelancer-promo-title" className="mt-0.5 text-[15px] font-black leading-6">
              دستیار هوشمند خودت رو بساز
            </h2>
          </div>
        </div>

        <ul className="relative mt-3 space-y-1.5">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-2 text-xs text-background/80">
              <IconCheck size={14} stroke={2.6} className="shrink-0 text-accent-solid" aria-hidden="true" />
              {perk}
            </li>
          ))}
        </ul>

        <Link
          href="/freelancer/register"
          onClick={onNavigate}
          className="relative mt-4 flex h-10 items-center justify-center gap-2 rounded-lg bg-brand-solid text-sm font-bold text-brand-foreground outline-none transition-colors hover:bg-brand-solid/90 focus-visible:ring-2 focus-visible:ring-background focus-visible:ring-offset-2 focus-visible:ring-offset-foreground"
        >
          ثبت‌نام با کد دعوت
          <IconArrowLeft size={16} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
