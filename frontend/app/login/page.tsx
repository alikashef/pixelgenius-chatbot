"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sendOtp, verifyOtp, submitOrder, Proposal, Message } from "@/lib/api";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const phoneParam = params.get("phone") || "";
  const redirect = params.get("redirect") || "/panel";
  const handoffParam = params.get("handoff") || "";

  const [phone, setPhone] = useState(phoneParam);
  const [code, setCode] = useState("");
  // if phone came from chat, skip directly to OTP step
  const [step, setStep] = useState<"phone" | "otp">(phoneParam ? "otp" : "phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(phoneParam ? 120 : 0);

  function readHandoff(): { proposal: Proposal; chatHistory: Message[] } | null {
    if (!handoffParam) return null;
    try {
      const normalized = handoffParam.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const parsed = JSON.parse(decodeURIComponent(escape(atob(padded)))) as {
        proposal?: Proposal;
        chatHistory?: Message[];
      };
      if (parsed.proposal?.type !== "proposal" || !Array.isArray(parsed.chatHistory)) return null;
      return {
        proposal: parsed.proposal,
        chatHistory: parsed.chatHistory.filter((message) => message.role === "user" || message.role === "assistant"),
      };
    } catch {
      return null;
    }
  }

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
      if (data.first_name) {
        localStorage.setItem("customer_first_name", data.first_name);
      } else {
        localStorage.removeItem("customer_first_name");
      }

      const anonymousChat = localStorage.getItem("chat_draft_anonymous");
      if (anonymousChat) {
        localStorage.setItem(`chat_draft_customer_${data.customer_id}`, anonymousChat);
        localStorage.removeItem("chat_draft_anonymous");
      }

      // auto-submit proposal if exists
      const handoff = readHandoff();
      const storedProposal = localStorage.getItem("proposal");
      if (handoff) {
        try {
          const order = await submitOrder(token, handoff.proposal, handoff.chatHistory);
          localStorage.removeItem("proposal");
          localStorage.removeItem(`chat_draft_customer_${data.customer_id}`);
          localStorage.removeItem("chat_draft_anonymous");
          router.push(`/panel/${order.id}`);
          return;
        } catch {
          // handoff submit failed — fall back to normal redirect
        }
      }

      if (storedProposal) {
        try {
          const proposal: Proposal = JSON.parse(storedProposal);
          const customerDraft = localStorage.getItem(`chat_draft_customer_${data.customer_id}`);
          const anonymousDraft = localStorage.getItem("chat_draft_anonymous");
          const rawDraft = customerDraft || anonymousDraft;
          const draftMessages: Message[] = rawDraft ? (JSON.parse(rawDraft).messages as Message[] || []) : [];
          const chatHistory = draftMessages.filter((message) => message.role === "user" || message.role === "assistant").slice(1);
          await submitOrder(token, proposal, chatHistory);
          localStorage.removeItem("proposal");
          localStorage.removeItem(`chat_draft_customer_${data.customer_id}`);
          localStorage.removeItem("chat_draft_anonymous");
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
    <div className="min-h-screen bg-[#f7fbf9] flex items-center justify-center p-4">
      <div className="bg-white border border-border rounded-2xl p-8 w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-slate-900">
            {step === "phone" ? "ورود مشتری" : "کد تایید را وارد کنید"}
          </h1>
          {step === "otp" && (
            <p className="text-slate-500 text-sm mt-1">
              کد ۵ رقمی به <span className="text-slate-700 font-medium">{phone}</span> ارسال شد
            </p>
          )}
        </div>

        {step === "phone" ? (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="block text-slate-500 text-xs mb-2">شماره موبایل</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                required
                dir="ltr"
                className="w-full bg-[#f7fbf9] border border-border rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-muted outline-none focus:border-emerald-600 transition-colors text-center"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors"
            >
              {loading ? "در حال ارسال..." : "ارسال کد تایید"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-slate-500 text-xs mb-2">کد تایید</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="• • • • •"
                required
                dir="ltr"
                className="w-full bg-[#f7fbf9] border border-border rounded-xl px-4 py-3 text-2xl text-slate-900 placeholder-muted outline-none focus:border-emerald-600 transition-colors text-center tracking-[0.5em]"
              />
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 5}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors"
            >
              {loading ? "در حال تایید..." : "ورود و مشاهده درخواست"}
            </button>
            <button
              type="button"
              disabled={countdown > 0}
              onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              className="w-full text-slate-500 hover:text-slate-800 disabled:opacity-40 text-sm transition-colors py-1"
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
    <Suspense fallback={<div className="min-h-screen bg-[#f7fbf9]" />}>
      <LoginContent />
    </Suspense>
  );
}
