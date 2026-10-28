"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { clearSession, freelancerRegister, panelHref, saveSession } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

/** Turns the signed-in account into a freelancer account with an invite code; sign-in itself happens on /login. */
export default function FreelancerRegisterPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "signed-out" | "freelancer" | "form">("loading");
  const [name, setName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) setInviteCode(invite.toUpperCase());
    setName(localStorage.getItem("customer_first_name") || "");
    if (localStorage.getItem("freelancer_token")) setState("freelancer");
    else setState(localStorage.getItem("customer_token") ? "form" : "signed-out");
  }, []);

  const loginHref = `/login?redirect=${encodeURIComponent(`/freelancer/register${inviteCode ? `?invite=${inviteCode}` : ""}`)}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError("");
    try {
      const session = await freelancerRegister(localStorage.getItem("customer_token") || "", inviteCode.trim(), name.trim() || undefined);
      saveSession(session);
      router.push(panelHref("freelancer", session));
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        clearSession();
        setState("signed-out");
      } else {
        setError(err instanceof Error ? err.message : "خطا در ثبت‌نام");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      variant="freelancer"
      title="چت‌بات هوشمند خودت رو بساز"
      description="ثبت‌نام فعلاً فقط با کد دعوته. با همون حسابی که با شماره موبایل وارد می‌شی، پنل فریلنسر هم برات باز می‌شه."
    >
      {state === "signed-out" && (
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm leading-7 text-secondary-foreground">
            اول با شماره موبایلت وارد شو؛ بعد کد دعوت رو وارد می‌کنی و پنل فریلنسر کنار حسابت فعال می‌شه.
          </p>
          <Button asChild className="h-12 w-full">
            <Link href={loginHref}>
              ورود با شماره موبایل
              <IconArrowLeft size={18} aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}

      {state === "freelancer" && (
        <div className="space-y-4">
          <p className="text-sm leading-7 text-secondary-foreground">حسابت همین الان پنل فریلنسر داره.</p>
          <Button asChild className="h-12 w-full">
            <Link href="/freelancer/dashboard">رفتن به پنل فریلنسر</Link>
          </Button>
        </div>
      )}

      {state === "form" && (
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
            <label htmlFor="fl-name" className="field-label">اسمی که دستیار با اون معرفیت می‌کنه</label>
            <input id="fl-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً علی رضایی" className="field min-h-12" />
          </div>
          {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? "در حال فعال‌سازی..." : "فعال‌سازی پنل فریلنسر"}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
