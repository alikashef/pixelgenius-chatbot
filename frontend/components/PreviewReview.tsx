"use client";

import { FormEvent, KeyboardEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconArrowBackUp,
  IconArrowUp,
  IconArrowUpRight,
  IconCheck,
  IconClockHour4,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconLoader2,
  IconMessageCirclePlus,
  IconPointer,
  IconRefresh,
  IconRobot,
  IconWorld,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkspaceComment, WorkspaceVersion } from "@/lib/api";

/** A task pinned to an element: its page, CSS selector and HTML tag go to the agent with the request. */
export interface NewComment {
  page: string;
  selector: string;
  html: string;
  text: string;
}

/** The picked element and where it sits in the preview's viewport (CSS px), to anchor the task box on it. */
type Rect = { left: number; top: number; width: number; height: number; vw: number; vh: number; rtl: boolean };
type Draft = Omit<NewComment, "text"> & { label: string; rect: Rect };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rectOf = (d: Record<string, unknown>): Rect => ({ left: num(d.left), top: num(d.top), width: num(d.width), height: num(d.height), vw: num(d.vw) || 1, vh: num(d.vh) || 1, rtl: Boolean(d.rtl) });

const DEVICES = [
  { id: "desktop", label: "دسکتاپ", icon: IconDeviceDesktop, width: "100%" },
  { id: "tablet", label: "تبلت", icon: IconDeviceTablet, width: "820px" },
  { id: "mobile", label: "موبایل", icon: IconDeviceMobile, width: "390px" },
] as const;

// Agent-driven lifecycle: open (queued for the agent) → in_progress → review (owner checks) → approved.
const STATUS: Record<WorkspaceComment["status"], { label: string; tone: string }> = {
  open: { label: "در صف ایجنت", tone: "bg-warning/10 text-warning" },
  in_progress: { label: "ایجنت در حال اصلاح", tone: "bg-info/10 text-info" },
  review: { label: "منتظر بازبینی تو", tone: "bg-brand-soft text-brand" },
  approved: { label: "تأییدشده", tone: "bg-success/10 text-success" },
};

// The picker inside the preview (backend/review_bridge.js) has this long to say hello before the preview counts as failed.
const BRIDGE_TIMEOUT_MS = 12000;

function reviewUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("pg_review", "1");
    return u.toString();
  } catch {
    return url;
  }
}

/** What the owner pastes into the same AI chat that built the project; the agent then reads the tasks over MCP. */
function agentPrompt(projectName: string, versionNumber: number) {
  return `تغییراتی که برای پروژه‌ی «${projectName}» (نسخه ${versionNumber}) توی PixelGenius ثبت کردم رو بخون و درستش کن.
با get_workspace از سرور PixelGenius لیست tasks رو بگیر و یکی‌یکی اصلاح کن: اول update_feedback با in_progress، بعد از اصلاح update_feedback با review و یک note کوتاه از کاری که کردی. آخر کار نسخه‌ی جدید رو با report_output ثبت کن.`;
}

/**
 * Review the project's own published site like a design tool: it loads by itself, annotate mode pins tasks on
 * elements, and the tasks list in a table that the agent works through over MCP. Only this project's site is shown.
 */
export default function PreviewReview({
  projectName,
  version,
  url,
  siteState,
  expiresAt,
  comments,
  busy,
  header,
  onAdd,
  onStatus,
}: {
  projectName: string;
  /** The version tasks attach to; without one the site can be viewed but not annotated. */
  version?: WorkspaceVersion;
  /** The project's published site. */
  url?: string;
  siteState: string;
  expiresAt?: number;
  comments: WorkspaceComment[];
  busy: boolean;
  header?: ReactNode;
  onAdd: (comment: NewComment) => Promise<boolean>;
  onStatus: (id: string, status: WorkspaceComment["status"]) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [annotating, setAnnotating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bridge, setBridge] = useState<"loading" | "ready" | "failed" | "dismissed">("loading");
  const [text, setText] = useState("");
  const [activeId, setActiveId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const width = DEVICES.find((d) => d.id === device)!.width;
  const numbered = useMemo(() => comments.map((c, i) => ({ ...c, n: i + 1 })), [comments]);
  const openCount = numbered.filter((c) => c.status === "open").length;
  const canAnnotate = Boolean(version) && bridge === "ready";

  async function copyPrompt() {
    if (!version) return;
    try {
      await navigator.clipboard.writeText(agentPrompt(projectName, version.number));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing to undo.
    }
  }

  // The picker says hello once the page is in; silence means the preview could not load inside the panel.
  useEffect(() => {
    if (!url) return;
    setBridge("loading");
    const timer = setTimeout(() => setBridge((b) => (b === "loading" ? "failed" : b)), BRIDGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [url, reloadKey]);

  // Keep the picker in sync with annotate mode and the pins.
  useEffect(() => {
    const pins = numbered.filter((c) => c.selector).map((c) => ({ n: c.n, selector: c.selector, page: c.page, active: c.id === activeId }));
    const send = () => frame.current?.contentWindow?.postMessage({ type: "workspace-annotate", on: annotating, composing: Boolean(draft), pins }, "*");
    send();
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "workspace-ready") {
        setBridge("ready");
        send();
      }
      if (event.data?.type === "workspace-element" && annotating && !draft && typeof event.data.selector === "string") {
        setDraft({
          page: String(event.data.page || "/").slice(0, 2000),
          selector: event.data.selector.slice(0, 1000),
          html: String(event.data.html || "").slice(0, 2000),
          label: String(event.data.label || "").slice(0, 80),
          rect: rectOf(event.data),
        });
      }
      if (event.data?.type === "workspace-rect") setDraft((d) => (d ? { ...d, rect: rectOf(event.data) } : d));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [annotating, draft, numbered, activeId, reloadKey]);

  useEffect(() => {
    setDraft(null);
    setText("");
    setActiveId("");
  }, [version?.id]);

  useEffect(() => {
    if (!canAnnotate) setAnnotating(false);
  }, [canAnnotate]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || !text.trim()) return;
    const { page, selector, html } = draft;
    if (await onAdd({ page, selector, html, text: text.trim() })) {
      setDraft(null);
      setText("");
    }
  }

  function composerKeys(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") setDraft(null);
  }

  // The task box hangs from the picked element's start corner (top-right on RTL pages): above it when there is room,
  // otherwise below, and always inside the preview so the element itself stays visible.
  const anchor = draft
    ? (() => {
        const { left, top, width: w, height: h, vw, vh, rtl } = draft.rect;
        const width = Math.min(360, vw - 16);
        const clampX = (x: number) => Math.min(Math.max(x, 8), vw - width - 8);
        const corner = rtl ? left + w : left;
        const above = top - 52;
        const below = top + h + 8;
        const boxTop = above >= 8 ? above : below + 44 <= vh ? below : Math.min(Math.max(top + 8, 8), vh - 52);
        return {
          dot: { left: Math.min(Math.max(corner - 7, 2), vw - 16), top: Math.min(Math.max(top - 7, 2), vh - 16) },
          box: { left: clampX(rtl ? corner - width : corner), top: boxTop, width },
        };
      })()
    : null;

  const host = url?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const daysLeft = expiresAt ? Math.ceil((expiresAt * 1000 - Date.now()) / 86400000) : null;
  const iconButton =
    "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-5">
      <section aria-label="پیش‌نمایش سایت" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {header && <div className="border-b border-border px-4 py-3 sm:px-5">{header}</div>}

        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2/60 px-3 py-2">
          <div className="flex h-9 min-w-0 flex-1 basis-56 items-center gap-2 rounded-lg border border-border bg-surface px-3">
            <span
              className={cn("h-2 w-2 shrink-0 rounded-full", url ? (bridge === "failed" ? "bg-warning" : "bg-success") : "bg-muted-foreground/40")}
              aria-hidden="true"
            />
            <span dir="ltr" className="min-w-0 flex-1 truncate text-left font-mono text-[12px] text-secondary-foreground">
              {host || "هنوز منتشر نشده"}
            </span>
            {daysLeft !== null && daysLeft > 0 && (
              <span className="hidden shrink-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <IconClockHour4 size={13} aria-hidden="true" />
                {daysLeft.toLocaleString("fa-IR")} روز مهلت
              </span>
            )}
          </div>
          <div role="radiogroup" aria-label="اندازه‌ی نمایش" className="flex rounded-lg border border-border bg-surface p-0.5">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={device === d.id}
                aria-label={d.label}
                title={d.label}
                onClick={() => setDevice(d.id)}
                className={cn(
                  "grid h-8 w-8 place-items-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  device === d.id ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <d.icon size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" disabled={!url} onClick={() => setReloadKey((k) => k + 1)} aria-label="بارگذاری دوباره" title="بارگذاری دوباره" className={cn(iconButton, "disabled:opacity-40")}>
            <IconRefresh size={16} aria-hidden="true" />
          </button>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" aria-label="باز کردن سایت در تب جدید" title="باز کردن در تب جدید" className={iconButton}>
              <IconArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          <Button
            type="button"
            size="sm"
            className="h-9"
            variant={annotating ? "default" : "outline"}
            disabled={!canAnnotate}
            title={!version ? "یادداشت‌گذاری بعد از ثبت اولین نسخه توسط ایجنت فعال می‌شود" : bridge !== "ready" ? "اول باید سایت در پیش‌نمایش بارگذاری شود" : undefined}
            onClick={() => {
              setAnnotating((v) => !v);
              setDraft(null);
            }}
            aria-pressed={annotating}
          >
            <IconMessageCirclePlus size={16} aria-hidden="true" />
            {annotating ? "پایان یادداشت‌گذاری" : "یادداشت‌گذاری"}
          </Button>
        </div>

        {annotating && (
          <p className="flex items-center gap-2 border-b border-border bg-brand-soft px-4 py-2 text-xs text-brand">
            <IconPointer size={15} aria-hidden="true" />
            روی هر المانی که می‌خوای تغییر کنه کلیک کن؛ تگ HTML همون المان با تسک برای ایجنت فرستاده می‌شه. Esc برای لغو.
          </p>
        )}
        {url && !version && (
          <p className="border-b border-border bg-surface-2/60 px-4 py-2 text-xs text-muted-foreground">
            سایت منتشر شده؛ یادداشت‌گذاری بعد از این‌که ایجنت اولین نسخه رو با MCP ثبت کنه فعال می‌شه.
          </p>
        )}

        <div className="bg-dots bg-surface-2 p-2 sm:p-4">
          {url ? (
            <div className="relative mx-auto transition-[width] duration-200 motion-reduce:transition-none" style={{ width, maxWidth: "100%" }}>
              <iframe
                key={`${url}-${reloadKey}`}
                ref={frame}
                title={`پیش‌نمایش ${projectName}`}
                src={reviewUrl(url)}
                sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                referrerPolicy="no-referrer"
                aria-busy={bridge === "loading"}
                className="block h-[min(76vh,760px)] min-h-[480px] w-full rounded-xl border border-border bg-background shadow-card"
              />

              {bridge === "loading" && (
                <div role="status" className="absolute inset-0 grid place-items-center rounded-xl bg-background/90">
                  <div className="text-center">
                    <IconLoader2 size={26} className="mx-auto mb-3 animate-spin text-brand motion-reduce:animate-none" aria-hidden="true" />
                    <p className="text-sm font-bold text-foreground">در حال باز کردن سایت…</p>
                    <p dir="ltr" className="mt-1 font-mono text-[11px] text-muted-foreground">{host}</p>
                  </div>
                </div>
              )}

              {bridge === "failed" && (
                <div role="alert" className="absolute inset-0 grid place-items-center rounded-xl bg-background/95 p-6">
                  <div className="max-w-sm text-center">
                    <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-warning/10 text-warning">
                      <IconAlertTriangle size={22} aria-hidden="true" />
                    </span>
                    <p className="text-sm font-bold text-foreground">سایت داخل پنل باز نشد</p>
                    <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                      ممکنه سایت هنوز در حال آماده‌شدن باشه یا مهلتش تموم شده باشه. دوباره امتحان کن یا سایت رو در تب جدید ببین.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <Button type="button" size="sm" onClick={() => setReloadKey((k) => k + 1)}>
                        <IconRefresh size={15} aria-hidden="true" />
                        تلاش دوباره
                      </Button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-bold text-foreground outline-none transition-colors hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <IconArrowUpRight size={15} aria-hidden="true" />
                        تب جدید
                      </a>
                    </div>
                    <button type="button" onClick={() => setBridge("dismissed")} className="mt-3 rounded text-xs font-bold text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring">
                      نمایش همین‌جا بدون یادداشت‌گذاری
                    </button>
                  </div>
                </div>
              )}

              {draft && anchor && (
                <>
                  <span
                    aria-hidden="true"
                    style={{ left: anchor.dot.left + 1, top: anchor.dot.top + 1 }}
                    className="pointer-events-none absolute z-20 h-3.5 w-3.5 rounded-full border-2 border-background bg-info shadow-card"
                  />
                  <form
                    onSubmit={submit}
                    dir="rtl"
                    style={{ left: anchor.box.left + 1, top: anchor.box.top + 1, width: anchor.box.width }}
                    className="absolute z-20 flex h-11 items-center gap-1.5 rounded-full bg-foreground py-1 pe-1.5 ps-1.5 text-background shadow-elevated animate-in fade-in zoom-in-95 duration-150"
                  >
                    <button type="button" onClick={() => setDraft(null)} aria-label="لغو" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-background/70 outline-none transition-colors hover:bg-background/10 hover:text-background focus-visible:ring-2 focus-visible:ring-ring">
                      <IconX size={15} aria-hidden="true" />
                    </button>
                    {draft.label && (
                      <code dir="ltr" title={draft.html} className="hidden max-w-[110px] shrink-0 truncate rounded-full bg-background/10 px-2 font-mono text-[11px] leading-6 text-background/80 sm:block">
                        {draft.label}
                      </code>
                    )}
                    <input
                      autoFocus
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={composerKeys}
                      maxLength={5000}
                      placeholder="چی باید تغییر کنه؟"
                      aria-label={`تسک برای ${draft.label || "المان انتخاب‌شده"}`}
                      className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-background outline-none placeholder:text-background/55"
                    />
                    <button
                      type="submit"
                      disabled={busy || !text.trim()}
                      aria-label="ثبت تسک"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground outline-none transition-opacity hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    >
                      <IconArrowUp size={16} stroke={2.4} aria-hidden="true" />
                    </button>
                  </form>
                </>
              )}
            </div>
          ) : (
            <div className="grid min-h-[420px] place-items-center p-6 text-center">
              <div className="max-w-sm">
                <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface text-muted-foreground shadow-card">
                  {["PREPARING", "UPLOADING", "QUEUED", "BUILDING", "DEPLOYING"].includes(siteState) ? (
                    <IconLoader2 size={22} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <IconWorld size={22} aria-hidden="true" />
                  )}
                </span>
                <p className="text-sm font-bold text-foreground">
                  {siteState === "EXPIRED"
                    ? "مهلت سایت این پروژه تموم شده"
                    : ["PREPARING", "UPLOADING", "QUEUED", "BUILDING", "DEPLOYING"].includes(siteState)
                      ? "سایت در حال انتشاره"
                      : "سایت این پروژه هنوز منتشر نشده"}
                </p>
                <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                  {siteState === "EXPIRED"
                    ? "از «سایت‌ها و دامنه» تمدیدش کن تا پیش‌نمایش دوباره این‌جا باز بشه."
                    : "وقتی ایجنت پروژه رو منتشر کنه، سایت خودکار همین‌جا باز می‌شه."}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="notes-title" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <h3 id="notes-title" className="flex items-center gap-2 text-sm font-bold text-foreground">
              تسک‌ها{version ? ` · نسخه ${version.number.toLocaleString("fa-IR")}` : ""}
              <span className="rounded-full bg-foreground/[0.06] px-2 text-[11px] leading-5 text-muted-foreground">{numbered.length.toLocaleString("fa-IR")}</span>
            </h3>
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-6 text-muted-foreground">
              <IconRobot size={14} className="mt-1 shrink-0" aria-hidden="true" />
              تسک‌ها رو ثبت کن، بعد پیام رو توی همون چتی که پروژه رو ساخته بفرست؛ Claude با MCP تسک‌ها رو می‌خونه و وضعیت‌ها این‌جا به‌روز می‌شن.
            </p>
          </div>
          {openCount > 0 && (
            <Button type="button" size="sm" onClick={copyPrompt}>
              {copied ? <IconCheck size={15} aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
              {copied ? "کپی شد؛ توی چت Claude بفرست" : `کپی پیام برای Claude (${openCount.toLocaleString("fa-IR")} تسک)`}
            </Button>
          )}
        </div>
        {numbered.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <IconMessageCirclePlus size={26} stroke={1.5} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">هنوز تسکی نیست. «یادداشت‌گذاری» رو بزن و روی هر المان سایت کلیک کن.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2/70 text-right text-xs text-muted-foreground">
                  <th scope="col" className="w-12 px-4 py-2.5 font-bold">#</th>
                  <th scope="col" className="px-4 py-2.5 font-bold">تسک</th>
                  <th scope="col" className="px-4 py-2.5 font-bold">المان</th>
                  <th scope="col" className="w-44 px-4 py-2.5 font-bold">وضعیت</th>
                  <th scope="col" className="w-28 px-4 py-2.5 font-bold">به‌روزرسانی</th>
                </tr>
              </thead>
              <tbody>
                {numbered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setActiveId(c.id === activeId ? "" : c.id)}
                    aria-selected={c.id === activeId}
                    className={cn("cursor-pointer border-b border-border align-top transition-colors last:border-0 hover:bg-foreground/[0.03]", c.id === activeId && "bg-accent-soft/60")}
                  >
                    <td className="px-4 py-3">
                      <span className={cn("grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold", c.id === activeId ? "bg-accent-solid text-accent-foreground" : "bg-brand-soft text-brand")}>
                        {c.n.toLocaleString("fa-IR")}
                      </span>
                    </td>
                    <td className="max-w-[360px] px-4 py-3">
                      <p className="whitespace-pre-wrap break-words leading-7 text-foreground">{c.text}</p>
                      {c.agent_note && (
                        <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs leading-6 text-secondary-foreground">
                          <IconRobot size={14} className="mt-1 shrink-0 text-brand" aria-hidden="true" />
                          <span className="break-words">{c.agent_note}</span>
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <code dir="ltr" className="block max-w-[260px] truncate rounded-md bg-surface-2 px-2 py-1 text-left font-mono text-[11px] text-secondary-foreground" title={c.html || c.selector}>
                        {c.html || c.element || c.selector || "—"}
                      </code>
                      {c.page && c.page !== "/" && <span dir="ltr" className="mt-1 block font-mono text-[11px] text-muted-foreground">{c.page}</span>}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 text-[11px] font-bold leading-6", STATUS[c.status].tone)}>
                        <span className={cn("h-1.5 w-1.5 rounded-full bg-current", c.status === "in_progress" && "motion-safe:animate-pulse")} aria-hidden="true" />
                        {STATUS[c.status].label}
                      </span>
                      {c.status === "review" && (
                        <div className="mt-2 flex gap-1">
                          <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onStatus(c.id, "approved")}>
                            <IconCheck size={14} aria-hidden="true" />
                            تأیید
                          </Button>
                          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={busy} onClick={() => onStatus(c.id, "open")}>
                            <IconArrowBackUp size={14} aria-hidden="true" />
                            برگشت
                          </Button>
                        </div>
                      )}
                      {c.status === "approved" && (
                        <button type="button" disabled={busy} onClick={() => onStatus(c.id, "open")} className="mt-1.5 block rounded text-[11px] font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                          بازگشایی
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.updated_at || c.created_at).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {c.updated_by === "agent" && <span className="mt-0.5 block text-[11px] text-brand">توسط ایجنت</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
