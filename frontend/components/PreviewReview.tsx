"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowBackUp,
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconRobot,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconMessageCirclePlus,
  IconPointer,
  IconRefresh,
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

type Draft = Omit<NewComment, "text"> & { x: number; y: number };

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

// The same review bridge (public/review-bridge.js) runs in HTML versions and, via ?pg_review=1, on live previews.
function htmlDocument(version: WorkspaceVersion, origin: string) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https: ${origin}; style-src 'unsafe-inline' https:; img-src https: data: http:; font-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  return `<!doctype html><html><head>${policy}</head><body>${version.html}<script src="${origin}/review-bridge.js"></script></body></html>`;
}

function reviewUrl(url: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("pg_review", "1");
    return u.toString();
  } catch {
    return url;
  }
}

/** Review a version like a design tool: the app loads by itself, annotate mode pins tasks on elements, tasks list in a table. */
/** What the owner pastes into the same AI chat that built the project; the agent then reads the tasks over MCP. */
function agentPrompt(projectName: string, versionNumber: number) {
  return `تغییراتی که برای پروژه‌ی «${projectName}» (نسخه ${versionNumber}) توی PixelGenius ثبت کردم رو بخون و درستش کن.
با get_workspace از سرور PixelGenius لیست tasks رو بگیر و یکی‌یکی اصلاح کن: اول update_feedback با in_progress، بعد از اصلاح update_feedback با review و یک note کوتاه از کاری که کردی. آخر کار نسخه‌ی جدید رو با report_output ثبت کن.`;
}

export default function PreviewReview({
  projectName,
  version,
  url,
  comments,
  busy,
  onAdd,
  onStatus,
}: {
  version: WorkspaceVersion;
  /** The address to preview when the version has no HTML: its own URL or the project's live site. */
  url?: string;
  comments: WorkspaceComment[];
  busy: boolean;
  onAdd: (comment: NewComment) => Promise<boolean>;
  onStatus: (id: string, status: WorkspaceComment["status"]) => void;
  projectName: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [annotating, setAnnotating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bridge, setBridge] = useState<"loading" | "ready" | "missing">("loading");
  const [origin, setOrigin] = useState("");
  const [text, setText] = useState("");
  const [activeId, setActiveId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(agentPrompt(projectName, version.number));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: nothing to undo.
    }
  }
  const htmlMode = Boolean(version.html);
  const width = DEVICES.find((d) => d.id === device)!.width;

  const numbered = useMemo(() => comments.map((c, i) => ({ ...c, n: i + 1 })), [comments]);

  useEffect(() => setOrigin(window.location.origin), []);

  // Element picking needs the bridge inside the preview; without it (a site that blocks scripts) annotate stays off.
  useEffect(() => {
    setBridge("loading");
    const timer = setTimeout(() => setBridge((b) => (b === "ready" ? b : "missing")), 6000);
    return () => clearTimeout(timer);
  }, [version.id, reloadKey, url]);

  // Keep the bridge in sync with annotate mode and the pins.
  useEffect(() => {
    const pins = numbered.filter((c) => c.selector).map((c) => ({ n: c.n, selector: c.selector, page: htmlMode ? "" : c.page, active: c.id === activeId }));
    const send = () => frame.current?.contentWindow?.postMessage({ type: "workspace-annotate", on: annotating && !draft, pins }, "*");
    send();
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "workspace-ready") {
        setBridge("ready");
        send();
      }
      if (event.data?.type === "workspace-element" && annotating && typeof event.data.selector === "string") {
        setDraft({
          page: htmlMode ? "/" : String(event.data.page || "/").slice(0, 2000),
          selector: event.data.selector.slice(0, 1000),
          html: String(event.data.html || "").slice(0, 2000),
          x: Math.min(100, Math.max(0, Number(event.data.x) || 0)),
          y: Math.min(100, Math.max(0, Number(event.data.y) || 0)),
        });
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [htmlMode, annotating, draft, numbered, activeId, reloadKey]);

  useEffect(() => {
    setDraft(null);
    setText("");
    setActiveId("");
  }, [version.id]);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || !text.trim()) return;
    const { page, selector, html } = draft;
    if (await onAdd({ page, selector, html, text: text.trim() })) {
      setDraft(null);
      setText("");
    }
  }

  function composerKeys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") setDraft(null);
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
  }

  const canPreview = (htmlMode && Boolean(origin)) || Boolean(url);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
            <IconWorld size={15} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            <span dir="ltr" className="truncate font-mono text-[12px] text-secondary-foreground">
              {htmlMode ? `نسخه ${version.number} · HTML` : url ? url.replace(/^https?:\/\//, "") : "هنوز منتشر نشده"}
            </span>
          </div>
          <div role="radiogroup" aria-label="اندازه‌ی نمایش" className="flex rounded-lg bg-surface-2 p-0.5">
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
                  device === d.id ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <d.icon size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            aria-label="بارگذاری دوباره"
            title="بارگذاری دوباره"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconRefresh size={16} aria-hidden="true" />
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="باز کردن در تب جدید"
              title="باز کردن در تب جدید"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          <Button
            type="button"
            size="sm"
            variant={annotating ? "default" : "outline"}
            disabled={!canPreview || bridge !== "ready"}
            title={bridge === "missing" ? "انتخاب المان روی این پیش‌نمایش در دسترس نیست" : undefined}
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
            روی هر المانی که می‌خوای تغییر کنه کلیک کن؛ تگ HTML همون المان با تسک برای ایجنت فرستاده می‌شه.
          </p>
        )}
        {bridge === "missing" && canPreview && (
          <p className="border-b border-border bg-warning/10 px-4 py-2 text-xs text-warning">
            این پیش‌نمایش اجازه‌ی انتخاب المان نمی‌ده؛ صفحه رو دوباره بارگذاری کن یا بعد از انتشار نسخه‌ی جدید امتحان کن.
          </p>
        )}

        <div className="bg-dots bg-surface-2 p-3 sm:p-5">
          {canPreview ? (
            <div className="relative mx-auto transition-[width] duration-200" style={{ width, maxWidth: "100%" }}>
              <iframe
                key={`${version.id}-${reloadKey}`}
                ref={frame}
                title={`پیش‌نمایش نسخه ${version.number}`}
                {...(htmlMode
                  ? { srcDoc: htmlDocument(version, origin), sandbox: "allow-scripts" }
                  : { src: reviewUrl(url!), sandbox: "allow-scripts allow-forms allow-same-origin allow-popups" })}
                referrerPolicy="no-referrer"
                className="block h-[680px] w-full rounded-xl border border-border bg-background shadow-card"
              />
              {draft && (
                <form
                  onSubmit={submit}
                  style={{
                    top: draft.y > 65 ? undefined : `calc(${draft.y}% + 16px)`,
                    bottom: draft.y > 65 ? `calc(${100 - draft.y}% + 16px)` : undefined,
                    left: draft.x > 55 ? undefined : `max(8px, calc(${draft.x}% - 24px))`,
                    right: draft.x > 55 ? `max(8px, calc(${100 - draft.x}% - 24px))` : undefined,
                  }}
                  className="absolute z-20 w-[min(300px,calc(100%-16px))] rounded-xl border border-border bg-surface p-3 shadow-elevated animate-in fade-in zoom-in-95 duration-150"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-bold text-foreground">
                      یادداشت {(numbered.length + 1).toLocaleString("fa-IR")}
                    </p>
                    <button type="button" onClick={() => setDraft(null)} aria-label="لغو" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
                      <IconX size={15} aria-hidden="true" />
                    </button>
                  </div>
                  {draft.html && (
                    <code dir="ltr" className="mb-2 block truncate rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-secondary-foreground" title={draft.html}>
                      {draft.html}
                    </code>
                  )}
                  <textarea
                    autoFocus
                    rows={3}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={composerKeys}
                    maxLength={5000}
                    placeholder="چی باید تغییر کنه؟"
                    aria-label="متن یادداشت"
                    className="field min-h-0 resize-none py-2 text-sm"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted-foreground">Ctrl + Enter برای ثبت</span>
                    <Button type="submit" size="sm" disabled={busy || !text.trim()}>ثبت یادداشت</Button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            <div className="grid h-[420px] place-items-center text-center">
              <div>
                <IconWorld size={32} stroke={1.4} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-bold text-foreground">هنوز چیزی برای نمایش نیست</p>
                <p className="mt-1 text-xs leading-6 text-muted-foreground">وقتی ایجنت پروژه رو منتشر کنه، همین‌جا باز می‌شه.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="notes-title" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 id="notes-title" className="text-sm font-bold text-foreground">
              تسک‌های نسخه {version.number.toLocaleString("fa-IR")}
              <span className="mr-2 rounded-full bg-foreground/[0.06] px-2 text-[11px] font-bold leading-5 text-muted-foreground">
                {numbered.length.toLocaleString("fa-IR")}
              </span>
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconRobot size={14} aria-hidden="true" />
              یادداشت‌ها رو ثبت کن، بعد پیام رو توی همون چتی که پروژه رو ساخته بفرست؛ Claude با MCP تسک‌ها رو می‌خونه و وضعیت‌ها این‌جا به‌روز می‌شن.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
            {(["open", "in_progress", "review"] as const).map((key) => {
              const count = numbered.filter((c) => c.status === key).length;
              return count ? (
                <span key={key} className={cn("rounded-full px-2 leading-6", STATUS[key].tone)}>
                  {STATUS[key].label}
                  <span className="mr-1.5">{count.toLocaleString("fa-IR")}</span>
                </span>
              ) : null;
            })}
            {numbered.some((c) => c.status === "open") && (
              <Button type="button" size="sm" variant="outline" onClick={copyPrompt} className="mr-1">
                {copied ? <IconCheck size={15} className="text-success" aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
                {copied ? "کپی شد؛ توی چت Claude بفرست" : "کپی پیام برای Claude"}
              </Button>
            )}
          </div>
        </div>
        {numbered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            هنوز یادداشتی نیست. «یادداشت‌گذاری» رو بزن و روی پیش‌نمایش کلیک کن.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
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
                      <code dir="ltr" className="block max-w-[260px] truncate rounded-md bg-surface-2 px-2 py-1 font-mono text-[11px] text-secondary-foreground" title={c.html || c.selector}>
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
