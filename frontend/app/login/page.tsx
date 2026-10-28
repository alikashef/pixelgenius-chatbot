"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowRight, IconDeviceMobile, IconRefresh, IconShieldCheck } from "@tabler/icons-react";
import { fetchChatHandoff, sendOtp, verifyOtp, submitOrder, Proposal, Message, OrderFile } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const phoneParam = params.get("phone") || "";
  const redirect = params.get("redirect") || "/panel";
  const handoffParam = params.get("handoff") || "";
  const handoffIdParam = params.get("handoff_id") || "";

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

  function readEncodedHandoff(): { proposal: Proposal; chatHistory: Message[]; attachments: OrderFile[] } | null {
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

  async function readHandoff(): Promise<{ proposal: Proposal; chatHistory: Message[]; attachments: OrderFile[] } | null> {
    if (handoffIdParam) {
      const parsed = await fetchChatHandoff(handoffIdParam);
      if (parsed.proposal?.type !== "proposal" || !Array.isArray(parsed.chatHistory)) return null;
      return {
        proposal: parsed.proposal,
        chatHistory: parsed.chatHistory.filter((message) => message.role === "user" || message.role === "assistant"),
        attachments: [
          ...(Array.isArray(parsed.attachments) ? parsed.attachments : []),
          ...collectMessageAttachments(parsed.chatHistory),
        ],
      };
    }
    return readEncodedHandoff();
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
      const handoff = await readHandoff();
      const storedProposal = localStorage.getItem("proposal");
      let designerOrderId = "";
      if (handoff) {
        try {
          const order = await submitOrder(token, handoff.proposal, handoff.chatHistory, handoff.attachments);
          localStorage.removeItem("proposal");
          localStorage.removeItem(`chat_draft_customer_${data.customer_id}`);
          localStorage.removeItem("chat_draft_anonymous");
          router.push(order.mode === "designer" ? `/chat?brief=${order.id}` : `/panel/${order.id}`);
          return;
        } catch (submitError) {
          setError(submitError instanceof Error ? submitError.message : "ورود انجام شد اما ثبت درخواست ناموفق بود. لطفاً دوباره تلاش کنید.");
          return;
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
          const created = await submitOrder(token, proposal, chatHistory, attachments);
          if (created.mode === "designer") designerOrderId = created.id;
          localStorage.removeItem("proposal");
          localStorage.removeItem(`chat_draft_customer_${data.customer_id}`);
          localStorage.removeItem("chat_draft_anonymous");
        } catch {
          // proposal submit failed — still continue to panel
        }
      }

      router.push(designerOrderId ? `/chat?brief=${designerOrderId}` : redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "کد اشتباه است");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background bg-aura px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <ThemeToggle className="absolute left-4 top-4 z-10" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-surface p-7 shadow-elevated">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-primary-line bg-primary-soft text-brand shadow-md shadow-primary/25">
            {step === "phone" ? <IconDeviceMobile size={24} /> : <IconShieldCheck size={24} />}
          </div>
          <h1 className="text-xl font-black text-foreground">
            {step === "phone" ? "ورود و ثبت نام" : "تایید شماره موبایل"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {step === "phone" ? (
              "لطفاً برای ورود به پنل کاربری خود شماره تلفن همراه خود را وارد کنید و منتظر کد تایید باشید."
            ) : (
              <>کد ۵ رقمی به <span className="font-semibold text-brand">{phone}</span> ارسال شد</>
            )}
          </p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handleSend} className="space-y-4">
            <div>
              <label className="field-label">شماره تلفن همراه</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09xxxxxxxxx"
                required
                dir="ltr"
                className="field px-4 py-3 text-center"
              />
            </div>
            {error && <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary-hover disabled:opacity-60"
            >
              <IconArrowRight size={18} />
              {loading ? "در حال ارسال..." : "دریافت کد ورود"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="field-label">کد تایید</label>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="• • • • •"
                required
                dir="ltr"
                className="field px-4 py-3 text-center text-2xl tracking-[0.5em]"
              />
            </div>
            {error && <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={loading || code.length !== 5}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary-hover disabled:opacity-60"
            >
              <IconShieldCheck size={18} />
              {loading ? "در حال تایید..." : "ورود و مشاهده درخواست"}
            </button>
            <button
              type="button"
              disabled={countdown > 0}
              onClick={() => { setStep("phone"); setCode(""); setError(""); }}
              className="flex w-full items-center justify-center gap-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
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
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </Suspense>
  );
}
