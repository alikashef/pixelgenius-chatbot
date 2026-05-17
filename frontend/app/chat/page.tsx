"use client";

import { useState, useRef, useEffect, FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ChatBubble from "@/components/ChatBubble";
import { sendChat, sendOtp, submitOrder, Message, Proposal, LeadAnalysis } from "@/lib/api";

const WELCOME: Message = {
  role: "assistant",
  content: "سلام! خوش اومدید 👋\nمن مشاور هوشمند تیم توسعه وب هستم. بهم بگید چه نوع پروژه‌ای در ذهن دارید؟",
};

const PHONE_ASK: Message = {
  role: "assistant",
  content: "پروپوزال پروژه‌تون آماده‌ست! 🎉\nبرای ثبت درخواست نیاز به یه حساب کاربری داریم. شماره موبایلتون رو بنویسید تا برام حساب بسازیم:",
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
  const firstUser = messages.find((message) => message.role === "user");
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
          ? sessions.find((session) => session.id === requestedSessionId)
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

    const draft: ChatDraft = {
      version: CHAT_VERSION,
      messages,
      input,
      phoneStep,
    };
    localStorage.setItem(chatKey, JSON.stringify(draft));

    if (customerToken && customerId && sessionId) {
      const sessions = readCustomerSessions(customerId).filter((session) => session.id !== sessionId);
      sessions.unshift({
        id: sessionId,
        title: getSessionTitle(messages),
        updated_at: new Date().toISOString(),
        draft,
      });
      writeCustomerSessions(customerId, sessions.slice(0, 25));
    }
  }, [chatKey, customerId, customerToken, input, messages, phoneStep, sessionId]);

  useEffect(() => {
    if (customerToken || messages.length <= 1) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [customerToken, messages.length]);

  function resetChat() {
    if (customerToken && customerId && sessionId) {
      const sessions = readCustomerSessions(customerId).filter((session) => session.id !== sessionId);
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

    // phone collection step
    if (phoneStep) {
      await handlePhoneSubmit(text);
      return;
    }

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
            const sessions = readCustomerSessions(customerId).filter((session) => session.id !== sessionId);
            writeCustomerSessions(customerId, sessions);
          }
          setMessages([
            ...newMessages,
            {
              ...SUBMITTED,
              content: `${customerName ? `${customerName} جان، ` : ""}${clientReply}\n\n${SUBMITTED.content}`,
            },
          ]);
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
    }
  }

  async function handlePhoneSubmit(phone: string) {
    setSendingOtp(true);
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: phone }]);
    setInput("");
    try {
      await sendOtp(phone);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `کد تایید به ${phone} ارسال شد. الان بهتون منتقل می‌کنم تا کد رو وارد کنید...` },
      ]);
      setTimeout(() => {
        router.push(`/login?phone=${encodeURIComponent(phone)}&redirect=/panel`);
      }, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ارسال کد");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "مشکلی در ارسال کد پیش اومد. شماره رو دوباره وارد کنید:" },
      ]);
    } finally {
      setSendingOtp(false);
    }
  }

  const placeholder = phoneStep ? "09xxxxxxxxx" : "پیام خود را بنویسید...";
  const isLoading = loading || sendingOtp;

  return (
    <div className="flex flex-col h-screen bg-[linear-gradient(180deg,#f8fcfa_0%,#f1f7f4_100%)]">
      <header className="border-b border-border/80 bg-white/90 backdrop-blur px-6 py-4 flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
        <span className="font-semibold text-slate-900">مشاور پروژه</span>
        <span className="text-slate-500 text-xs">آنلاین</span>
        {messages.length > 1 && (
          <button
            onClick={resetChat}
            className="text-slate-500 hover:text-slate-800 text-sm transition-colors"
          >
            چت جدید
          </button>
        )}
        <button
          onClick={() => router.push(customerToken ? "/panel" : "/login?redirect=/panel")}
          className="text-emerald-700 hover:text-emerald-800 text-sm transition-colors mr-auto"
        >
          {customerToken ? "پنل کاربری" : "ورود مشتری"}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 max-w-3xl w-full mx-auto">
        {!customerToken && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-amber-800 text-sm leading-6">
            لاگین نیستی؛ چت موقتاً روی همین مرورگر نگه داشته می‌شود، اما برای ذخیره امن و ثبت درخواست وارد شو یا تا پایان چت صفحه را نبند.
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} role={m.role} content={m.content} />
        ))}
        {isLoading && (
          <div className="flex justify-end mb-4">
            <div className="bg-emerald-600 rounded-2xl px-5 py-3 flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full bg-white opacity-80 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-red-600 text-center text-sm mb-4">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-border px-4 md:px-8 py-4 max-w-3xl w-full mx-auto"
      >
        <div className="flex gap-3">
          <input
            type={phoneStep ? "tel" : "text"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholder}
            disabled={isLoading}
            dir={phoneStep ? "ltr" : "rtl"}
            className="flex-1 bg-white border border-border rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-600 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-3 text-sm transition-colors"
          >
            {phoneStep ? "ارسال کد" : "ارسال"}
          </button>
        </div>
      </form>
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
