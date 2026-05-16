"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendOtp, verifyOtp, submitOrder, Proposal } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const phoneParam = params.get("phone") || "";
  const redirect = params.get("redirect") || "/panel";

  const [phone, setPhone] = useState(phoneParam);
  const [code, setCode] = useState("");
  // if phone came from chat, skip directly to OTP step
  const [step, setStep] = useState<"phone" | "otp">(phoneParam ? "otp" : "phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(phoneParam ? 120 : 0);

  useEffect(() => {
    if (!phoneParam) return;
    // countdown already started (OTP was sent from chat)
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phoneParam]);

  function startCountdown() {
    setCountdown(120);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await sendOtp(phone.trim());
      setStep("otp");
      startCountdown();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ارسال کد");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await verifyOtp(phone.trim(), code.trim());
      const token = data.access_token;
      localStorage.setItem("customer_token", token);
      localStorage.setItem("customer_id", data.customer_id);

      // auto-submit proposal if exists
      const storedProposal = localStorage.getItem("proposal");
      if (storedProposal) {
        try {
          const proposal: Proposal = JSON.parse(storedProposal);
          await submitOrder(token, proposal);
          localStorage.removeItem("proposal");
        } catch {
          // proposal submit failed — still continue to panel
        }
      }

      router.push(redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "کد اشتباه است");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 bg-accent/10 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-100">
            {step === "phone" ? "ورود با شماره موبایل" : "کد تایید را وارد کنید"}
          </h1>
          {step === "otp" && (
            <p className="text-muted text-sm mt-1">
              کد ۵ رقمی به <span className="text-gray-300 font-medium">{phone}</span> ارسال شد
            </p>
          )}
        </div>

        {step === "phone" ? (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-muted text-xs mb-2">شماره موبایل</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                required
                dir="ltr"
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-muted outline-none focus:border-accent transition-colors text-center"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-black font-bold rounded-xl py-3 text-sm transition-colors"
            >
              {loading ? "در حال ارسال..." : "ارسال کد تایید"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-muted text-xs mb-2">کد تایید</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="• • • • •"
                required
                dir="ltr"
                className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-2xl text-gray-100 placeholder-muted outline-none focus:border-accent transition-colors text-center tracking-[0.5em]"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 5}
              className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-black font-bold rounded-xl py-3 text-sm transition-colors"
            >
              {loading ? "در حال تایید..." : "ورود و مشاهده درخواست"}
            </button>
            <button
              type="button"
              disabled={countdown > 0}
              onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              className="w-full text-muted hover:text-gray-200 disabled:opacity-40 text-sm transition-colors py-1"
            >
              {countdown > 0 ? `ارسال مجدد تا ${countdown} ثانیه` : "ارسال مجدد کد"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <LoginContent />
    </Suspense>
  );
}
