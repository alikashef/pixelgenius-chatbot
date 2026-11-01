"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft } from "@tabler/icons-react";
import { clearSession, freelancerRegister, panelHref, saveSession } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { CREDIT_GROUPS, TOMAN_PER_CREDIT, formatToman } from "@/lib/plans";

/** Turns the signed-in account into a freelancer account ; sign-in itself happens on /login. */
const assistantPrices = CREDIT_GROUPS.find((g) => g.id === "assistant")?.lines ?? [];

export default function FreelancerRegisterPage() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "signed-out" | "freelancer" | "form">("loading");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(localStorage.getItem("customer_first_name") || "");
    if (localStorage.getItem("freelancer_token")) setState("freelancer");
    else setState(localStorage.getItem("customer_token") ? "form" : "signed-out");
  }, []);

  const loginHref = `/login?redirect=${encodeURIComponent("/freelancer/register")}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const session = await freelancerRegister(localStorage.getItem("customer_token") || "", name.trim() || undefined);
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
      description="با همون حسابی که با شماره موبایل وارد می‌شی، پنل فریلنسر هم برات باز می‌شه. هزینه‌ی دستیار از کیف پول کردیتت کم می‌شه و فقط بر اساس مصرف مشتری‌هات حساب می‌شه."
    >

      <div className="mb-5 rounded-xl border border-border bg-surface-2 p-4">
        <p className="text-sm font-bold text-foreground">قیمت دستیار</p>
        <ul className="mt-2 space-y-1.5">
          {assistantPrices.map((line) => (
            <li key={line.label} className="flex items-baseline justify-between gap-3 text-[13px] text-secondary-foreground">
              <span>{line.label}</span>
              <span className="shrink-0 font-black text-foreground">{typeof line.credits === "number" ? `${formatToman(line.credits)} کردیت` : /[۰-۹]/.test(line.credits) ? `${line.credits} کردیت` : line.credits}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">
          هر ۱ کردیت = {formatToman(TOMAN_PER_CREDIT)} تومان و از کیف پولت کم می‌شه. اشتراک ماهانه نداره.{" "}
          <Link href="/pricing" className="font-bold text-brand underline-offset-4 hover:underline">همه‌ی قیمت‌ها</Link>
        </p>
      </div>

      {state === "signed-out" && (
        <div className="space-y-4">
          <p className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm leading-7 text-secondary-foreground">
            اول با شماره موبایلت وارد شو؛ بعد پنل فریلنسر کنار حسابت فعال می‌شه.
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
