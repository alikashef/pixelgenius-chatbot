"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArrowUpRight,
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

export interface NewComment {
  page: string;
  selector: string;
  element: string;
  x: number;
  y: number;
  text: string;
}

const DEVICES = [
  { id: "desktop", label: "دسکتاپ", icon: IconDeviceDesktop, width: "100%" },
  { id: "tablet", label: "تبلت", icon: IconDeviceTablet, width: "820px" },
  { id: "mobile", label: "موبایل", icon: IconDeviceMobile, width: "390px" },
] as const;

const STATUS: Record<WorkspaceComment["status"], { label: string; tone: string }> = {
  open: { label: "باز", tone: "text-warning" },
  in_progress: { label: "در حال اصلاح", tone: "text-info" },
  review: { label: "آماده‌ی بازبینی", tone: "text-brand" },
  approved: { label: "تأییدشده", tone: "text-success" },
};

// Runs inside the sandboxed HTML preview (opaque origin): hover highlight, click-to-pin and
// numbered markers that follow their elements while the page scrolls.
const BRIDGE = `<script>(function(){
var on=false,pins=[],layer,hl;
function sel(el){var parts=[];while(el&&el.tagName!=='HTML'){var s=el.tagName.toLowerCase();if(el.id){s+='#'+CSS.escape(el.id);parts.unshift(s);break;}var p=el.parentElement;if(p){var sib=Array.from(p.children).filter(function(x){return x.tagName===el.tagName});if(sib.length>1)s+=':nth-of-type('+(sib.indexOf(el)+1)+')';}parts.unshift(s);el=p;}return parts.join(' > ');}
function label(el){var t=(el.innerText||el.getAttribute('alt')||el.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' ').slice(0,60);return el.tagName.toLowerCase()+(t?' · '+t:'');}
function box(){if(!layer){layer=document.createElement('div');layer.style.cssText='position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none';document.body.appendChild(layer);hl=document.createElement('div');hl.style.cssText='position:absolute;display:none;border:2px solid #7c3aed;background:rgba(124,58,237,.08);border-radius:4px;transition:all .08s';layer.appendChild(hl);}return layer;}
function place(node,r){node.style.left=(r.left+scrollX)+'px';node.style.top=(r.top+scrollY)+'px';node.style.width=r.width+'px';node.style.height=r.height+'px';}
function draw(){var l=box();Array.from(l.querySelectorAll('[data-pin]')).forEach(function(n){n.remove()});pins.forEach(function(p){var el;try{el=document.querySelector(p.selector)}catch(e){}if(!el)return;var r=el.getBoundingClientRect();var b=document.createElement('div');b.setAttribute('data-pin','');b.textContent=p.n;b.style.cssText='position:absolute;width:22px;height:22px;border-radius:11px;color:#fff;font:700 11px/22px system-ui;text-align:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.25);background:'+(p.active?'#f59e0b':'#7c3aed');b.style.left=(r.left+scrollX-11)+'px';b.style.top=(r.top+scrollY-11)+'px';l.appendChild(b);if(p.active){var o=document.createElement('div');o.setAttribute('data-pin','');o.style.cssText='position:absolute;border:2px solid #f59e0b;border-radius:4px';place(o,r);l.appendChild(o);}});}
document.addEventListener('mousemove',function(e){if(!on)return;var el=e.target;if(!(el instanceof Element)||layer&&layer.contains(el))return;box();hl.style.display='block';place(hl,el.getBoundingClientRect());},true);
document.addEventListener('click',function(e){if(!on)return;e.preventDefault();e.stopPropagation();var el=e.target;if(!(el instanceof Element))return;parent.postMessage({type:'workspace-element',selector:sel(el),element:label(el),x:e.clientX/innerWidth*100,y:e.clientY/innerHeight*100},'*');},true);
addEventListener('message',function(e){var d=e.data||{};if(d.type!=='workspace-annotate')return;on=!!d.on;pins=d.pins||[];document.documentElement.style.cursor=on?'crosshair':'';box();if(!on)hl.style.display='none';draw();});
addEventListener('scroll',draw,true);addEventListener('resize',draw);
parent.postMessage({type:'workspace-ready'},'*');
})();</script>`;

function htmlDocument(version: WorkspaceVersion) {
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https:; style-src 'unsafe-inline' https:; img-src https: data: http:; font-src https: data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
  return `<!doctype html><html><head>${policy}</head><body>${version.html}${BRIDGE}</body></html>`;
}

function pathOf(url: string) {
  try {
    const u = new URL(url);
    return u.pathname || "/";
  } catch {
    return "/";
  }
}

/** Review a version like a design tool: the app loads by itself, annotate mode pins notes on it, notes list in a table. */
export default function PreviewReview({
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
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["id"]>("desktop");
  const [annotating, setAnnotating] = useState(false);
  const [draft, setDraft] = useState<Omit<NewComment, "text"> | null>(null);
  const [text, setText] = useState("");
  const [activeId, setActiveId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const htmlMode = Boolean(version.html);
  const page = htmlMode ? "/" : pathOf(url || "");
  const width = DEVICES.find((d) => d.id === device)!.width;

  const numbered = useMemo(() => comments.map((c, i) => ({ ...c, n: i + 1 })), [comments]);

  // Keep the in-frame bridge in sync with annotate mode and the pins.
  useEffect(() => {
    if (!htmlMode) return;
    const pins = numbered.filter((c) => c.selector).map((c) => ({ n: c.n, selector: c.selector, active: c.id === activeId }));
    const send = () => frame.current?.contentWindow?.postMessage({ type: "workspace-annotate", on: annotating && !draft, pins }, "*");
    send();
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "workspace-ready") send();
      if (event.data?.type === "workspace-element" && annotating && typeof event.data.selector === "string") {
        setDraft({
          page: "/",
          selector: event.data.selector.slice(0, 1000),
          element: String(event.data.element || "").slice(0, 200),
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

  function pinFromOverlay(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setDraft({
      page,
      selector: "",
      element: "",
      x: Math.round(((e.clientX - r.left) / r.width) * 1000) / 10,
      y: Math.round(((e.clientY - r.top) / r.height) * 1000) / 10,
    });
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!draft || !text.trim()) return;
    if (await onAdd({ ...draft, text: text.trim() })) {
      setDraft(null);
      setText("");
    }
  }

  function composerKeys(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") setDraft(null);
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
  }

  const canPreview = htmlMode || Boolean(url);
  const viewportPins = htmlMode ? [] : numbered.filter((c) => c.x != null && c.y != null);

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
            disabled={!canPreview}
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
            {htmlMode ? "روی هر المانی که می‌خوای تغییر کنه کلیک کن." : "روی هر جای صفحه که می‌خوای تغییر کنه کلیک کن. برای اسکرول، یادداشت‌گذاری رو موقتاً خاموش کن."}
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
                  ? { srcDoc: htmlDocument(version), sandbox: "allow-scripts" }
                  : { src: url, sandbox: "allow-scripts allow-forms allow-same-origin allow-popups" })}
                referrerPolicy="no-referrer"
                className="block h-[680px] w-full rounded-xl border border-border bg-background shadow-card"
              />
              {!htmlMode && annotating && !draft && (
                <div role="button" tabIndex={-1} aria-label="ثبت یادداشت روی این نقطه" onClick={pinFromOverlay} className="absolute inset-0 cursor-crosshair rounded-xl" />
              )}
              {viewportPins.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveId(c.id === activeId ? "" : c.id)}
                  aria-label={`یادداشت ${c.n}`}
                  style={{ left: `${c.x}%`, top: `${c.y}%` }}
                  className={cn(
                    "absolute z-10 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-bold shadow-elevated ring-2 ring-background transition-colors",
                    c.id === activeId ? "bg-accent-solid text-accent-foreground" : "bg-brand-solid text-brand-foreground"
                  )}
                >
                  {c.n.toLocaleString("fa-IR")}
                </button>
              ))}
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
                      {draft.element && <span dir="ltr" className="mr-1.5 font-mono font-normal text-muted-foreground">{draft.element}</span>}
                    </p>
                    <button type="button" onClick={() => setDraft(null)} aria-label="لغو" className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground">
                      <IconX size={15} aria-hidden="true" />
                    </button>
                  </div>
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
              {draft && !htmlMode && (
                <span
                  aria-hidden="true"
                  style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
                  className="absolute z-10 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent-solid text-[11px] font-bold text-accent-foreground shadow-elevated ring-2 ring-background"
                >
                  {(numbered.length + 1).toLocaleString("fa-IR")}
                </span>
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
          <h3 id="notes-title" className="text-sm font-bold text-foreground">
            یادداشت‌های نسخه {version.number.toLocaleString("fa-IR")}
            <span className="mr-2 rounded-full bg-foreground/[0.06] px-2 text-[11px] font-bold leading-5 text-muted-foreground">
              {numbered.length.toLocaleString("fa-IR")}
            </span>
          </h3>
          <span className="text-xs text-muted-foreground">
            {numbered.filter((c) => c.status !== "approved").length.toLocaleString("fa-IR")} مورد باز
          </span>
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
                  <th scope="col" className="px-4 py-2.5 font-bold">یادداشت</th>
                  <th scope="col" className="px-4 py-2.5 font-bold">موقعیت</th>
                  <th scope="col" className="w-40 px-4 py-2.5 font-bold">وضعیت</th>
                  <th scope="col" className="w-32 px-4 py-2.5 font-bold">زمان</th>
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
                    <td className="max-w-[340px] whitespace-pre-wrap break-words px-4 py-3 leading-7 text-foreground">{c.text}</td>
                    <td className="px-4 py-3">
                      <span dir="ltr" className="block max-w-[220px] truncate font-mono text-[11px] text-muted-foreground" title={c.selector || undefined}>
                        {c.page}
                        {c.element ? ` · ${c.element}` : c.selector ? ` · ${c.selector}` : c.x != null ? ` · ${Math.round(c.x)}%, ${Math.round(c.y ?? 0)}%` : ""}
                      </span>
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <label className="sr-only" htmlFor={`status-${c.id}`}>وضعیت یادداشت {c.n}</label>
                      <select
                        id={`status-${c.id}`}
                        value={c.status}
                        disabled={busy}
                        onChange={(e) => onStatus(c.id, e.target.value as WorkspaceComment["status"])}
                        className={cn("h-8 w-full rounded-md border border-input bg-surface px-2 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring", STATUS[c.status].tone)}
                      >
                        {Object.entries(STATUS).map(([key, s]) => (
                          <option key={key} value={key}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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
