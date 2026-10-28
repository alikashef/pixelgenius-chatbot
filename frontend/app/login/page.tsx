"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconRefresh } from "@tabler/icons-react";
import { fetchChatHandoff, sendOtp, verifyOtp, submitOrder, Proposal, Message, OrderFile } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

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

  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
  );

  return (
    <AuthLayout
      title={step === "phone" ? "ورود یا ثبت‌نام" : "کد تایید رو وارد کن"}
      description={
        step === "phone" ? (
          "شماره موبایلت رو وارد کن تا کد ورود برات پیامک بشه. اگه حساب نداری، خودکار ساخته می‌شه."
        ) : (
          <>کد ۵ رقمی به <span dir="ltr" className="font-bold text-foreground">{phone}</span> ارسال شد.</>
        )
      }
    >
      {step === "phone" ? (
        <form onSubmit={handleSend} className="space-y-4">
          <div>
            <label htmlFor="login-phone" className="field-label">شماره موبایل</label>
            <input
              id="login-phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxxx"
              required
              dir="ltr"
              className="field min-h-12 text-left text-base tracking-wider"
            />
          </div>
          {errorBox}
          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? "در حال ارسال..." : "دریافت کد ورود"}
            <IconArrowLeft size={18} aria-hidden="true" />
          </Button>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label htmlFor="login-code" className="field-label">کد تایید</label>
            <input
              id="login-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="• • • • •"
              required
              dir="ltr"
              className="field min-h-14 text-center text-2xl font-bold tracking-[0.6em]"
            />
          </div>
          {errorBox}
          <Button type="submit" disabled={loading || code.length !== 5} className="h-12 w-full">
            {loading ? "در حال تایید..." : "ورود و مشاهده درخواست"}
          </Button>
          <button
            type="button"
            disabled={countdown > 0}
            onClick={() => { setStep("phone"); setCode(""); setError(""); }}
            className="mx-auto flex items-center gap-1.5 rounded text-[13px] font-bold text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground"
          >
            <IconRefresh size={15} aria-hidden="true" />
            {countdown > 0 ? `ارسال مجدد تا ${countdown.toLocaleString("fa-IR")} ثانیه` : "تغییر شماره یا ارسال مجدد کد"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </Suspense>
  );
}
