"use client";

import { useState, useRef, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconArrowUp, IconPlus, IconSparkles, IconUser } from "@tabler/icons-react";
import ChatBubble from "@/components/ChatBubble";
import { sendChat, sendOtp, submitOrder, Message, Proposal, LeadAnalysis } from "@/lib/api";

const WELCOME: Message = {
  role: "assistant",
  content: "سلام! خوش اومدید 👋\nمن مشاور هوشمند تیم توسعه وب هستم. بهم بگید چه نوع پروژه‌ای در ذهن دارید؟",
};

const PHONE_ASK: Message = {
  role: "assistant",
  content: "پروپوزال پروژه‌تون آماده‌ست! 🎉\nبرای ثبت درخواست نیاز به یه حساب کاربری داریم. شماره موبایلتون رو بنویسید:",
};

const SUBMITTED: Message = {
  role: "assistant",
  content: "پروپوزال پروژه‌تون آماده‌ست و درخواست ثبت شد. الان می‌تونید وضعیتش رو توی پنل کاربری ببینید.",
};

const ANON_CHAT_KEY = "chat_draft_anonymous";
const CHAT_VERSION = 1;

interface ChatDraft {
  version: number;
  messages: Message[];
  input: string;
  phoneStep: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  draft: ChatDraft;
}

function getWelcome(firstName?: string): Message {
  return {
    role: "assistant",
    content: firstName
      ? `سلام ${firstName} جان! خوش اومدی 👋\nبهم بگو برای پروژه وب جدیدت چه چیزی در ذهن داری؟`
      : "سلام! خوش اومدید 👋\nمن مشاور هوشمند تیم توسعه نابغه پیکسل هستم. بهم بگید چه نوع پروژه‌ای در ذهن دارید؟",
  };
}

function getCustomerChatKey(customerId: string) {
  return `chat_draft_customer_${customerId}`;
}

function getCustomerSessionsKey(customerId: string) {
  return `chat_sessions_customer_${customerId}`;
}

function createSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSessionTitle(messages: Message[]) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "چت جدید";
  return firstUser.content.slice(0, 50);
}

function readCustomerSessions(customerId: string): ChatSession[] {
  try {
    const raw = localStorage.getItem(getCustomerSessionsKey(customerId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.id && item?.draft?.version === CHAT_VERSION);
  } catch {
    return [];
  }
}

function writeCustomerSessions(customerId: string, sessions: ChatSession[]) {
  localStorage.setItem(getCustomerSessionsKey(customerId), JSON.stringify(sessions));
}

function readDraft(key: string): ChatDraft | null {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const draft = JSON.parse(stored) as Partial<ChatDraft>;
    if (
      draft.version === CHAT_VERSION &&
      Array.isArray(draft.messages) &&
      typeof draft.input === "string" &&
      typeof draft.phoneStep === "boolean"
    ) {
      return draft as ChatDraft;
    }
  } catch {
    return null;
  }
  return null;
}

function parseLeadAnalysis(reply: string): LeadAnalysis | null {
  const trimmed = reply.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<LeadAnalysis>;
    if (
      typeof parsed.project_type === "string" &&
      typeof parsed.project_goal === "string" &&
      typeof parsed.budget_level === "string" &&
      typeof parsed.budget_fit === "string" &&
      typeof parsed.recommended_solution === "string" &&
      typeof parsed.recommended_stack === "string" &&
      typeof parsed.estimated_price_range === "string" &&
      typeof parsed.estimated_timeline === "string" &&
      typeof parsed.client_risk_level === "string" &&
      typeof parsed.lead_score === "number" &&
      typeof parsed.client_message === "string" &&
      typeof parsed.admin_summary === "string" &&
      Array.isArray(parsed.missing_questions)
    ) {
      return parsed as LeadAnalysis;
    }
  } catch {
    return null;
  }
  return null;
}

function parseDays(timeline: string) {
  const numbers = timeline.match(/\d+/g)?.map(Number) || [];
  if (!numbers.length) return 14;
  const max = Math.max(...numbers);
  return timeline.includes("ماه") ? max * 30 : timeline.includes("هفته") ? max * 7 : max;
}

function parsePriceEstimate(priceRange: string) {
  const normalized = priceRange.replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
  const numbers = normalized.match(/\d+/g)?.map(Number) || [];
  if (!numbers.length) return 0;
  return Math.max(...numbers) * 1000000;
}

function leadToProposal(lead: LeadAnalysis): Proposal {
  return {
    type: "proposal",
    projectName: lead.project_type || "درخواست پروژه",
    summary: `${lead.client_message}\n\nخلاصه ادمین: ${lead.admin_summary}`,
    features: [
      `هدف: ${lead.project_goal}`,
      `راهکار پیشنهادی: ${lead.recommended_solution}`,
      `تناسب بودجه: ${lead.budget_fit}`,
      `سطح ریسک: ${lead.client_risk_level}`,
      `امتیاز لید: ${lead.lead_score}`,
      ...lead.missing_questions.map((q) => `ابهام: ${q}`),
    ],
    tech: lead.recommended_stack,
    days: parseDays(lead.estimated_timeline),
    price: parsePriceEstimate(lead.estimated_price_range),
    priceLabel: lead.estimated_price_range,
  };
}

function ChatPageInner() {
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [customerToken, setCustomerToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [chatKey, setChatKey] = useState(ANON_CHAT_KEY);
  const [sessionId, setSessionId] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phoneStep, setPhoneStep] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = localStorage.getItem("customer_token") || "";
    const currentCustomerId = localStorage.getItem("customer_id") || "";
    const firstName = localStorage.getItem("customer_first_name") || "";
    const requestedSessionId = searchParams.get("session");
    const forceNew = searchParams.get("new") === "1";
    const nextChatKey = token && currentCustomerId ? getCustomerChatKey(currentCustomerId) : ANON_CHAT_KEY;
    const customerDraft = readDraft(nextChatKey);
    const anonymousDraft = readDraft(ANON_CHAT_KEY);
    let draft = customerDraft || anonymousDraft;
    let nextSessionId = createSessionId();

    setCustomerToken(token);
    setCustomerId(currentCustomerId);
    setCustomerName(firstName);
    setChatKey(nextChatKey);

    if (token && currentCustomerId && anonymousDraft && !customerDraft) {
      localStorage.setItem(nextChatKey, JSON.stringify(anonymousDraft));
      localStorage.removeItem(ANON_CHAT_KEY);
    }

    if (token && currentCustomerId) {
      const sessions = readCustomerSessions(currentCustomerId);
      if (!forceNew) {
        const selected = requestedSessionId
          ? sessions.find((s) => s.id === requestedSessionId)
          : sessions[0];
        if (selected) {
          draft = selected.draft;
          nextSessionId = selected.id;
        }
      }
    }

    setSessionId(nextSessionId);
    if (draft) {
      setMessages(draft.messages);
      setInput(draft.input);
      setPhoneStep(token ? false : draft.phoneStep);
    } else {
      setMessages([getWelcome(firstName)]);
      setInput("");
      setPhoneStep(false);
    }
    hydratedRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, phoneStep]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const draft: ChatDraft = { version: CHAT_VERSION, messages, input, phoneStep };
    localStorage.setItem(chatKey, JSON.stringify(draft));
    if (customerToken && customerId && sessionId) {
      const sessions = readCustomerSessions(customerId).filter((s) => s.id !== sessionId);
      sessions.unshift({ id: sessionId, title: getSessionTitle(messages), updated_at: new Date().toISOString(), draft });
      writeCustomerSessions(customerId, sessions.slice(0, 25));
    }
  }, [chatKey, customerId, customerToken, input, messages, phoneStep, sessionId]);

  useEffect(() => {
    if (customerToken || messages.length <= 1) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [customerToken, messages.length]);

  function resetChat() {
    if (customerToken && customerId && sessionId) {
      const sessions = readCustomerSessions(customerId).filter((s) => s.id !== sessionId);
      writeCustomerSessions(customerId, sessions);
      const nextSession = createSessionId();
      setSessionId(nextSession);
      router.replace(`/chat?session=${nextSession}`);
    } else {
      localStorage.removeItem(chatKey);
    }
    setMessages([getWelcome(customerName)]);
    setInput("");
    setPhoneStep(false);
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    if (phoneStep) { await handlePhoneSubmit(text); return; }

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const apiMessages = newMessages.slice(1);
      const reply = await sendChat(apiMessages);
      const lead = parseLeadAnalysis(reply);

      if (lead) {
        const proposal = leadToProposal(lead);
        const clientReply = lead.client_message || "پیشنهاد اولیه پروژه آماده شد.";
        if (customerToken) {
          const order = await submitOrder(customerToken, proposal, newMessages);
          localStorage.removeItem("proposal");
          localStorage.removeItem(chatKey);
          if (customerId && sessionId) {
            const sessions = readCustomerSessions(customerId).filter((s) => s.id !== sessionId);
            writeCustomerSessions(customerId, sessions);
          }
          setMessages([...newMessages, { ...SUBMITTED, content: `${customerName ? `${customerName} جان، ` : ""}${clientReply}\n\n${SUBMITTED.content}` }]);
          setTimeout(() => router.push(`/panel/${order.id}`), 1200);
          return;
        }
        localStorage.setItem("proposal", JSON.stringify(proposal));
        setMessages([...newMessages, { role: "assistant", content: `${clientReply}\n\n${PHONE_ASK.content}` }]);
        setPhoneStep(true);
        return;
      }

      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  async function handlePhoneSubmit(phone: string) {
    setSendingOtp(true);
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: phone }]);
    setInput("");
    try {
      await sendOtp(phone);
      setMessages((prev) => [...prev, { role: "assistant", content: `کد تایید به ${phone} ارسال شد. الان بهتون منتقل می‌کنم تا کد رو وارد کنید...` }]);
      setTimeout(() => router.push(`/login?phone=${encodeURIComponent(phone)}&redirect=/panel`), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ارسال کد");
      setMessages((prev) => [...prev, { role: "assistant", content: "مشکلی در ارسال کد پیش اومد. شماره رو دوباره وارد کنید:" }]);
    } finally {
      setSendingOtp(false);
    }
  }

  const placeholder = phoneStep ? "09xxxxxxxxx" : "پیام بنویسید...";
  const isLoading = loading || sendingOtp;

  return (
    <div className="flex h-screen flex-col bg-[hsl(var(--background))]">
      {/* header */}
      <header className="flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-5 py-3.5 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 font-black text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[--violet] shadow-md shadow-[--violet-glow]">
            <IconSparkles size={16} stroke={2.2} />
          </span>
          <span className="hidden sm:inline text-sm">FreelioAI</span>
        </Link>

        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs text-[hsl(var(--muted-foreground))]">آنلاین</span>
        </div>

        <div className="mr-auto flex items-center gap-2">
          {messages.length > 1 && (
            <button
              onClick={resetChat}
              className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[--surface] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-white"
            >
              <IconPlus size={13} stroke={2.5} />
              چت جدید
            </button>
          )}
          <Link
            href={customerToken ? "/panel" : "/login?redirect=/panel"}
            className="flex items-center gap-1.5 rounded-lg border border-[--violet-border] bg-[--violet-glow] px-3 py-1.5 text-xs font-semibold text-violet-300 transition-colors hover:text-white"
          >
            <IconUser size={13} stroke={2} />
            {customerToken ? "پنل من" : "ورود"}
          </Link>
        </div>
      </header>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8">
        <div className="mx-auto max-w-2xl">
          {!customerToken && (
            <div className="mb-5 rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3 text-xs leading-6 text-yellow-400">
              لاگین نیستی — چت موقتاً روی مرورگر ذخیره می‌شه. برای ثبت امن وارد شو یا صفحه رو نبند.
            </div>
          )}
          {messages.map((m, i) => (
            <ChatBubble key={i} role={m.role} content={m.content} />
          ))}
          {isLoading && (
            <div className="mb-4 flex items-end gap-2.5 justify-end">
              <span className="mb-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[--violet] text-[10px] font-black text-white shadow-lg shadow-[--violet-glow]">
                AI
              </span>
              <div className="rounded-2xl rounded-tl-sm bg-[--surface-2] border border-[hsl(var(--border))] px-4 py-3">
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-2 w-2 rounded-full bg-violet-400 animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
              </div>
            </div>
          )}
          {error && (
            <p className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-center text-xs text-red-400">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* input */}
      <div className="border-t border-[hsl(var(--border))] px-4 py-4 md:px-8">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="flex items-center gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] px-4 py-2 transition-colors focus-within:border-[--violet-border]">
            <input
              ref={inputRef}
              type={phoneStep ? "tel" : "text"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={placeholder}
              disabled={isLoading}
              dir={phoneStep ? "ltr" : "rtl"}
              className="flex-1 bg-transparent py-1.5 text-sm text-[hsl(var(--foreground))] placeholder-[hsl(var(--muted-foreground))] outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[--violet] text-white shadow-md shadow-[--violet-glow] transition-all hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <IconArrowUp size={17} stroke={2.5} />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-[hsl(var(--muted-foreground))]">
            FreelioAI · هوش مصنوعی اشتباه می‌کنه — نتیجه نهایی رو بررسی کن
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <ChatPageInner />
    </Suspense>
  );
}
