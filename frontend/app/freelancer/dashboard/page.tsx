"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconSparkles, IconSettings, IconLayoutDashboard, IconLogout } from "@tabler/icons-react";

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("freelancer_token");
    if (!token) { router.replace("/freelancer/login"); return; }
    setName(localStorage.getItem("freelancer_name") || "");
  }, [router]);

  function handleLogout() {
    localStorage.removeItem("freelancer_token");
    localStorage.removeItem("freelancer_id");
    localStorage.removeItem("freelancer_name");
    router.push("/freelancer/login");
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-6 py-4 backdrop-blur">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[--violet]">
          <IconSparkles size={16} stroke={2} className="text-white" />
        </span>
        <span className="font-bold text-white">FreelioAI</span>
        <div className="mr-auto flex items-center gap-3">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{name}</span>
          <button onClick={handleLogout} className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-white">
            <IconLogout size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-black text-white">سلام{name ? `، ${name}` : ""} 👋</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">پنل مدیریت FreelioAI تو</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/admin/dashboard" className="group flex items-start gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6 transition-all hover:-translate-y-0.5 hover:border-[--violet-border]">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[--violet-glow] text-violet-300">
              <IconLayoutDashboard size={20} />
            </span>
            <div>
              <p className="font-bold text-white">پنل درخواست‌ها</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">بررسی و تایید درخواست‌های مشتریان</p>
            </div>
          </Link>

          <Link href="/admin/settings" className="group flex items-start gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6 transition-all hover:-translate-y-0.5 hover:border-[--violet-border]">
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-[--violet-glow] text-violet-300">
              <IconSettings size={20} />
            </span>
            <div>
              <p className="font-bold text-white">تنظیمات AI</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">سفارشی‌سازی رفتار و دانش دستیار هوشمند</p>
            </div>
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-[--violet-border] bg-[--violet-glow] p-6">
          <p className="mb-1 font-semibold text-violet-200">قابلیت‌های جدید در راهند...</p>
          <p className="text-sm text-violet-300/70">
            Project Space، پرداخت مرحله‌ای، و چت مستقیم با مشتری به زودی اضافه می‌شن.
          </p>
        </div>
      </main>
    </div>
  );
}
