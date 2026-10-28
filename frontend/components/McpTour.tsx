"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconArrowLeft,
  IconArrowRight,
  IconBrandOpenai,
  IconCheck,
  IconChevronLeft,
  IconCircleCheck,
  IconCode,
  IconCopy,
  IconDownload,
  IconLoader2,
  IconPlugConnected,
  IconRefresh,
  IconRocket,
  IconSparkles,
  IconTerminal2,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { checkMcpServer, fetchMcpInfo, Order } from "@/lib/api";

export const BUILD_PROMPT =
  "فایل project-brief.json توی همین پوشه‌ست. کامل بخونش و پروژه رو دقیقاً طبق اون بساز. اگر ابزار deploy_project در دسترسه، در پایان پروژه رو روی سرور منتشر کن، تا آماده شدن وضعیتش رو چک کن، خطاها رو خودت درست کن و آدرس نهایی رو بهم بده. اگر ابزار وصل نیست، دستور اجرای محلی رو بنویس.";

const TEST_PROMPT = "ابزارهای FreelioAI رو لیست کن و بگو هر کدوم چه کاری انجام می‌ده.";

export function CopyBlock({ text, label, rtl = false }: { text: string; label: string; rtl?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked: the text stays selectable
    }
  }
  return (
    <div className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-2.5">
      <pre
        dir={rtl ? "rtl" : "ltr"}
        className={`min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap text-xs leading-6 text-foreground ${
          rtl ? "text-right font-[inherit]" : "break-all text-left"
        }`}
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs font-bold text-secondary-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {copied ? <IconCheck size={14} stroke={2.5} className="text-success" aria-hidden="true" /> : <IconCopy size={14} stroke={2} aria-hidden="true" />}
        {copied ? "کپی شد" : "کپی"}
      </button>
    </div>
  );
}

type ToolId = "claude" | "claude-code" | "chatgpt" | "cursor";

interface ToolGuide {
  id: ToolId;
  name: string;
  hint: string;
  icon: typeof IconSparkles;
  /** Click path inside the tool's settings, shown as a breadcrumb of buttons. */
  path?: string[];
  steps: ReactNode[];
  extra?: (url: string) => ReactNode;
  note?: string;
}

const TOOLS: ToolGuide[] = [
  {
    id: "claude",
    name: "Claude",
    hint: "وب یا اپ دسکتاپ",
    icon: IconSparkles,
    path: ["Customize", "Connectors", "+", "Add custom connector"],
    steps: [
      <>توی Claude برو به <b>Customize</b> و بخش <b>Connectors</b> رو باز کن.</>,
      <>دکمه‌ی <b>+</b> و بعد <b>Add custom connector</b> رو بزن.</>,
      <>اسم و آدرس سرور رو از پایین کپی کن؛ بقیه‌ی فیلدها رو خالی بذار و <b>Add</b> رو بزن.</>,
      <>توی یک چت جدید، از منوی ابزارها مطمئن شو <b>FreelioAI</b> فعاله.</>,
    ],
  },
  {
    id: "claude-code",
    name: "Claude Code",
    hint: "ترمینال",
    icon: IconTerminal2,
    steps: [
      <>ترمینال رو توی پوشه‌ی پروژه باز کن.</>,
      <>دستور زیر رو اجرا کن تا سرور اضافه بشه.</>,
      <>Claude Code رو باز کن و با <b>/mcp</b> ببین FreelioAI وصل شده.</>,
    ],
    extra: (url) => <CopyBlock text={`claude mcp add --transport http FreelioAI ${url}`} label="کپی دستور افزودن سرور" />,
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    hint: "حالت توسعه‌دهنده",
    icon: IconBrandOpenai,
    path: ["Settings", "Apps & Connectors", "Advanced", "Developer Mode"],
    steps: [
      <>توی ChatGPT برو به <b>Settings ← Apps &amp; Connectors ← Advanced</b> و <b>Developer Mode</b> رو روشن کن.</>,
      <><b>Create</b> رو بزن تا یک connector جدید بسازی.</>,
      <>اسم و آدرس رو بده و احراز هویت رو روی <b>No authentication</b> بذار.</>,
      <>توی چت جدید، از منوی ابزارها <b>FreelioAI</b> رو فعال کن.</>,
    ],
    note: "Developer Mode بسته به پلن ممکنه در دسترس نباشه؛ اگه گزینه رو ندیدی، از Claude یا Cursor استفاده کن.",
  },
  {
    id: "cursor",
    name: "Cursor / Codex",
    hint: "ویرایشگر کد",
    icon: IconCode,
    path: ["Settings", "MCP", "Add new MCP server"],
    steps: [
      <>توی Cursor برو به <b>Settings ← MCP</b> و <b>Add new MCP server</b> رو بزن.</>,
      <>نوع سرور رو <b>URL / HTTP</b> بذار و آدرس سرور رو وارد کن.</>,
      <>یا فایل <b>.cursor/mcp.json</b> رو با محتوای زیر بساز.</>,
    ],
    extra: (url) => (
      <CopyBlock text={JSON.stringify({ mcpServers: { FreelioAI: { url } } }, null, 2)} label="کپی تنظیمات mcp.json" />
    ),
    note: "Codex و ابزارهای مشابه هم توی بخش تنظیمات MCP خودشون همین آدرس رو می‌پذیرن.",
  },
];

const TOOL_LABELS: Record<string, string> = {
  publish_site: "انتشار سایت استاتیک و گرفتن لینک پیش‌نمایش",
  get_site: "بررسی وضعیت سایت منتشرشده",
  delete_site: "حذف سایت پیش‌نمایش",
  deploy_project: "بیلد و استقرار پروژه‌ی کامل با دیتابیس",
  get_deploy_status: "پیگیری بیلد و خواندن لاگ خطاها",
  delete_deploy: "حذف استقرار پروژه",
  get_workspace: "خواندن فضای پروژه و مرحله‌ی فعلی",
  report_output: "ارسال طراحی و نسخه‌ها برای بازبینی تو",
  report_activity: "گزارش پیشرفت کار در فضای پروژه",
  update_feedback: "به‌روزرسانی وضعیت نظرهای تو",
  save_admin_credentials: "تحویل اطلاعات ورود پنل ادمین",
};

const STEPS = ["معرفی", "انتخاب ابزار", "افزودن سرور", "تست اتصال", "شروع ساخت"];
const STORAGE_KEY = "mcp_tour";

interface TourState {
  step: number;
  tool: ToolId | null;
  done: boolean;
}

function readState(): TourState {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Partial<TourState>;
    return {
      step: typeof parsed.step === "number" ? Math.min(Math.max(parsed.step, 0), STEPS.length - 1) : 0,
      tool: TOOLS.some((t) => t.id === parsed.tool) ? (parsed.tool as ToolId) : null,
      done: Boolean(parsed.done),
    };
  } catch {
    return { step: 0, tool: null, done: false };
  }
}

export function isMcpTourDone() {
  return readState().done;
}

function PathTrail({ items }: { items: string[] }) {
  return (
    <div dir="ltr" className="flex flex-wrap items-center justify-end gap-1.5" aria-label={`مسیر: ${items.join(" ، ")}`}>
      {items.map((item, i) => (
        <span key={item} className="flex items-center gap-1.5">
          {i > 0 && <IconChevronLeft size={14} className="rotate-180 text-muted-foreground" aria-hidden="true" />}
          <span className="rounded-md border border-input bg-surface px-2 py-1 font-mono text-[11px] font-bold text-foreground shadow-xs">{item}</span>
        </span>
      ))}
    </div>
  );
}

function FlowDiagram() {
  const node = "flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-3 py-4 text-center";
  return (
    <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2" aria-hidden="true">
      <div className={node}>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-foreground"><IconSparkles size={20} /></span>
        <span className="text-xs font-bold">ابزار AI تو</span>
      </div>
      <IconArrowLeft size={18} className="text-muted-foreground" />
      <div className={cn(node, "border-brand-line")}>
        <BrandMark size="md" />
        <span className="text-xs font-bold">سرور FreelioAI</span>
      </div>
      <IconArrowLeft size={18} className="text-muted-foreground" />
      <div className={node}>
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-success/10 text-success"><IconWorld size={20} /></span>
        <span className="text-xs font-bold">سایت زنده</span>
      </div>
    </div>
  );
}

export default function McpTour({ designOrders }: { designOrders: Order[] }) {
  const [state, setState] = useState<TourState>({ step: 0, tool: null, done: false });
  const [mcpUrl, setMcpUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [check, setCheck] = useState<{ status: "idle" | "loading" | "ok" | "error"; tools: string[]; message: string }>({
    status: "idle",
    tools: [],
    message: "",
  });

  useEffect(() => {
    setState(readState());
    fetchMcpInfo()
      .then((info) => setMcpUrl(info.mcp_server_url))
      .catch((err) => setUrlError(err instanceof Error ? err.message : "دریافت آدرس سرور ناموفق بود"));
  }, []);

  function update(patch: Partial<TourState>) {
    setState((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage blocked: progress just isn't remembered
      }
      return next;
    });
  }

  async function runCheck() {
    if (!mcpUrl) return;
    setCheck({ status: "loading", tools: [], message: "" });
    try {
      const result = await checkMcpServer(mcpUrl);
      setCheck({ status: "ok", tools: result.tools, message: "" });
    } catch (err) {
      setCheck({ status: "error", tools: [], message: err instanceof Error ? err.message : "اتصال برقرار نشد" });
    }
  }

  const tool = TOOLS.find((t) => t.id === state.tool) || null;
  const { step } = state;
  const canNext = step !== 1 || Boolean(tool);
  const isLast = step === STEPS.length - 1;

  const urlBlock = urlError ? (
    <p role="alert" className="mt-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{urlError}</p>
  ) : mcpUrl ? (
    <CopyBlock text={mcpUrl} label="کپی آدرس سرور" />
  ) : (
    <div className="mt-2 h-12 animate-pulse rounded-lg bg-surface-2" />
  );

  return (
    <div className="space-y-6">
      {state.done && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm">
          <IconCircleCheck size={20} className="shrink-0 text-success" aria-hidden="true" />
          <p className="flex-1 font-bold text-foreground">اتصال رو قبلاً راه انداختی. هر وقت خواستی، مراحل رو دوباره مرور کن.</p>
          <Button variant="ghost" size="sm" onClick={() => update({ step: 0, done: false })}>
            <IconRefresh size={15} aria-hidden="true" />
            شروع دوباره
          </Button>
        </div>
      )}

      <ol className="grid grid-cols-5 gap-2" aria-label="مراحل راه‌اندازی">
        {STEPS.map((label, i) => {
          const complete = i < step || state.done;
          const current = i === step;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => (i <= step || state.done ? update({ step: i }) : undefined)}
                disabled={i > step && !state.done}
                aria-current={current ? "step" : undefined}
                className="group w-full text-right outline-none disabled:cursor-not-allowed"
              >
                <span className={cn("block h-1 rounded-full transition-colors", complete || current ? "bg-brand-solid" : "bg-foreground/10")} />
                <span
                  className={cn(
                    "mt-2 hidden items-center gap-1.5 text-xs font-bold sm:flex",
                    current ? "text-foreground" : complete ? "text-secondary-foreground" : "text-muted-foreground"
                  )}
                >
                  {complete && !current ? <IconCheck size={13} stroke={2.6} className="text-success" aria-hidden="true" /> : <span className="tabular-nums">{(i + 1).toLocaleString("fa-IR")}.</span>}
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <section aria-live="polite" className="animate-fade-up rounded-xl border border-border bg-surface" key={step}>
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <p className="eyebrow">مرحله {(step + 1).toLocaleString("fa-IR")} از {STEPS.length.toLocaleString("fa-IR")}</p>
          <h2 className="mt-1 text-lg font-black text-foreground">
            {[
              "هوش مصنوعی‌ات رو به FreelioAI وصل کن",
              "با کدوم ابزار کار می‌کنی؟",
              tool ? `افزودن سرور به ${tool.name}` : "افزودن سرور",
              "اتصال رو امتحان کن",
              "اولین پروژه رو بساز و منتشر کن",
            ][step]}
          </h2>
        </div>

        <div className="px-5 py-6 sm:px-6">
          {step === 0 && (
            <div className="space-y-6">
              <p className="text-sm leading-8 text-secondary-foreground">
                با این اتصال (MCP)، ابزار هوش مصنوعی‌ای که باهاش کد می‌نویسی مستقیم به FreelioAI دسترسی پیدا می‌کنه:
                پروژه رو از روی کانفیگت می‌سازه، خودش روی سرور <b>بیلد و منتشر</b> می‌کنه و یک لینک زنده بهت می‌ده.
              </p>
              <FlowDiagram />
              <ul className="grid gap-3 sm:grid-cols-3">
                {[
                  { icon: IconRocket, title: "انتشار خودکار", body: "Next.js، Node، Python و Django با PostgreSQL" },
                  { icon: IconRefresh, title: "رفع خطای خودکار", body: "لاگ بیلد رو می‌خونه و خودش اصلاح می‌کنه" },
                  { icon: IconPlugConnected, title: "یک‌بار تنظیم", body: "حدود ۳ دقیقه؛ برای همه‌ی پروژه‌ها کار می‌کنه" },
                ].map((item) => (
                  <li key={item.title} className="rounded-xl bg-surface-2 p-4">
                    <item.icon size={20} className="text-brand" aria-hidden="true" />
                    <p className="mt-2 text-sm font-bold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs leading-6 text-muted-foreground">{item.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step === 1 && (
            <fieldset>
              <legend className="sr-only">انتخاب ابزار</legend>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {TOOLS.map((item) => {
                  const checked = state.tool === item.id;
                  return (
                    <label key={item.id} className="cursor-pointer">
                      <input type="radio" name="mcp-tool" value={item.id} checked={checked} onChange={() => update({ tool: item.id })} className="peer sr-only" />
                      <span className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-foreground/30 peer-checked:border-foreground peer-checked:shadow-[inset_0_0_0_1px_hsl(var(--foreground))] peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-foreground">
                          <item.icon size={20} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-foreground">{item.name}</span>
                          <span className="block text-xs text-muted-foreground">{item.hint}</span>
                        </span>
                        <span aria-hidden="true" className={cn("grid h-5 w-5 place-items-center rounded-full border", checked ? "border-foreground bg-foreground text-background" : "border-input")}>
                          {checked && <IconCheck size={12} stroke={3} />}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-4 text-xs leading-6 text-muted-foreground">برای ساخت کامل پروژه، اشتراک <b>Pro</b> ابزار لازمه؛ نسخه‌ی رایگان وسط کار متوقف می‌شه.</p>
            </fieldset>
          )}

          {step === 2 && tool && (
            <div className="space-y-6">
              {tool.path && (
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="mb-3 text-xs font-bold text-muted-foreground">مسیر داخل {tool.name}</p>
                  <PathTrail items={tool.path} />
                </div>
              )}
              <ol className="space-y-4">
                {tool.steps.map((content, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">
                      {(i + 1).toLocaleString("fa-IR")}
                    </span>
                    <p className="flex-1 text-sm leading-7 text-secondary-foreground">{content}</p>
                  </li>
                ))}
              </ol>
              {tool.extra && mcpUrl && tool.extra(mcpUrl)}
              {tool.id !== "claude-code" && (
                <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">اسم</p>
                    <CopyBlock text="FreelioAI" label="کپی اسم کانکتور" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground">آدرس سرور</p>
                    {urlBlock}
                  </div>
                </div>
              )}
              {tool.note && <p className="rounded-lg bg-warning/10 px-3 py-2.5 text-xs leading-6 text-warning">{tool.note}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-foreground">۱. سرور در دسترسه؟</p>
                    <p className="mt-0.5 text-xs leading-6 text-muted-foreground">همون درخواستی رو می‌فرستیم که ابزار هوش مصنوعی‌ات موقع اتصال می‌فرسته.</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={runCheck} disabled={!mcpUrl || check.status === "loading"}>
                    {check.status === "loading" ? <IconLoader2 size={15} className="motion-safe:animate-spin" aria-hidden="true" /> : <IconPlugConnected size={15} aria-hidden="true" />}
                    {check.status === "loading" ? "در حال بررسی…" : "تست سرور"}
                  </Button>
                </div>
                <div role="status" aria-live="polite">
                  {check.status === "ok" && (
                    <div className="mt-4 border-t border-border pt-4">
                      <p className="flex items-center gap-2 text-sm font-bold text-success">
                        <IconCircleCheck size={18} aria-hidden="true" />
                        سرور آماده‌ست — {check.tools.length.toLocaleString("fa-IR")} ابزار در دسترسه
                      </p>
                      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                        {check.tools.map((name) => (
                          <li key={name} className="rounded-lg bg-surface-2 px-3 py-2 text-xs">
                            <span dir="ltr" className="font-mono font-bold text-foreground">{name}</span>
                            <span className="mt-0.5 block text-muted-foreground">{TOOL_LABELS[name] || "ابزار سرور FreelioAI"}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {check.status === "error" && (
                    <p className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-danger">
                      <IconX size={17} aria-hidden="true" />
                      {check.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-border p-4">
                <p className="text-sm font-bold text-foreground">۲. ابزارت سرور رو می‌بینه؟</p>
                <p className="mt-0.5 text-xs leading-6 text-muted-foreground">این پیام رو توی {tool?.name || "ابزار هوش مصنوعی‌ات"} بفرست؛ باید لیست ابزارهای FreelioAI رو جواب بده.</p>
                <CopyBlock text={TEST_PROMPT} label="کپی پیام تست" rtl />
                <p className="mt-3 text-xs leading-6 text-muted-foreground">
                  جواب نداد؟ ابزار رو یک‌بار ببند و باز کن و مطمئن شو FreelioAI توی منوی ابزارها روشنه.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <ol className="space-y-4 text-sm leading-7 text-secondary-foreground">
                <li className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">۱</span>
                  <span className="flex-1">کانفیگ پروژه (<b dir="ltr">project-brief.json</b>) رو دانلود کن و توی یک پوشه‌ی خالی بذار.</span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">۲</span>
                  <span className="flex-1">
                    ابزارت رو توی همون پوشه باز کن و این پیام رو بهش بده:
                    <CopyBlock text={BUILD_PROMPT} label="کپی پیام ساخت پروژه" rtl />
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-bold text-background">۳</span>
                  <span className="flex-1">پیشرفت کار رو توی فضای پروژه ببین؛ آخرش لینک زنده‌ی سایت رو می‌گیری.</span>
                </li>
              </ol>

              <div>
                <p className="eyebrow mb-2">پروژه‌هات</p>
                {designOrders.length > 0 ? (
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {designOrders.slice(0, 5).map((order) => (
                      <li key={order.id} className="flex items-center gap-3 px-4 py-3">
                        <p className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">{order.project_name}</p>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/chat?brief=${order.id}`}>
                            <IconDownload size={15} aria-hidden="true" />
                            کانفیگ
                          </Link>
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-input p-5 text-center">
                    <p className="text-sm text-muted-foreground">هنوز پروژه‌ی طراحی نداری؛ اول با طراح محصول کانفیگش رو بساز.</p>
                    <Button asChild size="sm" className="mt-3">
                      <Link href="/chat?new=1" onClick={() => localStorage.setItem("chat_mode", "designer")}>گفتگو با طراح محصول</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-2/60 px-5 py-4 sm:px-6">
          <Button variant="ghost" onClick={() => update({ step: step - 1 })} disabled={step === 0}>
            <IconArrowRight size={17} aria-hidden="true" />
            قبلی
          </Button>
          {isLast ? (
            <Button variant={state.done ? "outline" : "brand"} onClick={() => update({ done: true })} disabled={state.done}>
              <IconCheck size={17} aria-hidden="true" />
              {state.done ? "تکمیل شد" : "تموم شد"}
            </Button>
          ) : (
            <Button onClick={() => update({ step: step + 1 })} disabled={!canNext}>
              {step === 0 ? "شروع راه‌اندازی" : "بعدی"}
              <IconArrowLeft size={17} aria-hidden="true" />
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
