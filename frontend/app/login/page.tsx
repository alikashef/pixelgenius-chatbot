"use client";

import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconBriefcase, IconChevronLeft, IconRefresh, IconUser } from "@tabler/icons-react";
import {
  fetchChatHandoff, linkFreelancerPhone, panelHref, passwordLogin, saveSession, sendOtp, verifyOtp, submitOrder,
  PANELS, Message, OrderFile, Proposal, Role, Session,
} from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const rawPhoneParam = params.get("phone") || "";
  const phoneParam = /^09[0-9]{9}$/.test(rawPhoneParam) ? rawPhoneParam : "";
  const redirectParam = params.get("redirect") || "";
  // Only same-site paths, so a crafted link cannot bounce a fresh session to another site.
  const redirect = redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : "";
  const handoffParam = params.get("handoff") || "";
  const handoffIdParam = params.get("handoff_id") || "";

  const [phone, setPhone] = useState(phoneParam);
  const [code, setCode] = useState("");
  // if phone came from chat, skip directly to OTP step
  const [step, setStep] = useState<"phone" | "otp" | "password" | "link" | "choose">(phoneParam ? "otp" : "phone");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [linkSent, setLinkSent] = useState(false);
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

  /** Opens the right panel: the requested page, the only panel, or a choice between several. */
  function finish(next: Session) {
    setSession(next);
    if (redirect) return router.push(redirect);
    if (next.needs_phone) {
      setPhone("");
      setCode("");
      setLinkSent(false);
      return setStep("link");
    }
    // The admin panel is private: it is never offered here, only opened when it is the sole role.
    const visible = next.roles.filter((role) => role !== "admin");
    if (visible.length > 1) return setStep("choose");
    router.push(visible[0] ? panelHref(visible[0], next) : next.admin_token ? PANELS.admin.href : "/account");
  }

  async function handlePassword(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const next = await passwordLogin(identifier.trim(), password);
      saveSession(next);
      finish(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ورود");
    } finally {
      setLoading(false);
    }
  }

  async function handleLink(e: FormEvent) {
    e.preventDefault();
    if (!session?.freelancer) return;
    setLoading(true);
    setError("");
    try {
      if (!linkSent) {
        await sendOtp(phone.trim());
        setLinkSent(true);
        startCountdown();
      } else {
        const next = await linkFreelancerPhone(session.freelancer.access_token, phone.trim(), code.trim());
        saveSession(next);
        finish(next);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "اتصال شماره انجام نشد");
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
      saveSession(data);

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

      if (designerOrderId) router.push(`/chat?brief=${designerOrderId}`);
      else finish(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "کد اشتباه است");
    } finally {
      setLoading(false);
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
  );

  const resend = (onReset: () => void) => (
    <button
      type="button"
      disabled={countdown > 0}
      onClick={() => { onReset(); setCode(""); setError(""); }}
      className="mx-auto flex items-center gap-1.5 rounded text-[13px] font-bold text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:text-muted-foreground"
    >
      <IconRefresh size={15} aria-hidden="true" />
      {countdown > 0 ? `ارسال مجدد تا ${countdown.toLocaleString("fa-IR")} ثانیه` : "تغییر شماره یا ارسال مجدد کد"}
    </button>
  );

  const phoneField = (id: string) => (
    <div>
      <label htmlFor={id} className="field-label">شماره موبایل</label>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        lang="en"
        pattern="09[0-9]{9}"
        maxLength={11}
        autoComplete="tel"
        value={phone}
        onChange={(e) => {
          const value = e.target.value;
          if (/[^0-9]/.test(value)) {
            setError("شماره موبایل را فقط با اعداد انگلیسی وارد کن؛ زبان کیبورد را به انگلیسی تغییر بده.");
            return;
          }
          setPhone(value);
          setError("");
        }}
        aria-describedby={`${id}-hint`}
        placeholder="09xxxxxxxxx"
        required
        dir="ltr"
        className="field min-h-12 text-left text-base tracking-wider"
      />
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">شماره را با اعداد انگلیسی وارد کن؛ مثل 09123456789.</p>
    </div>
  );

  const codeField = (id: string) => (
    <div>
      <label htmlFor={id} className="field-label">کد تایید</label>
      <input
        id={id}
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
  );

  const ROLE_ICONS: Partial<Record<Role, typeof IconUser>> = { customer: IconUser, freelancer: IconBriefcase };
  const ROLE_HINTS: Partial<Record<Role, string>> = {
    customer: "درخواست‌ها، پروژه‌ها و پرداخت‌هات",
    freelancer: "دستیار، ویجت و درخواست‌های مشتری‌هات",
  };

  const copy = {
    phone: { title: "ورود یا ثبت‌نام", description: "شماره موبایلت رو وارد کن تا کد ورود برات پیامک بشه. مشتری یا فریلنسر، همه از همین‌جا وارد می‌شن." },
    otp: { title: "کد تایید رو وارد کن", description: <>کد ۵ رقمی به <span dir="ltr" className="font-bold text-foreground">{phone}</span> ارسال شد.</> },
    password: { title: "ورود با ایمیل و رمز", description: "برای حساب‌هایی که قبلاً با ایمیل ساخته شدن." },
    link: { title: "شماره موبایلت رو وصل کن", description: "از این به بعد مثل بقیه با کد پیامکی وارد می‌شی و پنل‌هات کنار هم میان." },
    choose: { title: "کدوم پنل؟", description: "حسابت هم پنل مشتری داره هم پنل فریلنسر. هر وقت خواستی از منوی کناری بینشون جابه‌جا شو." },
  }[step];

  return (
    <AuthLayout title={copy.title} description={copy.description}>
      {step === "phone" && (
        <form onSubmit={handleSend} className="space-y-4">
          {phoneField("login-phone")}
          {errorBox}
          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? "در حال ارسال..." : "دریافت کد ورود"}
            <IconArrowLeft size={18} aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={() => { setStep("password"); setError(""); }}
            className="mx-auto block rounded text-[13px] font-bold text-secondary-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            ورود با ایمیل و رمز عبور
          </button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleVerify} className="space-y-4">
          {codeField("login-code")}
          {errorBox}
          <Button type="submit" disabled={loading || code.length !== 5} className="h-12 w-full">
            {loading ? "در حال تایید..." : "ورود"}
          </Button>
          {resend(() => setStep("phone"))}
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePassword} className="space-y-4">
          <div>
            <label htmlFor="login-identifier" className="field-label">ایمیل</label>
            <input id="login-identifier" autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required dir="ltr" className="field min-h-12 text-left" />
          </div>
          <div>
            <label htmlFor="login-password" className="field-label">رمز عبور</label>
            <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" className="field min-h-12 text-left" />
          </div>
          {errorBox}
          <Button type="submit" disabled={loading} className="h-12 w-full">
            {loading ? "در حال ورود..." : "ورود"}
          </Button>
          <button
            type="button"
            onClick={() => { setStep("phone"); setError(""); }}
            className="mx-auto block rounded text-[13px] font-bold text-secondary-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            ورود با شماره موبایل
          </button>
        </form>
      )}

      {step === "link" && session && (
        <form onSubmit={handleLink} className="space-y-4">
          {linkSent ? codeField("link-code") : phoneField("link-phone")}
          {errorBox}
          <Button type="submit" disabled={loading || (linkSent && code.length !== 5)} className="h-12 w-full">
            {loading ? "صبر کن..." : linkSent ? "تایید و اتصال" : "ارسال کد"}
          </Button>
          {linkSent ? resend(() => setLinkSent(false)) : (
            <button
              type="button"
              onClick={() => finish({ ...session, needs_phone: false })}
              className="mx-auto block rounded text-[13px] font-bold text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              فعلاً بعداً
            </button>
          )}
        </form>
      )}

      {step === "choose" && session && (
        <ul className="space-y-2.5">
          {session.roles.filter((role) => role !== "admin").map((role) => {
            const Icon = ROLE_ICONS[role] || IconUser;
            return (
              <li key={role}>
                <button
                  type="button"
                  onClick={() => router.push(panelHref(role, session))}
                  className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-4 text-right outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground"><Icon size={20} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-foreground">{PANELS[role].label}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{ROLE_HINTS[role]}</span>
                  </span>
                  <IconChevronLeft size={18} className="text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
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
