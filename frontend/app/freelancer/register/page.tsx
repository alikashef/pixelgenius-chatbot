"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { freelancerRegister } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

export default function FreelancerRegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) setInviteCode(invite.toUpperCase());
  }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email || !password || !inviteCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await freelancerRegister(email, password, inviteCode.trim(), name || undefined);
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
    <AuthLayout
      variant="freelancer"
      title="چت‌بات هوشمند خودت رو بساز"
      description="ثبت‌نام فعلاً فقط با کد دعوته. کدت رو وارد کن و در کمتر از سه دقیقه دستیاری داشته باش که با مشتری‌هات نیازسنجی کنه."
      footer={
        <>
          قبلاً ثبت‌نام کردی؟{" "}
          <Link href="/freelancer/login" className="font-bold text-brand underline-offset-4 hover:underline">ورود</Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="fl-invite" className="field-label">کد دعوت</label>
          <input
            id="fl-invite"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            placeholder="FRL-XXXXXXXX"
            dir="ltr"
            required
            autoComplete="off"
            spellCheck={false}
            className="field min-h-12 text-left font-mono tracking-wider"
          />
        </div>
        <div>
          <label htmlFor="fl-name" className="field-label">اسم <span className="font-normal text-muted-foreground">(اختیاری)</span></label>
          <input id="fl-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً علی رضایی" className="field min-h-12" />
        </div>
        <div>
          <label htmlFor="fl-email" className="field-label">ایمیل</label>
          <input id="fl-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" dir="ltr" required className="field min-h-12" />
        </div>
        <div>
          <label htmlFor="fl-password" className="field-label">رمز عبور</label>
          <input id="fl-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="حداقل ۸ کاراکتر" dir="ltr" required minLength={8} className="field min-h-12" />
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading} className="h-12 w-full">
          {loading ? "در حال ثبت‌نام..." : "ثبت‌نام"}
        </Button>
      </form>
    </AuthLayout>
  );
}
