"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowRight, IconDeviceMobile, IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import { sendOtp, verifyOtp, submitOrder, Proposal, Message, OrderFile } from "@/lib/api";

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

  function collectMessageAttachments(messages: Message[]) {
    return messages.flatMap((message) => message.attachments || []);
  }

  function readHandoff(): { proposal: Proposal; chatHistory: Message[]; attachments: OrderFile[] } | null {
    if (!handoffParam) return null;
    try {
      const normalized = handoffParam.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const parsed = JSON.parse(decodeURIComponent(escape(atob(padded)))) as {
        proposal?: Proposal;
        chatHistory?: Message[];
        attachments?: OrderFile[];
      };
      if (parsed.proposal?.type !== "proposal" || !Array.isArray(parsed.chatHistory)) return null;
      return {
        proposal: parsed.proposal,
        chatHistory: parsed.chatHistory.filter((message) => message.role === "user" || message.role === "assistant"),
        attachments: [
          ...(Array.isArray(parsed.attachments) ? parsed.attachments : []),
          ...collectMessageAttachments(parsed.chatHistory),
        ],
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
          const order = await submitOrder(token, handoff.proposal, handoff.chatHistory, handoff.attachments);
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
          const parsedDraft = rawDraft ? JSON.parse(rawDraft) : null;
          const draftMessages: Message[] = parsedDraft ? (parsedDraft.messages as Message[] || []) : [];
          const attachments: OrderFile[] = [
            ...(Array.isArray(parsedDraft?.attachments) ? parsedDraft.attachments : []),
            ...collectMessageAttachments(draftMessages),
          ];
          const chatHistory = draftMessages.filter((message) => message.role === "user" || message.role === "assistant").slice(1);
          await submitOrder(token, proposal, chatHistory, attachments);
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--background))] p-4">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.22),transparent)]" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[--surface] p-7 shadow-2xl shadow-black/40">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[--violet-border] bg-[--violet-glow] text-violet-300 shadow-lg shadow-[--violet-glow]">
            {step === "phone" ? <IconDeviceMobile size={24} /> : <IconShieldCheck size={24} />}
          </div>
          <h1 className="text-xl font-black text-[hsl(var(--foreground))]">
            {step === "phone" ? "ورود و ثبت نام" : "تایید شماره موبایل"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
            {step === "phone" ? (
              "لطفاً برای ورود به پنل کاربری خود شماره تلفن همراه خود را وارد کنید و منتظر کد تایید باشید."
            ) : (
              <>کد ۵ رقمی به <span className="font-semibold text-violet-300">{phone}</span> ارسال شد</>
            )}
          </p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">شماره تلفن همراه</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                required
                dir="ltr"
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-center text-sm text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[--violet-border]"
              />
            </div>
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--violet] py-3 text-sm font-bold text-white shadow-lg shadow-[--violet-glow] transition-all hover:bg-violet-700 disabled:opacity-60"
            >
              <IconArrowRight size={18} />
              {loading ? "در حال ارسال..." : "دریافت کد ورود"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">کد تایید</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="• • • • •"
                required
                dir="ltr"
                className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-center text-2xl text-[hsl(var(--foreground))] tracking-[0.5em] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground))] focus:border-[--violet-border]"
              />
            </div>
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 5}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[--violet] py-3 text-sm font-bold text-white shadow-lg shadow-[--violet-glow] transition-all hover:bg-violet-700 disabled:opacity-60"
            >
              <IconShieldCheck size={18} />
              {loading ? "در حال تایید..." : "ورود و مشاهده درخواست"}
            </button>
            <button
              type="button"
              disabled={countdown > 0}
              onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              className="flex w-full items-center justify-center gap-2 py-1 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-white disabled:opacity-40"
            >
              <IconRefresh size={17} />
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
    <Suspense fallback={<div className="min-h-screen bg-[hsl(var(--background))]" />}>
      <LoginContent />
    </Suspense>
  );
}
