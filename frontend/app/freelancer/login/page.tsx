"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import { freelancerLogin } from "@/lib/api";

export default function FreelancerLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await freelancerLogin(email, password);
      localStorage.setItem("freelancer_token", data.access_token);
      localStorage.setItem("freelancer_id", data.freelancer_id);
      localStorage.setItem("freelancer_bot_token", data.bot_token);
      if (data.name) localStorage.setItem("freelancer_name", data.name);
      router.push(data.onboarding_completed ? "/freelancer/dashboard" : "/freelancer/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ورود");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[--violet] shadow-lg shadow-[--violet-glow]">
            <IconSparkles size={22} stroke={2} className="text-white" />
          </span>
          <h1 className="text-xl font-black text-white">ورود به FreelioAI</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">پنل مدیریت فریلنسر</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6">
          <div>
            <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">ایمیل</label>
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
            <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="رمز عبور"
              dir="ltr"
              required
              className="admin-input"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[--violet] py-3 text-sm font-bold text-white shadow-md shadow-[--violet-glow] transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? "در حال ورود..." : "ورود"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
          هنوز ثبت‌نام نکردی؟{" "}
          <Link href="/freelancer/register" className="text-violet-400 hover:text-white">
            ثبت‌نام رایگان
          </Link>
        </p>
      </div>
    </div>
  );
}
