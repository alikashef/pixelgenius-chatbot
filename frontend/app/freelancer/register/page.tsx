"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import { freelancerRegister } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

export default function FreelancerRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      const data = await freelancerRegister(email, password, name || undefined);
      localStorage.setItem("freelancer_token", data.access_token);
      localStorage.setItem("freelancer_id", data.freelancer_id);
      localStorage.setItem("freelancer_bot_token", data.bot_token);
      if (data.name) localStorage.setItem("freelancer_name", data.name);
      router.push(data.onboarding_completed ? "/freelancer/dashboard" : "/freelancer/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ثبت‌نام");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background bg-aura px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <ThemeToggle className="absolute left-4 top-4 z-10" />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <IconSparkles size={22} stroke={2} aria-hidden="true" />
          </span>
          <h1 className="text-xl font-black text-foreground">ثبت‌نام در FreelioAI</h1>
          <p className="text-sm text-muted-foreground">چت‌بات هوشمند خودت رو بساز</p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-elevated sm:p-7">
          <div>
            <label className="field-label">اسم (اختیاری)</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً علی رضایی"
              className="admin-input"
            />
          </div>
          <div>
            <label className="field-label">ایمیل</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              dir="ltr"
              required
              className="admin-input"
            />
          </div>
          <div>
            <label className="field-label">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="حداقل ۸ کاراکتر"
              dir="ltr"
              required
              minLength={8}
              className="admin-input"
            />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-50"
          >
            {loading ? "در حال ثبت‌نام..." : "ثبت‌نام رایگان"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          قبلاً ثبت‌نام کردی؟{" "}
          <Link href="/freelancer/login" className="text-brand hover:text-foreground">
            ورود
          </Link>
        </p>
      </div>
    </div>
  );
}
