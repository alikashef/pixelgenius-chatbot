"use client";

import { useState, useRef, useEffect, FormEvent, KeyboardEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { IconArrowUp, IconBrandGithub, IconChevronLeft, IconCode, IconCloudUpload, IconLayout, IconCheck, IconCoin, IconCopy, IconDownload, IconFileText, IconHelp, IconFileZip, IconMenu2, IconMessageCircle, IconPaperclip, IconPlus, IconRefresh, IconUser, IconWand, IconX } from "@tabler/icons-react";
import { BrandLogo, BrandMark } from "@/components/Brand";
import { accentStyle, robotColors } from "@/lib/widget";
import { Button } from "@/components/ui/button";
import { BUILD_PROMPT, CopyBlock } from "@/components/McpTour";
import ChatBubble from "@/components/ChatBubble";
import ChatRobot from "@/components/ChatRobot";
import ThemeToggle from "@/components/ThemeToggle";
import { NavGroups, useSectionLinks } from "@/components/AppShell";
import GuidedTour, { startTour } from "@/components/GuidedTour";
import FreelancerPromo from "@/components/FreelancerPromo";
import GithubRepoPicker from "@/components/GithubRepoPicker";
import { fetchBotProfile, BotProfile, fetchOrderBrief, fetchChatProgress, ChatProgressStage, sendChat, sendOtp, submitOrder, uploadChatFile, createChatSession, updateChatSession, ChatMode, ProjectPath, Message, Proposal, LeadAnalysis, OrderFile, Order, fetchMyOrders } from "@/lib/api";

const WELCOME: Message = {
  role: "assistant",
  content: "سلام! خوش اومدید 👋\nمن طراح محصول هوشمند شما هستم. بهم بگید چه ایده‌ای برای سایت یا اپلیکیشن دارید؟",
};

const PHONE_ASK: Record<ChatMode, Message> = {
  designer: {
    role: "assistant",
    content: "کانفیگ پروژه‌ات آماده‌ست! 🎉\nبرای دریافتش یه حساب کاربری لازمه. شماره موبایلت رو بنویس:",
  },
  sales: {
    role: "assistant",
    content: "پروپوزال پروژه‌تون آماده‌ست! 🎉\nبرای ثبت درخواست نیاز به یه حساب کاربری داریم. شماره موبایلتون رو بنویسید:",
  },
};

const QUICK_STARTS: Record<ChatMode, string[]> = {
  designer: [
    "فروشگاه آنلاین",
    "سیستم نوبت‌دهی و رزرو",
    "سایت معرفی شرکت",
    "داشبورد مدیریتی",
    "پلتفرم آموزش آنلاین",
    "منوی دیجیتال رستوران",
  ],
  sales: ["لندینگ پیج", "فروشگاه آنلاین", "پنل مدیریت", "سایت شرکتی"],
};

const MODE_CARDS: Record<
  ChatMode,
  { label: string; badge?: string; summary: string; points: string[]; output: string; fit: string }
> = {
  designer: {
    label: "طراح محصول",
    badge: "پیشنهادی",
    summary: "ایده‌ات رو با یک طراح محصول قدم‌به‌قدم شفاف می‌کنی تا کل ساختار پروژه مشخص بشه.",
    points: [
      "چند سوال کوتاه و راهنمایی‌شده درباره صفحه‌ها، قابلیت‌ها و ظاهر",
      "انتخاب استک فنی و طراحی مدل داده و API",
      "بدون صحبت از قیمت؛ فقط طراحی",
    ],
    output: "فایل کانفیگ JSON که به ابزار کدنویسی هوش مصنوعی می‌دی تا پروژه ساخته بشه",
    fit: "مناسب وقتی می‌خوای پروژه رو با هوش مصنوعی بسازی",
  },
  sales: {
    label: "مشاور فروش",
    summary: "نیازت رو می‌گی و برآورد اولیه قیمت و زمان می‌گیری؛ درخواستت برای تیم توسعه ثبت می‌شه.",
    points: [
      "بررسی بودجه، زمان‌بندی و اولویت‌ها",
      "محدوده قیمت تقریبی و راهکار پیشنهادی",
      "ثبت درخواست با تایید شماره موبایل",
    ],
    output: "درخواست ثبت‌شده و پیگیری وضعیت در پنل کاربری",
    fit: "مناسب وقتی می‌خوای تیم توسعه پروژه رو برات بسازه",
  },
};

const PROJECT_PATHS: { id: ProjectPath; title: string; description: string; icon: typeof IconLayout }[] = [
  { id: "design", title: "ساخت همراه طراحی", description: "ابتدا طراحی را بازبینی و تأیید می‌کنی، سپس توسعه شروع می‌شود.", icon: IconLayout },
  { id: "direct", title: "ساخت مستقیم", description: "بعد از نیازسنجی، توسعه بدون مرحله طراحی مستقل انجام می‌شود.", icon: IconCode },
  { id: "source", title: "انتشار سورس آماده", description: "سورس موجود را بررسی می‌کنیم و پیش‌نیازهای انتشار را مشخص می‌کنیم.", icon: IconCloudUpload },
];
const isProjectPath = (value: unknown): value is ProjectPath => value === "design" || value === "direct" || value === "source";

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
  attachments?: OrderFile[];
  mode?: ChatMode;
  projectPath?: ProjectPath;
  sourceUrl?: string;
  sourceType?: "github" | "zip";
  sourceArchive?: OrderFile;
}

interface ChatSession {
  id: string;
  title: string;
  updated_at: string;
  draft: ChatDraft;
}

function getWelcome(firstName?: string, mode: ChatMode = "designer", projectPath?: ProjectPath): Message {
  if (mode === "designer" && projectPath === "source") return {
    role: "assistant", content: "سلام! سورس آماده‌ات رو بررسی می‌کنیم تا برای انتشار آماده بشه. پروژه با چه استکی ساخته شده و سورسش رو کجا نگه می‌داری؟",
  };
  if (mode === "sales") {
    return {
      role: "assistant",
      content: firstName
        ? `سلام ${firstName} جان! خوش اومدی 👋\nبهم بگو برای پروژه وب جدیدت چه چیزی در ذهن داری؟`
        : "سلام! خوش اومدید 👋\nمن مشاور هوشمند تیم توسعه وب هستم. بهم بگید چه نوع پروژه‌ای در ذهن دارید؟",
    };
  }
  return {
    role: "assistant",
    content: firstName
      ? `سلام ${firstName} جان! خوش اومدی 👋\nبهم بگو برای سایت یا اپلیکیشن جدیدت چه ایده‌ای داری؟`
      : "سلام! خوش اومدید 👋\nمن طراح محصول هوشمند شما هستم. بهم بگید چه ایده‌ای برای سایت یا اپلیکیشن دارید؟",
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
      return { ...draft, attachments: Array.isArray(draft.attachments) ? draft.attachments : [] } as ChatDraft;
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
      typeof parsed.recommended_solution === "string" &&
      typeof parsed.recommended_stack === "string" &&
      typeof parsed.estimated_timeline === "string" &&
      typeof parsed.client_message === "string" &&
      typeof parsed.admin_summary === "string"
    ) {
      return {
        budget_level: "-",
        budget_fit: "fit",
        estimated_price_range: "-",
        client_risk_level: "low",
        lead_score: 50,
        missing_questions: [],
        ...parsed,
      } as LeadAnalysis;
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

const BUDGET_FIT_LABEL: Record<string, string> = {
  fit:   "بودجه شما با پروژه تناسب دارد",
  low:   "بودجه درنظر گرفته‌شده ممکن است کم باشد",
  high:  "بودجه شما از میانگین بالاتر است",
};

const RISK_LABEL: Record<string, string> = {
  low:    "احتمال موفقیت پروژه: بالا",
  medium: "احتمال موفقیت پروژه: متوسط — نیاز به شفاف‌سازی بیشتر",
  high:   "این پروژه نیاز به بررسی دقیق‌تر دارد",
};

function leadToProposal(lead: LeadAnalysis, mode: ChatMode): Proposal {
  const features = [
    `هدف: ${lead.project_goal}`,
    `راهکار پیشنهادی: ${lead.recommended_solution}`,
    ...(mode === "sales"
      ? [
          BUDGET_FIT_LABEL[lead.budget_fit] ?? `تناسب بودجه: ${lead.budget_fit}`,
          RISK_LABEL[lead.client_risk_level] ?? `سطح ریسک: ${lead.client_risk_level}`,
        ]
      : []),
    ...lead.missing_questions.map((q) => (mode === "sales" ? `نیاز به اطلاعات بیشتر: ${q}` : `نکته‌ی باز: ${q}`)),
  ];
  return {
    type: "proposal",
    projectName: lead.project_type || "درخواست پروژه",
    summary: `${lead.client_message}\n\nخلاصه ادمین: ${lead.admin_summary}`,
    features,
    tech: lead.recommended_stack,
    days: parseDays(lead.estimated_timeline),
    price: parsePriceEstimate(lead.estimated_price_range),
    priceLabel: lead.estimated_price_range,
    mode,
  };
}

function collectMessageAttachments(messages: Message[]) {
  return messages.flatMap((message) => message.attachments || []);
}

type GuideTool = "claude" | "chatgpt" | "cursor";

function BriefGuide({ mcpUrl }: { mcpUrl: string }) {
  const [tool, setTool] = useState<GuideTool>("claude");
  const tabs: { id: GuideTool; label: string }[] = [
    { id: "claude", label: "Claude" },
    { id: "chatgpt", label: "ChatGPT" },
    { id: "cursor", label: "Cursor / Codex" },
  ];
  const steps = [
    { title: "فایل رو دانلود کن", body: "دکمه‌ی بالا رو بزن و فایل project-brief.json رو توی یک پوشه‌ی خالی برای پروژه بذار." },
    {
      title: "ابزار کدنویسی رو آماده کن",
      body: "یکی از Claude Code، Codex یا Cursor رو نصب کن و با اشتراک Pro وارد شو. بعد ابزار رو توی همون پوشه باز کن.",
    },
  ];
  return (
    <div className="mt-5">
      <h3 className="text-sm font-extrabold text-foreground">آموزش گام‌به‌گام</h3>
      <ol className="mt-3 space-y-4">
        {steps.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-soft text-xs font-bold text-brand">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-1 text-[13px] leading-7 text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}

        <li className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-soft text-xs font-bold text-brand">
            3
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              اتصال سرور انتشار <span className="text-xs font-normal text-muted-foreground">(اختیاری)</span>
            </p>
            <p className="mt-1 text-[13px] leading-7 text-muted-foreground">
              با این اتصال، هوش مصنوعی پروژه رو خودش روی سرور <b>بیلد و منتشر</b> می‌کنه و یک آدرس موقت بهت می‌ده تا همون لحظه ببینیش. پروژه‌های Next.js، Node، Python و Django با دیتابیس PostgreSQL پشتیبانی می‌شن. اگه بیلد خطا بده، هوش مصنوعی لاگ رو می‌خونه و خودش اصلاح می‌کنه.
            </p>

            <Link
              href="/account?tab=connect"
              className="mt-2 inline-flex items-center gap-1 rounded text-xs font-bold text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              راهنمای کامل و تست اتصال در پنل
              <IconChevronLeft size={14} aria-hidden="true" />
            </Link>

            <div role="tablist" aria-label="ابزار" className="mt-3 flex flex-wrap gap-1.5">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tool === t.id}
                  onClick={() => setTool(t.id)}
                  className={`min-h-8 rounded-lg px-3 text-xs font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                    tool === t.id
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div role="tabpanel" className="mt-2 text-[13px] leading-7 text-secondary-foreground">
              {tool === "claude" && (
                <>
                  <ol className="list-decimal space-y-1 pr-5 marker:text-brand">
                    <li>
                      توی Claude برو به <b>Customize ← Connectors</b>.
                    </li>
                    <li>
                      دکمه‌ی <b>+</b> و بعد <b>Add custom connector</b> رو بزن.
                    </li>
                    <li>اسم و آدرس زیر رو وارد کن، بقیه‌ی فیلدها رو خالی بذار.</li>
                    <li>
                      <b>Add</b> رو بزن تا ساخته بشه.
                    </li>
                  </ol>
                  <p className="mt-2 text-xs text-muted-foreground">اسم:</p>
                  <CopyBlock text="PixelGenius" label="کپی اسم کانکتور" />
                  <p className="mt-2 text-xs text-muted-foreground">آدرس سرور:</p>
                  <CopyBlock text={mcpUrl} label="کپی آدرس سرور" />
                </>
              )}
              {tool === "chatgpt" && (
                <>
                  <ol className="list-decimal space-y-1 pr-5 marker:text-brand">
                    <li>
                      توی ChatGPT برو به <b>Settings ← Apps &amp; Connectors ← Advanced</b> و <b>Developer Mode</b> رو روشن کن.
                    </li>
                    <li>
                      <b>Create</b> رو بزن تا یک connector جدید بسازی.
                    </li>
                    <li>
                      اسم و آدرس زیر رو بده و احراز هویت رو روی <b>No authentication</b> بذار.
                    </li>
                    <li>
                      توی چت جدید، از منوی ابزارها <b>PixelGenius</b> رو فعال کن.
                    </li>
                  </ol>
                  <p className="mt-2 text-xs text-muted-foreground">اسم:</p>
                  <CopyBlock text="PixelGenius" label="کپی اسم کانکتور" />
                  <p className="mt-2 text-xs text-muted-foreground">آدرس سرور:</p>
                  <CopyBlock text={mcpUrl} label="کپی آدرس سرور" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Developer Mode بسته به پلن ممکنه در دسترس نباشه؛ اگه گزینه رو ندیدی، از Claude یا Cursor استفاده کن.
                  </p>
                </>
              )}
              {tool === "cursor" && (
                <>
                  <ol className="list-decimal space-y-1 pr-5 marker:text-brand">
                    <li>
                      توی Cursor برو به <b>Settings ← MCP</b> و <b>Add new MCP server</b> رو بزن.
                    </li>
                    <li>نوع سرور رو آدرس (URL / HTTP) بذار و آدرس زیر رو وارد کن.</li>
                  </ol>
                  <p className="mt-2 text-xs text-muted-foreground">آدرس سرور:</p>
                  <CopyBlock text={mcpUrl} label="کپی آدرس سرور" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Codex و ابزارهای مشابه هم توی بخش تنظیمات MCP خودشون همین آدرس رو می‌پذیرن.
                  </p>
                </>
              )}
            </div>
          </div>
        </li>

        <li className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-soft text-xs font-bold text-brand">
            4
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">این پیام رو به هوش مصنوعی بده</p>
            <CopyBlock text={BUILD_PROMPT} label="کپی پیام ساخت پروژه" rtl />
          </div>
        </li>

        <li className="flex gap-3">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-soft text-xs font-bold text-brand">
            5
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">نتیجه رو بگیر</p>
            <p className="mt-1 text-[13px] leading-7 text-muted-foreground">
              هوش مصنوعی فایل‌ها رو می‌سازه، با سرور انتشار منتشرشون می‌کنه و آدرس زنده‌ی پروژه رو بهت می‌ده. این آدرس موقته و بعد از چند ساعت به‌صورت خودکار پاک می‌شه. بدون اتصال سرور انتشار، دستور اجرای محلی رو می‌نویسه.
            </p>
          </div>
        </li>
      </ol>
    </div>
  );
}

function ChatPageInner() {
  const [tourOpen, setTourOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [customerToken, setCustomerToken] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [chatKey, setChatKey] = useState(ANON_CHAT_KEY);
  const [sessionId, setSessionId] = useState("");
  const [dbSessionId, setDbSessionId] = useState<string | null>(null);
  const [botToken, setBotToken] = useState<string | undefined>();
  const [mode, setMode] = useState<ChatMode>("designer");
  const [projectPath, setProjectPath] = useState<ProjectPath | undefined>();
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<"github" | "zip" | undefined>();
  const [sourceArchive, setSourceArchive] = useState<OrderFile | undefined>();
  const [hydrated, setHydrated] = useState(false);
  const [briefOrderId, setBriefOrderId] = useState("");
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
  const [briefState, setBriefState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [progressId, setProgressId] = useState<string | null>(null);
  const [progressStage, setProgressStage] = useState<ChatProgressStage | null>(null);
  const [error, setError] = useState("");
  const [phoneStep, setPhoneStep] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [attachments, setAttachments] = useState<OrderFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [salesOrders, setSalesOrders] = useState<Order[]>([]);
  const [embedded, setEmbedded] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState(false);
  const [botProfile, setBotProfile] = useState<BotProfile | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sourceFileRef = useRef<HTMLInputElement>(null);
  const lastAttemptRef = useRef<{ messages: Message[]; attachments: OrderFile[]; finalize: boolean } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = localStorage.getItem("customer_token") || "";
    const currentCustomerId = localStorage.getItem("customer_id") || "";
    const firstName = localStorage.getItem("customer_first_name") || "";
    const requestedSessionId = searchParams.get("session");
    const forceNew = searchParams.get("new") === "1";
    const bot = searchParams.get("bot") || undefined;
    const isEmbedded = searchParams.get("embed") === "1";
    setBotToken(bot);
    setEmbedded(isEmbedded);
    setSubmittedNotice(isEmbedded && searchParams.get("submitted") === "1");
    const nextChatKey = token && currentCustomerId ? getCustomerChatKey(currentCustomerId) : ANON_CHAT_KEY;
    const customerDraft = readDraft(nextChatKey);
    const anonymousDraft = readDraft(ANON_CHAT_KEY);
    let draft = forceNew ? null : customerDraft || anonymousDraft;
    let nextSessionId = createSessionId();

    setCustomerToken(token);
    setCustomerId(currentCustomerId);
    setCustomerName(firstName);
    setChatKey(nextChatKey);

    if (!forceNew && token && currentCustomerId && anonymousDraft && !customerDraft) {
      localStorage.setItem(nextChatKey, JSON.stringify(anonymousDraft));
      localStorage.removeItem(ANON_CHAT_KEY);
    }

    if (token && currentCustomerId) {
      const sessions = readCustomerSessions(currentCustomerId);
      setSessions(sessions);
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

    const storedMode: ChatMode = bot || isEmbedded ? "sales" : draft?.mode || (localStorage.getItem("chat_mode") === "sales" ? "sales" : "designer");
    const restoredPath = !bot && storedMode === "designer" && isProjectPath(draft?.projectPath) ? draft.projectPath : undefined;
    setProjectPath(restoredPath);
    setSourceUrl(restoredPath === "source" ? draft?.sourceUrl || "" : "");
    setSourceType(restoredPath === "source" ? (draft?.sourceType || (draft?.sourceUrl ? "github" : draft?.sourceArchive ? "zip" : undefined)) : undefined);
    setSourceArchive(restoredPath === "source" ? draft?.sourceArchive : undefined);
    setDbSessionId(null);
    setMode(storedMode);
    setSessionId(nextSessionId);
    if (draft) {
      setMessages(draft.messages);
      setInput(draft.input);
      setPhoneStep(token ? false : draft.phoneStep);
      setAttachments(draft.attachments || []);
    } else {
      setMessages([getWelcome(firstName, storedMode)]);
      setInput("");
      setPhoneStep(false);
      setAttachments([]);
    }
    setHydrated(true);
  }, [searchParams]);

  useEffect(() => {
    if (!botToken) {
      setBotProfile(null);
      return;
    }
    let cancelled = false;
    fetchBotProfile(botToken)
      .then((profile) => {
        if (cancelled) return;
        setBotProfile(profile);
        const greeting = profile.widget.greeting.trim() ||
          `سلام! من دستیار هوشمند ${profile.widget.brand_name || profile.name || "تیم"} هستم.\nبهم بگید چه پروژه‌ای در ذهن دارید؟`;
        setMessages((prev) => (prev.length <= 1 ? [{ role: "assistant", content: greeting }] : prev));
      })
      .catch(() => { /* unknown bot: the generic sales assistant still works */ });
    return () => { cancelled = true; };
  }, [botToken]);

  useEffect(() => {
    const orderId = searchParams.get("brief");
    const token = localStorage.getItem("customer_token");
    if (orderId && token) loadBrief(orderId, token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (messages.length > 1 || briefOrderId) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, phoneStep, briefOrderId, briefState]);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 128)}px`;
  }, [input]);

  useEffect(() => {
    if (!hydrated) return;
    const draft: ChatDraft = { version: CHAT_VERSION, messages, input, phoneStep, attachments, mode, projectPath, sourceUrl, sourceType, sourceArchive };
    localStorage.setItem(chatKey, JSON.stringify(draft));
    if (customerToken && customerId && sessionId) {
      const sessions = readCustomerSessions(customerId).filter((s) => s.id !== sessionId);
      sessions.unshift({ id: sessionId, title: getSessionTitle(messages), updated_at: new Date().toISOString(), draft });
      writeCustomerSessions(customerId, sessions.slice(0, 25));
      setSessions(sessions.slice(0, 25));
    }
  }, [attachments, chatKey, customerId, customerToken, input, messages, phoneStep, sessionId, hydrated, mode, projectPath, sourceUrl, sourceType, sourceArchive]);

  useEffect(() => {
    if (customerToken || messages.length <= 1) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [customerToken, messages.length]);

  // Starts a fresh conversation; signed-in users keep the previous one in their history.
  function startNewChat() {
    setSidebarOpen(false);
    if (!customerToken) localStorage.removeItem(chatKey);
    setSessionId(createSessionId());
    router.push("/chat?new=1");
    setProjectPath(undefined);
    setSourceUrl("");
    setSourceType(undefined);
    setSourceArchive(undefined);
    setDbSessionId(null);
    lastAttemptRef.current = null;
    setProgressId(null);
    setProgressStage(null);
    setBriefOrderId("");
    setBrief(null);
    setBriefState("idle");
    setMessages([getWelcome(customerName, mode)]);
    setInput("");
    setPhoneStep(false);
    setAttachments([]);
    setError("");
  }

  async function loadBrief(orderId: string, token: string) {
    setBriefOrderId(orderId);
    try {
      const cached = localStorage.getItem(`project_brief_${orderId}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (data?.version === 1 && data.project && data.deploy) {
          setBrief(data);
          setBriefState("ready");
          return;
        }
        localStorage.removeItem(`project_brief_${orderId}`);
      }
    } catch {
      // ignore unreadable cache
    }
    setBriefState("loading");
    try {
      const data = await fetchOrderBrief(token, orderId);
      setBrief(data);
      setBriefState("ready");
      try {
        localStorage.setItem(`project_brief_${orderId}`, JSON.stringify(data));
      } catch {
        // storage full or blocked
      }
    } catch {
      setBriefState("error");
    }
  }

  function downloadBrief() {
    if (!brief) return;
    const blob = new Blob([JSON.stringify(brief, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "project-brief.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function toggleMode() {
    const next: ChatMode = mode === "designer" ? "sales" : "designer";
    setMode(next);
    localStorage.setItem("chat_mode", next);
    setProjectPath(undefined);
    setSourceUrl("");
    setSourceType(undefined);
    setSourceArchive(undefined);
    setMessages([getWelcome(customerName, next)]);
  }

  async function handleAttachmentChange(file?: File) {
    if (!file) return;
    setUploadingFile(true);
    setError("");
    try {
      const uploaded = await uploadChatFile(file);
      setAttachments((prev) => [...prev, uploaded]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در آپلود فایل");
    } finally {
      setUploadingFile(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((file) => file.id !== id));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await submit(input.trim());
  }

  async function submit(text: string) {
    if (activeMode === "designer" && !projectPath) { setError("ابتدا مسیر پروژه را انتخاب کن"); return; }
    if (activeMode === "designer" && projectPath === "source" && !sourceReady) { setError("مخزن GitHub را انتخاب کن یا فایل ZIP سورس را اضافه کن"); return; }
    if (activeMode === "designer" && projectPath === "source" && sourceType === "github") {
      try { const source = new URL(sourceUrl); if (source.protocol !== "https:" || !["github.com", "www.github.com"].includes(source.hostname) || source.pathname.split("/").filter(Boolean).length < 2 || source.username) throw new Error(); }
      catch { setError("لینک معتبر مخزن GitHub را وارد کن؛ مثل https://github.com/owner/repo"); return; }
    }
    if ((phoneStep ? !text : (!text && attachments.length === 0)) || loading || uploadingFile) return;
    if (phoneStep) { await handlePhoneSubmit(text); return; }

    const currentAttachments = [...attachments, ...(activeMode === "designer" && projectPath === "source" && sourceType === "zip" && sourceArchive && !collectMessageAttachments(messages).some(file => file.id === sourceArchive.id) && !attachments.some(file => file.id === sourceArchive.id) ? [sourceArchive] : [])];
    const newMessages: Message[] = [...messages, { role: "user", content: text, attachments: currentAttachments }];
    setMessages(newMessages);
    setInput("");
    setAttachments([]);
    await runReply(newMessages, currentAttachments);
  }

  useEffect(() => {
    if (!progressId || !loading) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    async function poll() {
      try {
        if (!document.hidden) {
          const stage = await fetchChatProgress(progressId!, controller.signal);
          if (!stopped && stage) setProgressStage(stage);
          if (stage === "done" || stage === "error") return;
        }
      } catch { /* The main request owns user-facing errors. */ }
      if (!stopped) timer = setTimeout(poll, 1000);
    }
    timer = setTimeout(poll, 300);
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [progressId, loading]);

  async function runReply(newMessages: Message[], currentAttachments: OrderFile[], finalize = false) {
    lastAttemptRef.current = { messages: newMessages, attachments: currentAttachments, finalize };
    const requestProgressId = crypto.randomUUID();
    setProgressId(requestProgressId);
    setProgressStage("thinking");
    setLoading(true);
    setError("");

    try {
      let currentDbSession = dbSessionId;
      if (!currentDbSession) {
        try { currentDbSession = await createChatSession(botToken); setDbSessionId(currentDbSession); } catch { /* silent */ }
      }

      const apiMessages = newMessages.slice(1);
      const reply = await sendChat(apiMessages, currentAttachments, activeMode, botToken, finalize, activeMode === "designer" ? projectPath : undefined, activeMode === "designer" && projectPath === "source" && sourceType === "github" ? sourceUrl : "", activeMode === "designer" && projectPath === "source" ? sourceType : undefined, activeMode === "designer" && projectPath === "source" && sourceType === "zip" ? sourceArchive : undefined, requestProgressId);
      const lead = parseLeadAnalysis(reply);
      const allMessages = lead
        ? [...newMessages, { role: "assistant" as const, content: lead.client_message || "" }]
        : [...newMessages, { role: "assistant" as const, content: reply }];

      if (currentDbSession) {
        updateChatSession(currentDbSession, allMessages).catch(() => {});
      }

      if (lead) {
        setProgressStage("working");
        const proposal: Proposal = { ...leadToProposal(lead, activeMode), ...(botToken ? { bot_token: botToken } : {}), ...(activeMode === "designer" ? { project_path: projectPath, source_url: projectPath === "source" && sourceType === "github" ? sourceUrl : "", source_type: projectPath === "source" ? sourceType : undefined, source_file: projectPath === "source" && sourceType === "zip" ? sourceArchive : undefined } : {}) };
        const clientReply = lead.client_message || "پیشنهاد اولیه پروژه آماده شد.";
        const orderFiles = collectMessageAttachments(newMessages);
        if (customerToken) {
          const order = await submitOrder(customerToken, proposal, newMessages, orderFiles, currentDbSession || undefined);
          if (currentDbSession) updateChatSession(currentDbSession, allMessages, { converted: true, orderId: order.id }).catch(() => {});
          localStorage.removeItem("proposal");
          localStorage.removeItem(chatKey);
          if (customerId && sessionId) {
            const sessions = readCustomerSessions(customerId).filter((s) => s.id !== sessionId);
            writeCustomerSessions(customerId, sessions);
          }
          if (mode === "designer") {
            setMessages([...newMessages, { role: "assistant", content: `${customerName ? `${customerName} جان، ` : ""}${clientReply}` }]);
            loadBrief(order.id, customerToken);
            return;
          }
          setMessages([...newMessages, { ...SUBMITTED, content: `${customerName ? `${customerName} جان، ` : ""}${clientReply}\n\n${SUBMITTED.content}` }]);
          setTimeout(() => router.push(`/panel/${order.id}`), 1200);
          return;
        }
        localStorage.setItem("proposal", JSON.stringify(proposal));
        setMessages([...newMessages, { role: "assistant", content: `${clientReply}\n\n${PHONE_ASK[activeMode].content}` }]);
        setPhoneStep(true);
        return;
      }

      setMessages([...newMessages, { role: "assistant", content: reply }]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
      setProgressId(null);
      inputRef.current?.focus();
    }
  }

  async function handlePhoneSubmit(phone: string) {
    if (!/^09[0-9]{9}$/.test(phone)) {
      setError("شماره موبایل را ۱۱ رقمی، با اعداد انگلیسی و شروع با 09 وارد کن.");
      return;
    }
    setSendingOtp(true);
    setError("");
    setMessages((prev) => [...prev, { role: "user", content: phone }]);
    setInput("");
    try {
      await sendOtp(phone);
      setMessages((prev) => [...prev, { role: "assistant", content: `کد تایید به ${phone} ارسال شد. الان بهتون منتقل می‌کنم تا کد رو وارد کنید...` }]);
      // Inside the embed, come back to the widget chat after login instead of the full panel.
      const redirect = embedded ? `/chat?${botToken ? `bot=${encodeURIComponent(botToken)}&` : ""}embed=1&submitted=1` : "/account";
      setTimeout(() => router.push(`/login?phone=${encodeURIComponent(phone)}&redirect=${encodeURIComponent(redirect)}`), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ارسال کد");
      setMessages((prev) => [...prev, { role: "assistant", content: "مشکلی در ارسال کد پیش اومد. شماره رو دوباره وارد کنید:" }]);
    } finally {
      setSendingOtp(false);
    }
  }

  const needsProjectPath = !botToken && mode === "designer" && !projectPath && !briefOrderId;
  const sourceReady = projectPath !== "source" || (sourceType === "github" ? Boolean(sourceUrl.trim()) : sourceType === "zip" && Boolean(sourceArchive));
  const chatBlocked = !hydrated || needsProjectPath || (!botToken && mode === "designer" && !briefOrderId && !sourceReady);
  const placeholder = needsProjectPath ? "اول مسیر پروژه را انتخاب کن" : mode === "designer" && projectPath === "source" && !sourceReady ? "مخزن GitHub یا ZIP سورس را انتخاب کن" : phoneStep ? "09xxxxxxxxx" : mode === "designer" ? "ایده‌ات رو بنویس..." : "پیام بنویسید...";
  const isLoading = loading || sendingOtp || uploadingFile;
  const canSubmit = !chatBlocked && (phoneStep ? Boolean(input.trim()) : Boolean(input.trim() || attachments.length));
  const activeMode: ChatMode = botToken || embedded ? "sales" : mode;
  const isFresh = messages.length <= 1 && !loading && !briefOrderId;

  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.currentTarget.form?.requestSubmit();
  }

  function selectMode(next: ChatMode) {
    if (next !== mode && isFresh) toggleMode();
  }

  function chooseProjectPath(next: ProjectPath) {
    setProjectPath(next);
    if (next !== "source") { setSourceUrl(""); setSourceType(undefined); setSourceArchive(undefined); }
    setError("");
    if (isFresh) setMessages([getWelcome(customerName, "designer", next)]);
  }

  async function handleSourceZip(file?: File) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".zip") || file.size > 12 * 1024 * 1024) { setError("فایل ZIP سورس باید حداکثر ۱۲ مگابایت باشد"); return; }
    setUploadingFile(true); setError("");
    try { setSourceArchive(await uploadChatFile(file)); }
    catch (err) { setError(err instanceof Error ? err.message : "بارگذاری ZIP انجام نشد"); }
    finally { setUploadingFile(false); if (sourceFileRef.current) sourceFileRef.current.value = ""; }
  }

  const sourceOptions: { id: "github" | "zip"; title: string; description: string; icon: typeof IconLayout }[] = [
    { id: "github", title: "مخزن GitHub", description: "مخزن را از حساب GitHub انتخاب کن", icon: IconBrandGithub },
    { id: "zip", title: "فایل ZIP", description: "سورس پروژه را بارگذاری کن", icon: IconFileZip },
  ];

  const pathPicker = !botToken && mode === "designer" && !briefOrderId && (isFresh || needsProjectPath) ? (
    <fieldset className="mt-8 min-w-0 text-right" data-tour="path">
      <legend className="eyebrow mb-3">مسیر پروژه</legend>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {PROJECT_PATHS.map((path) => {
          const checked = projectPath === path.id;
          return (
            <label key={path.id} className="cursor-pointer">
              <input type="radio" name="project-path" className="peer sr-only" value={path.id} checked={checked} onChange={() => chooseProjectPath(path.id)} />
              <span className="flex h-full flex-col rounded-xl border border-border bg-surface p-4 transition-colors hover:border-foreground/30 peer-checked:border-foreground peer-checked:shadow-[inset_0_0_0_1px_hsl(var(--foreground))] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                <span className="mb-3 flex items-center justify-between">
                  <path.icon size={22} stroke={1.8} aria-hidden="true" className={checked ? "text-brand" : "text-muted-foreground"} />
                  <span aria-hidden="true" className={`grid h-5 w-5 place-items-center rounded-full border ${checked ? "border-foreground bg-foreground text-background" : "border-input"}`}>
                    {checked && <IconCheck size={12} stroke={3} />}
                  </span>
                </span>
                <span className="text-sm font-bold text-foreground">{path.title}</span>
                <span className="mt-1.5 text-xs leading-6 text-muted-foreground">{path.description}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p className="mt-3 text-xs leading-6 text-muted-foreground">سؤال‌ها و مراحل پروژه براساس این انتخاب تنظیم می‌شوند و بعد از شروع گفتگو ثابت می‌مانند.</p>
      {projectPath === "source" && (
        <fieldset className="mt-5 min-w-0 rounded-xl border border-border bg-surface p-4">
          <legend className="sr-only">سورس پروژه کجاست؟</legend>
          <p className="mb-3 text-sm font-bold text-foreground">سورس پروژه کجاست؟</p>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
            {sourceOptions.map((item) => (
              <label key={item.id} className="cursor-pointer">
                <input className="peer sr-only" type="radio" name="source-type" value={item.id} checked={sourceType === item.id} onChange={() => { setSourceType(item.id); setError(""); }} />
                <span className="flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-bold text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground peer-checked:shadow-card dark:peer-checked:bg-foreground/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <item.icon size={17} aria-hidden="true" />
                  {item.title}
                </span>
              </label>
            ))}
          </div>
          {!sourceType && <p className="text-xs leading-6 text-muted-foreground">یکی از دو روش بالا را انتخاب کن.</p>}
          {sourceType === "github" && (
            <GithubRepoPicker token={customerToken} value={sourceUrl} onChange={(url) => { setSourceUrl(url); setError(""); }} />
          )}
          {sourceType === "zip" && (
            <div className="rounded-lg border border-dashed border-input bg-surface-2 p-4">
              <input ref={sourceFileRef} type="file" accept=".zip,application/zip" className="hidden" aria-label="فایل ZIP سورس پروژه" onChange={e => void handleSourceZip(e.target.files?.[0])} />
              {sourceArchive ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconFileZip size={22} className="shrink-0 text-brand" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold" dir="auto">{sourceArchive.name}</p>
                      <p className="mt-0.5 text-xs text-success">بارگذاری شد · {(sourceArchive.size / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} کیلوبایت</p>
                    </div>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSourceArchive(undefined)} disabled={uploadingFile}>حذف</Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2 text-center">
                  <Button type="button" variant="outline" onClick={() => sourceFileRef.current?.click()} disabled={uploadingFile}>
                    <IconCloudUpload size={18} aria-hidden="true" />
                    {uploadingFile ? "در حال بارگذاری…" : "انتخاب فایل ZIP"}
                  </Button>
                  <p className="text-xs leading-6 text-muted-foreground">حداکثر ۱۲ مگابایت؛ بدون node_modules و پوشه‌های build.</p>
                </div>
              )}
            </div>
          )}
        </fieldset>
      )}
    </fieldset>
  ) : null;

  function retry() {
    const last = lastAttemptRef.current;
    if (last) runReply(last.messages, last.attachments, last.finalize);
  }

  useEffect(() => {
    if (!customerToken) { setSalesOrders([]); return; }
    fetchMyOrders(customerToken)
      .then((orders) => setSalesOrders(orders.filter((o) => o.mode !== "designer")))
      .catch(() => setSalesOrders([]));
  }, [customerToken]);

  const visibleSessions = sessions.filter((s) => s.draft.messages.some((m) => m.role === "user"));
  const accountNav = useSectionLinks({ "فروش": salesOrders.length || undefined });
  const showSidebar = !botToken && !embedded;
  const brandName = botProfile?.widget.brand_name || botProfile?.name || "دستیار پروژه";
  const robotProps = {
    ...(botProfile ? { shape: botProfile.widget.robot_shape, robotColors: robotColors(botProfile.widget.robot_color) } : {}),
    voiceAvailable: !tourOpen && (botProfile?.widget.voice ?? true),
  };
  const modeChip = !isFresh && !briefOrderId ? (
    <span className="inline-flex min-w-0 items-center gap-1.5 truncate rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-secondary-foreground" title="برای تغییر حالت، یک گفتگوی جدید شروع کن">
      {activeMode === "designer" ? <IconWand size={14} aria-hidden="true" /> : <IconCoin size={14} aria-hidden="true" />}
      <span className="truncate">{MODE_CARDS[activeMode].label}{activeMode === "designer" && projectPath ? ` · ${PROJECT_PATHS.find(p => p.id === projectPath)?.title}` : ""}</span>
    </span>
  ) : null;

  const composer = (
    <form onSubmit={handleSubmit} className="w-full" data-tour="composer">
      <div className="rounded-2xl border border-input bg-surface p-2 shadow-elevated transition-[border-color,box-shadow] duration-150 focus-within:border-ring focus-within:shadow-[0_0_0_3px_hsl(var(--ring)/0.16)]">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2 px-1 pt-1">
                {attachments.map((file) => (
                  <span
                    key={file.id}
                    className="relative block h-16 w-16 overflow-hidden rounded-lg border border-border bg-surface-2"
                  >
                    {file.content_type?.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={file.url} alt={file.name} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1 text-[10px] text-muted-foreground">
                        <IconPaperclip size={15} />
                        <span className="w-full truncate text-center">{file.name}</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background shadow-md outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`حذف فایل ${file.name}`}
                    >
                      <IconX size={15} stroke={2.5} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5">
              {!phoneStep && (
                <>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={isLoading || chatBlocked}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    aria-label="پیوست فایل یا تصویر"
                    title="پیوست فایل یا تصویر نمونه"
                  >
                    <IconPaperclip size={18} stroke={2.2} />
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.txt,.zip,.rar"
                    onChange={(e) => handleAttachmentChange(e.target.files?.[0])}
                  />
                </>
              )}
              <label htmlFor="chat-input" className="sr-only">
                {phoneStep ? "شماره موبایل" : "پیام شما"}
              </label>
              <textarea
                id="chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  const value = e.target.value;
                  if (phoneStep && /[^0-9]/.test(value)) {
                    setError("شماره موبایل را فقط با اعداد انگلیسی وارد کن؛ زبان کیبورد را به انگلیسی تغییر بده.");
                    return;
                  }
                  setInput(value);
                  if (phoneStep) setError("");
                }}
                onKeyDown={handleTextareaKeyDown}
                placeholder={placeholder}
                disabled={isLoading || chatBlocked}
                dir={phoneStep ? "ltr" : "rtl"}
                rows={1}
                inputMode={phoneStep ? "numeric" : "text"}
                maxLength={phoneStep ? 11 : undefined}
                lang={phoneStep ? "en" : "fa"}
                autoComplete={phoneStep ? "tel" : "off"}
                className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-[16px] leading-6 text-foreground placeholder:text-muted-foreground outline-none disabled:opacity-50 sm:text-[15px]"
              />
              <button
                type="submit"
                disabled={isLoading || !canSubmit}
                aria-label="ارسال پیام"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-foreground/10 disabled:text-muted-foreground"
              >
                <IconArrowUp size={18} stroke={2.5} />
              </button>
            </div>
      </div>
      {!showSidebar && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          قدرت گرفته از{" "}
          <a href="/" target="_blank" rel="noopener noreferrer" className="font-bold text-secondary-foreground hover:text-foreground">PixelGenius</a>
        </p>
      )}
      {!isFresh && showSidebar && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          <span className="hidden sm:inline">Enter برای ارسال · Shift+Enter برای خط جدید · </span>
          هوش مصنوعی ممکنه اشتباه کنه؛ نتیجه نهایی رو بررسی کن
        </p>
      )}
    </form>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between px-4">
        <BrandLogo />
        <button type="button" onClick={() => setSidebarOpen(false)} aria-label="بستن منو" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
          <IconX size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="px-3">
        <button type="button" onClick={startNewChat} disabled={isLoading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50">
          <IconPlus size={17} aria-hidden="true" />
          گفتگوی جدید
        </button>
      </div>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {accountNav.length > 0 && (
          <nav aria-label="منوی اصلی">
            <NavGroups nav={accountNav} onNavigate={() => setSidebarOpen(false)} dense />
          </nav>
        )}
        <nav aria-label="گفتگوهای اخیر" data-tour="history" className={accountNav.length > 0 ? "mt-4" : undefined}>
          <p className="eyebrow mb-1.5 px-3">گفتگوهای اخیر</p>
          {customerToken ? (
            visibleSessions.length ? (
              <ul className="space-y-0.5">
                {visibleSessions.map((s) => {
                  const sales = s.draft.mode === "sales";
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/chat?session=${s.id}`}
                        onClick={() => setSidebarOpen(false)}
                        aria-current={s.id === sessionId ? "page" : undefined}
                        className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm text-secondary-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-foreground/[0.07] aria-[current=page]:font-bold aria-[current=page]:text-foreground"
                      >
                        <span className="min-w-0 flex-1 truncate">{s.title}</span>
                        <span
                          className={`shrink-0 rounded px-1.5 text-[10px] font-normal leading-[18px] ${sales ? "bg-accent-soft text-accent" : "bg-brand-soft text-brand"}`}
                        >
                          {sales ? "فروش" : "محصول"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-3 text-xs leading-6 text-muted-foreground">هنوز گفتگویی ذخیره نشده.</p>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4 text-xs leading-6 text-muted-foreground">
              برای ذخیره‌ی تاریخچه‌ی گفتگوها و پیگیری پروژه‌ها{" "}
              <Link href="/login?redirect=/chat" className="font-bold text-brand underline-offset-4 hover:underline">وارد شو</Link>.
            </div>
          )}
        </nav>
      </div>
      <FreelancerPromo onNavigate={() => setSidebarOpen(false)} />
      <div className="flex items-center gap-2 border-t border-border p-3">
        <Link href={customerToken ? "/account?tab=account" : "/login?redirect=/account?tab=account"} data-tour="account" className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-sm font-bold text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-2 text-muted-foreground">
            <IconUser size={15} aria-hidden="true" />
          </span>
          <span className="truncate">{customerToken ? customerName || "پنل کاربری" : "ورود / ثبت‌نام"}</span>
        </Link>
        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false);
            startTour("chat");
          }}
          aria-label="راهنمای سایت"
          title="راهنما"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconHelp size={17} aria-hidden="true" />
        </button>
        <ThemeToggle />
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden bg-background" style={botProfile ? accentStyle(botProfile.widget) : undefined}>
      {showSidebar && hydrated && <GuidedTour tour="chat" autoStart={isFresh} onOpenChange={setTourOpen} />}
      {showSidebar && (
        <aside className="hidden w-72 shrink-0 border-l border-border bg-surface-2/60 lg:block">{sidebar}</aside>
      )}
      {showSidebar && sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="منو">
          <button type="button" aria-label="بستن منو" className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-[min(20rem,86vw)] animate-in slide-in-from-right border-l border-border bg-background shadow-elevated duration-200">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={`z-10 flex h-14 shrink-0 items-center gap-2 px-3 sm:px-5 ${isFresh && showSidebar ? "lg:hidden" : "border-b border-border"}`}>
          {showSidebar ? (
            <button type="button" onClick={() => setSidebarOpen(true)} aria-label="باز کردن منو" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden">
              <IconMenu2 size={20} aria-hidden="true" />
            </button>
          ) : null}
          {showSidebar ? (
            <span className="lg:hidden"><BrandLogo size="sm" hideWordmarkOnMobile={Boolean(modeChip)} /></span>
          ) : (
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-solid text-brand-foreground" aria-hidden="true">
                <IconMessageCircle size={17} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-foreground">{brandName}</span>
                <span className="block text-[11px] text-muted-foreground">دستیار هوشمند · آنلاین</span>
              </span>
            </span>
          )}
          {showSidebar && modeChip}
          <div className="mr-auto flex items-center gap-1.5">
            {!showSidebar && <ThemeToggle />}
            {showSidebar && isFresh && <ThemeToggle className="lg:hidden" />}
            {embedded && (
              <button
                type="button"
                onClick={() => window.parent.postMessage({ type: "pixelgenius:close" }, "*")}
                aria-label="بستن چت"
                className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IconX size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </header>

        {!isFresh && <ChatRobot {...robotProps} busy={loading} stage={progressStage} uploading={uploadingFile} sendingOtp={sendingOtp} briefState={briefState} failed={Boolean(error)} input={input} replyKey={messages.at(-1)?.role === "assistant" ? `${messages.length}:${messages.at(-1)?.content}` : ""} waitingForPhone={phoneStep} />}

        <main className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-8 ${isFresh ? "pb-10 pt-6 lg:pt-[9vh]" : "pb-6 pt-10"}`}>
          <div className="mx-auto max-w-2xl">
            {isFresh && !showSidebar ? (
              <section aria-labelledby="widget-greeting" className="flex min-h-full flex-col items-center justify-center pb-6 text-center">
                <h1 className="sr-only">{brandName}</h1>
                <ChatRobot {...robotProps} plain busy={false} stage={null} uploading={uploadingFile} sendingOtp={false} briefState="idle" failed={false} input={input} replyKey="" waitingForPhone={false} />
                <p id="widget-greeting" className="mt-2 max-w-xs whitespace-pre-line text-[15px] leading-8 text-foreground">
                  {messages[0]?.content}
                </p>
                {submittedNotice && (
                  <div role="status" className="mt-6 flex w-full max-w-sm items-start gap-3 rounded-xl border border-success/25 bg-success/10 p-4 text-right">
                    <IconCheck size={20} stroke={2.4} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    <div className="min-w-0 flex-1 text-sm leading-7">
                      <p className="font-bold text-foreground">درخواستت ثبت شد</p>
                      <p className="text-secondary-foreground">{botProfile?.name || "تیم"} به‌زودی بررسیش می‌کنه و باهات در تماس خواهد بود.</p>
                      <a href="/account" target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-bold text-brand underline-offset-4 hover:underline">
                        پیگیری در پنل کاربری
                        <IconChevronLeft size={14} aria-hidden="true" />
                      </a>
                    </div>
                  </div>
                )}
              </section>
            ) : isFresh ? (
              <section aria-labelledby="chat-hero-title">
                <div className="text-center">
                  <h1 id="chat-hero-title" className="text-[1.75rem] font-black leading-[1.4] tracking-tight text-foreground sm:text-4xl sm:leading-[1.35]">
                    {customerName ? `${customerName}، ` : ""}از کجا شروع کنیم؟
                  </h1>
                  <p className="mx-auto mt-3 max-w-md text-[15px] leading-7 text-muted-foreground">
                    ایده‌ات رو تعریف کن تا با هوش مصنوعی به یک پروژه‌ی دقیق و قابل‌ساخت تبدیلش کنیم.
                  </p>
                </div>

                {showSidebar && (
                  <fieldset className="mt-8" data-tour="mode">
                    <legend className="sr-only">حالت گفتگو</legend>
                    <div className="mx-auto grid max-w-md grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
                      {(Object.keys(MODE_CARDS) as ChatMode[]).map((id) => {
                        const Icon = id === "designer" ? IconWand : IconCoin;
                        return (
                          <label key={id} className="cursor-pointer">
                            <input type="radio" name="chat-mode" value={id} checked={mode === id} onChange={() => selectMode(id)} className="peer sr-only" />
                            <span className="flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground peer-checked:bg-surface peer-checked:text-foreground peer-checked:shadow-card dark:peer-checked:bg-foreground/10 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                              <Icon size={18} aria-hidden="true" />
                              {MODE_CARDS[id].label}
                              {MODE_CARDS[id].badge && <span className="hidden rounded-full bg-accent-soft px-1.5 sm:inline text-[10px] font-bold leading-5 text-accent">{MODE_CARDS[id].badge}</span>}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}

                <div className="mt-4 rounded-xl border border-border bg-surface p-4 sm:p-5">
                  <p className="text-sm leading-7 text-secondary-foreground">{MODE_CARDS[activeMode].summary}</p>
                  <ul className="mt-3 space-y-1.5 text-[13px] leading-6 text-muted-foreground">
                    {MODE_CARDS[activeMode].points.map((point) => (
                      <li key={point} className="flex items-start gap-2">
                        <IconCheck size={15} stroke={2.4} className="mt-[5px] shrink-0 text-success" aria-hidden="true" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-4 flex items-start gap-2.5 border-t border-border pt-3.5 text-[13px] leading-6">
                    <IconFileText size={17} className="mt-[3px] shrink-0 text-brand" aria-hidden="true" />
                    <p className="text-secondary-foreground"><b className="text-foreground">خروجی نهایی: </b>{MODE_CARDS[activeMode].output}</p>
                  </div>
                </div>

                {pathPicker}

                <div className="mt-8">
                  {composer}
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {needsProjectPath ? "با انتخاب مسیر پروژه، گفتگو فعال می‌شود." : projectPath === "source" && mode === "designer" ? sourceReady ? "سورس ثبت شد؛ حالا درباره پروژه و هدفت از انتشار بنویس." : "ابتدا لینک GitHub یا فایل ZIP سورس را اضافه کن." : "یا با یکی از نمونه‌ها شروع کن:"}
                  </p>
                  {!(activeMode === "designer" && projectPath === "source") && (
                    <div className="mt-3 flex flex-wrap justify-center gap-2" data-tour="chips">
                      {QUICK_STARTS[activeMode].map((label) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => submit(label)}
                          disabled={isLoading || chatBlocked}
                          className="min-h-9 rounded-full border border-border bg-surface px-3.5 text-[13px] font-bold text-secondary-foreground outline-none transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>


                {!customerToken && (
                  <p className="mt-6 text-center text-[11px] leading-6 text-muted-foreground">
                    چت روی همین مرورگر ذخیره می‌شه. برای ثبت نهایی با شماره موبایل وارد می‌شی.
                  </p>
                )}
              </section>
            ) : (
              <div role="log" aria-live="polite" aria-label="گفتگو">
                {pathPicker}
                {messages.map((m, i) =>
                  i === 0 ? null : <ChatBubble key={i} role={m.role} content={m.content} attachments={m.attachments} />,
                )}
              </div>
            )}

          {briefOrderId && (
            <section
              aria-labelledby="brief-title"
              className="mb-6 animate-fade-up rounded-xl border border-border bg-surface p-5 sm:p-6"
            >
              <h2 id="brief-title" className="text-base font-extrabold text-foreground">
                کانفیگ پروژه‌ات آماده‌ست
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
                این فایل همه‌ی تصمیم‌های طراحی، صفحه‌ها، مدل داده و استک پروژه‌ات رو داره. بده به هوش مصنوعی تا بسازتش.
              </p>

              {briefState === "loading" && (
                <p role="status" className="mt-4 flex items-center gap-2 text-sm text-brand">
                  <span className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent motion-safe:animate-spin" />
                  در حال ساخت کانفیگ پروژه... (ممکنه یکی دو دقیقه طول بکشه)
                </p>
              )}
              {briefState === "error" && (
                <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 text-sm text-danger">
                  <span>ساخت کانفیگ ناموفق بود.</span>
                  <button
                    type="button"
                    onClick={() => loadBrief(briefOrderId, customerToken || localStorage.getItem("customer_token") || "")}
                    className="flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger outline-none transition-colors hover:bg-danger/15 focus-visible:ring-2 focus-visible:ring-danger"
                  >
                    <IconRefresh size={14} stroke={2.2} />
                    تلاش دوباره
                  </button>
                </div>
              )}
              {briefState === "ready" && (
                <button
                  type="button"
                  onClick={downloadBrief}
                  className="mt-4 flex min-h-11 items-center gap-2 rounded-lg bg-brand-solid px-5 text-sm font-bold text-brand-foreground outline-none transition-colors hover:bg-brand-solid/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <IconDownload size={18} stroke={2.2} />
                  دانلود کانفیگ پروژه (JSON)
                </button>
              )}

              <div className="mt-5 rounded-lg border border-border bg-surface-2 p-4 text-sm leading-7 text-secondary-foreground">
                <p className="font-semibold text-foreground">برای بهترین نتیجه</p>
                <p className="mt-1">
                  فایل رو توی یک ابزار کدنویسی مثل <b>Claude Code</b>، <b>Codex</b> یا <b>Cursor</b> باز کن؛ این ابزارها فایل‌ها رو کامل می‌سازن و اجرا می‌کنن، برای همین بک‌اند و دیتابیس هم واقعی ساخته می‌شه.
                </p>
                <p className="mt-2 text-warning">
                  حتماً نسخه‌ی <b>Pro</b> (اشتراک پولی) رو بگیر؛ نسخه‌ی رایگان برای ساخت یک پروژه کامل محدودیت داره و وسط کار متوقف می‌شه.
                </p>
              </div>

              {briefState === "ready" && (
                <BriefGuide
                  mcpUrl={((brief?.deploy as { mcp_server_url?: string } | undefined)?.mcp_server_url) || ""}
                />
              )}

              <Link
                href={`/panel/${briefOrderId}`}
                className="mt-4 inline-block text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                مشاهده سفارش در پنل کاربری
              </Link>
            </section>
          )}

          {isLoading && !isFresh && (
            <div className="mb-6 flex items-center gap-3" role="status" aria-label="در حال نوشتن">
              <BrandMark size="sm" />
              <div className="flex items-center gap-2 py-2">
                <span className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full bg-brand-solid motion-safe:animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }}
                    />
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {uploadingFile ? "در حال آپلود فایل..." : "در حال نوشتن..."}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger"
            >
              <span>{error}</span>
              {lastAttemptRef.current && !phoneStep && (
                <button
                  type="button"
                  onClick={retry}
                  disabled={loading}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-xs font-semibold text-danger outline-none transition-colors hover:bg-danger/15 focus-visible:ring-2 focus-visible:ring-danger disabled:opacity-50"
                >
                  <IconRefresh size={14} stroke={2.2} />
                  تلاش دوباره
                </button>
              )}
            </div>
          )}
            <div ref={bottomRef} />
          </div>
        </main>

        {(!isFresh || !showSidebar) && (
          <footer className="shrink-0 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 md:px-8">
            <div className="mx-auto max-w-2xl">{composer}</div>
          </footer>
        )}
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
