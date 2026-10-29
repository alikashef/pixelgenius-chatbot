"use client";

import { useState, useEffect, useRef, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowLeft, IconBrandGithub, IconPencil, IconRefresh } from "@tabler/icons-react";
import {
  exchangeSocialCode, fetchChatHandoff, fetchSocialProviders, linkFreelancerPhone, passwordLogin, saveSession, sendOtp, verifyOtp, submitOrder,
  socialStartUrl, Message, OrderFile, Proposal, Session, SocialProvider,
} from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

const CODE_LENGTH = 5;
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function onlyDigits(text: string) {
  return text
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/\D/g, "");
}

/** One box per digit of the SMS code; typing, pasting and SMS autofill all spread across the boxes. */
function CodeBoxes({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // Quick typing can fire several events before React re-renders, so edits build on the latest value, not the rendered one.
  const latest = useRef(value);
  latest.current = value;

  function commit(next: string) {
    latest.current = next;
    onChange(next);
  }

  function fill(index: number, digits: string) {
    if (!digits) return;
    const next = (latest.current.slice(0, index) + digits).slice(0, CODE_LENGTH);
    commit(next);
    refs.current[Math.min(index + digits.length, CODE_LENGTH - 1)]?.focus();
  }

  return (
    <div dir="ltr" className="flex justify-between gap-2" role="group" aria-label="کد تایید">
      {Array.from({ length: CODE_LENGTH }, (_, index) => (
        <input
          key={index}
          id={`${id}-${index}`}
          ref={(el) => { refs.current[index] = el; }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          maxLength={CODE_LENGTH}
          value={value[index] || ""}
          autoFocus={index === 0}
          aria-label={`رقم ${index + 1}`}
          onChange={(e) => {
            const digits = onlyDigits(e.target.value);
            if (!digits) return commit(latest.current.slice(0, index) + latest.current.slice(index + 1));
            fill(index, digits);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !latest.current[index] && index > 0) {
              e.preventDefault();
              commit(latest.current.slice(0, index - 1));
              refs.current[index - 1]?.focus();
            } else if (e.key === "ArrowLeft" && index > 0) {
              refs.current[index - 1]?.focus();
            } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
              refs.current[index + 1]?.focus();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            fill(0, onlyDigits(e.clipboardData.getData("text")));
          }}
          onFocus={(e) => e.target.select()}
          className="field h-14 min-w-0 flex-1 px-0 text-center text-2xl font-bold"
        />
      ))}
    </div>
  );
}

/** Google's multicolor "G"; the brand colors are fixed by Google's guidelines. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

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
  const socialToken = params.get("social") || "";
  const socialCode = params.get("social_code") || "";
  const socialError = params.get("social_error") || "";
  const socialProvider: SocialProvider = params.get("provider") === "github" ? "github" : "google";

  const [phone, setPhone] = useState(phoneParam);
  const [code, setCode] = useState("");
  // if phone came from chat, skip directly to OTP step
  const [step, setStep] = useState<"phone" | "otp" | "password" | "link">(phoneParam ? "otp" : "phone");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [linkSent, setLinkSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(phoneParam ? 120 : 0);
  const [providers, setProviders] = useState<Record<SocialProvider, boolean>>({ google: false, github: false });

  useEffect(() => {
    fetchSocialProviders().then(setProviders).catch(() => {});
  }, []);

  useEffect(() => {
    if (socialError) setError("ورود با حساب اجتماعی انجام نشد. دوباره تلاش کن.");
  }, [socialError]);

  // A returning social user comes back with a one-time code that becomes the session.
  useEffect(() => {
    if (!socialCode) return;
    setLoading(true);
    exchangeSocialCode(socialCode)
      .then((data) => {
        saveSession(data);
        finish(data);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "ورود انجام نشد"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socialCode]);

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

  /** After sign-in: the requested page, or the main page, whose sidebar lists every section the account may open. */
  function finish(next: Session) {
    setSession(next);
    if (redirect) return router.push(redirect);
    if (next.needs_phone) {
      setPhone("");
      setCode("");
      setLinkSent(false);
      return setStep("link");
    }
    router.push("/");
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
      const data = await verifyOtp(phone.trim(), code.trim(), socialToken || undefined);
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
          saveChatToHistory(data.customer_id, anonymousChat);
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
          saveChatToHistory(data.customer_id, rawDraft);
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

  const editPhone = (onEdit: () => void) => (
    <button
      type="button"
      onClick={() => { onEdit(); setCode(""); setError(""); setCountdown(0); }}
      className="mx-auto flex items-center gap-1.5 rounded text-[13px] font-bold text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <IconPencil size={15} aria-hidden="true" />
      ویرایش شماره
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
      <label htmlFor={`${id}-0`} className="field-label">کد تایید</label>
      <CodeBoxes id={id} value={code} onChange={setCode} />
    </div>
  );

  const copy = {
    phone: socialToken
      ? { title: "شماره موبایلت رو تایید کن", description: `با ${socialProvider === "github" ? "گیت‌هاب" : "گوگل"} وارد شدی. شماره‌ات رو وارد کن تا کد پیامکی برات بیاد و حسابت کامل بشه.` }
      : { title: "ورود یا ثبت‌نام", description: "شماره موبایلت رو وارد کن تا کد ورود برات پیامک بشه. مشتری یا فریلنسر، همه از همین‌جا وارد می‌شن." },
    otp: { title: "کد تایید رو وارد کن", description: <>کد ۵ رقمی به <span dir="ltr" className="font-bold text-foreground">{phone}</span> ارسال شد.</> },
    password: { title: "ورود با ایمیل و رمز", description: "برای حساب‌هایی که قبلاً با ایمیل ساخته شدن." },
    link: { title: "شماره موبایلت رو وصل کن", description: "از این به بعد مثل بقیه با کد پیامکی وارد می‌شی و پنل‌هات کنار هم میان." },
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
          {!socialToken && (providers.google || providers.github) && (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                یا
                <span className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-2.5">
                {providers.google && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = socialStartUrl("google"); }}
                    className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-[#dadce0] bg-white text-sm font-bold text-[#3c4043] outline-none transition-colors hover:bg-[#f8f9fa] focus-visible:ring-2 focus-visible:ring-ring dark:border-[#8e918f] dark:bg-[#131314] dark:text-[#e3e3e3] dark:hover:bg-[#1f1f20]"
                  >
                    <GoogleMark />
                    ادامه با گوگل
                  </button>
                )}
                {providers.github && (
                  <button
                    type="button"
                    onClick={() => { window.location.href = socialStartUrl("github"); }}
                    className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-[#24292f] text-sm font-bold text-white outline-none transition-colors hover:bg-[#32383f] focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <IconBrandGithub size={20} aria-hidden="true" />
                    ادامه با گیت‌هاب
                  </button>
                )}
              </div>
            </>
          )}
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
          {editPhone(() => setStep("phone"))}
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
          {linkSent ? (<>{resend(() => setLinkSent(false))}{editPhone(() => setLinkSent(false))}</>) : (
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
    </AuthLayout>
  );
}

/** The conversation held before signing in becomes an entry in the customer's chat history. */
function saveChatToHistory(customerId: string, rawDraft: string | null) {
  try {
    const draft = rawDraft ? JSON.parse(rawDraft) : null;
    if (!draft || !Array.isArray(draft.messages) || draft.messages.length < 2) return;
    const key = `chat_sessions_customer_${customerId}`;
    const sessions = JSON.parse(localStorage.getItem(key) || "[]");
    const firstUser = (draft.messages as Message[]).find((m) => m.role === "user");
    sessions.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: (firstUser?.content || "چت جدید").slice(0, 50),
      updated_at: new Date().toISOString(),
      draft: { ...draft, input: "", phoneStep: false },
    });
    localStorage.setItem(key, JSON.stringify(sessions.slice(0, 25)));
  } catch {
    // history is a convenience; never block the login
  }
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginContent />
    </Suspense>
  );
}
