"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { freelancerLogin } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

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
    <AuthLayout
      variant="freelancer"
      title="ورود به حساب فریلنسر"
      description="به پنل مدیریت چت‌بات و درخواست‌های مشتری‌هات وارد شو."
      footer={
        <>
          هنوز ثبت‌نام نکردی؟{" "}
          <Link href="/freelancer/register" className="font-bold text-brand underline-offset-4 hover:underline">ثبت‌نام با کد دعوت</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fl-email" className="field-label">ایمیل</label>
          <input id="fl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" required className="field min-h-12" />
        </div>
        <div>
          <label htmlFor="fl-password" className="field-label">رمز عبور</label>
          <input id="fl-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" required className="field min-h-12" />
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading} className="h-12 w-full">
          {loading ? "در حال ورود..." : "ورود"}
        </Button>
      </form>
    </AuthLayout>
  );
}
