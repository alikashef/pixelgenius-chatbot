"use client";

import { FormEvent, ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { IconArrowUp, IconCheck, IconDownload, IconFileText, IconDeviceMobile, IconGauge, IconMicrophone, IconMovie, IconPalette, IconPencil, IconPhoto, IconTextCaption, IconPlayerPause, IconPlayerPlay, IconPlus, IconTrash, IconVideo, IconX } from "@tabler/icons-react";
import AppShell, { NewProjectLink, ShellLoading, useAccountNav } from "@/components/AppShell";
import { BrandMark } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  chatVideo, clearSession, createVideoProject, fetchVideoAccess, deleteVideoProject, fetchVideoProject, fetchVideoProjects, renderVideo, reviseVideo, rollbackVideo,
  fetchVoicePreview, saveVideoScenario, saveVideoSettings, makeVideoCovers, chooseVideoCover, uploadVideoFile, VideoAttachment, VideoProject, VideoScenario, VideoSettings,
} from "@/lib/api";

const ATTACH_ACCEPT = "image/*,.svg,video/*,audio/*,.pdf,.doc,.docx,.txt,.csv,.zip,.rar,.ppt,.pptx,.xls,.xlsx";

type Fail = (err: unknown) => void;
type Choice<T extends string> = { value: T; label: string; hint: string; disabled?: boolean };

const STATUS_LABEL: Record<VideoProject["status"], string> = { draft: "پیش‌نویس", rendering: "در حال ساخت", ready: "آماده", failed: "ناموفق" };
const FORMATS: Choice<VideoSettings["format"]>[] = [
  { value: "9:16", label: "۹:۱۶", hint: "ریلز و استوری" },
  { value: "4:5", label: "۴:۵", hint: "پست فید اینستاگرام" },
  { value: "1:1", label: "۱:۱", hint: "مربع، همه‌جا قابل استفاده" },
  { value: "16:9", label: "۱۶:۹", hint: "یوتیوب و سایت" },
];
const VOICES: Choice<VideoSettings["voice"]>[] = [
  { value: "male_warm", label: "گوینده‌ی مرد · گرم و صمیمی", hint: "مناسب آموزش و معرفی خدمات" },
  { value: "female_formal", label: "گوینده‌ی زن · رسمی و شفاف", hint: "مناسب خدمات شرکتی و B2B" },
  { value: "male_energetic", label: "گوینده‌ی مرد · پرانرژی", hint: "مناسب تبلیغ و ریل‌های تند" },
];
const SPEEDS: Choice<VideoSettings["speed"]>[] = [
  { value: "slow", label: "آهسته", hint: "" },
  { value: "normal", label: "عادی", hint: "" },
  { value: "fast", label: "سریع", hint: "" },
];
const SUB_MODES: Choice<VideoSettings["subtitle_mode"]>[] = [
  { value: "word", label: "کلمه‌به‌کلمه", hint: "" },
  { value: "sentence", label: "جمله‌ای", hint: "" },
];
const SUB_POS: Choice<VideoSettings["subtitle_pos"]>[] = [
  { value: "top", label: "بالا", hint: "" },
  { value: "middle", label: "وسط", hint: "" },
  { value: "bottom", label: "پایین", hint: "" },
];
const EDIT_CHIPS = ["صدا رو عوض کن", "زیرنویس جمله‌ای بشه", "عنوان کاور رو عوض کن", "کوتاه‌ترش کن"];
const fa = (n: number) => Math.round(n).toLocaleString("fa-IR");

function useVideoToken() {
  const router = useRouter();
  const [token, setToken] = useState("");
  useEffect(() => {
    const stored = localStorage.getItem("customer_token");
    if (!stored) router.replace("/login?redirect=/video");
    else setToken(stored);
  }, [router]);
  const logout = useCallback(() => {
    clearSession();
    router.push("/login");
  }, [router]);
  return { token, logout };
}

function StatusPill({ status }: { status: VideoProject["status"] }) {
  const tone = status === "ready" ? "bg-success/10 text-success" : status === "failed" ? "bg-danger/10 text-danger" : status === "rendering" ? "bg-warning/10 text-warning" : "bg-pending/10 text-pending";
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold", tone)}><span className="h-1.5 w-1.5 rounded-full bg-current" />{STATUS_LABEL[status]}</span>;
}

function ErrorText({ children }: { children: ReactNode }) {
  return children ? <p role="alert" className="text-sm text-danger">{children}</p> : null;
}

function Segment<T extends string>({ legend, value, options, onChange, disabled }: { legend: string; value: T; options: Choice<T>[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="field-label">{legend}</legend>
      <div className="inline-flex rounded-lg bg-surface-2 p-1">
        {options.map((o) => (
          <label key={o.value} className="cursor-pointer">
            <input type="radio" className="peer sr-only" name={legend} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="inline-flex h-8 items-center rounded-md px-4 text-sm text-secondary-foreground transition-colors peer-checked:bg-surface peer-checked:font-bold peer-checked:text-foreground peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-ring">{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Cards<T extends string>({ legend, value, options, onChange, note, columns = "sm:grid-cols-2" }: { legend: string; value: T; options: Choice<T>[]; onChange: (v: T) => void; note?: ReactNode; columns?: string }) {
  return (
    <fieldset>
      <legend className="field-label">{legend}</legend>
      {note}
      <div className={cn("mt-2 grid gap-2", columns)}>
        {options.map((o) => (
          <label key={o.value} className={cn("block", o.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
            <input type="radio" className="peer sr-only" name={legend} disabled={o.disabled} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="block rounded-xl border border-border bg-surface p-3 transition-colors peer-checked:border-foreground peer-checked:bg-surface-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
              <span className="block text-sm font-bold text-foreground">{o.label}</span>
              {o.hint && <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ProjectList({ token, onError }: { token: string; onError: Fail }) {
  const router = useRouter();
  const [projects, setProjects] = useState<VideoProject[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => { fetchVideoProjects(token).then(setProjects).catch(onError); }, [token, onError]);

  async function create() {
    setCreating(true);
    try {
      router.push(`/video?id=${(await createVideoProject(token)).id}`);
    } catch (err) {
      onError(err);
      setCreating(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("این پروژه و همه‌ی نسخه‌هایش حذف شود؟")) return;
    try {
      await deleteVideoProject(token, id);
      setProjects((list) => list?.filter((p) => p.id !== id) ?? null);
    } catch (err) { onError(err); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-foreground">ویدیوهای من</h2>
        <Button type="button" onClick={create} disabled={creating}><IconPlus size={17} aria-hidden="true" />{creating ? "در حال ساخت…" : "ساخت ویدیوی جدید"}</Button>
      </div>
      {projects === null ? <p className="text-sm text-muted-foreground">در حال بارگذاری…</p> : projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">هنوز ویدیویی نساخته‌ای. با «ساخت ویدیوی جدید» از یک گفتگو شروع کن؛ دستیار سناریو رو با هم می‌نویسیم.</div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {projects.map((p) => {
            const last = p.versions[p.versions.length - 1];
            return (
              <li key={p.id} className="group relative">
                <Link href={`/video?id=${p.id}`} className="block rounded-xl border border-border bg-surface p-2 outline-none transition-colors hover:border-foreground/30 focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="aspect-[9/16] overflow-hidden rounded-lg bg-surface-2">
                    {last ? <img src={last.cover_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-muted-foreground"><IconMovie size={28} aria-hidden="true" /></div>}
                  </div>
                  <div className="space-y-1.5 p-2">
                    <p className="truncate text-sm font-bold text-foreground">{p.scenario?.title || p.title}</p>
                    <StatusPill status={p.status} />
                  </div>
                </Link>
                <button type="button" onClick={() => remove(p.id)} aria-label="حذف پروژه" className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-background/90 text-muted-foreground opacity-0 outline-none transition-opacity hover:text-danger focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100">
                  <IconTrash size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stepper({ step, onStep, reachable }: { step: number; onStep: (n: number) => void; reachable: number }) {
  const steps = ["سناریو", "تنظیمات و هزینه", "پیش‌نمایش و ویرایش"];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {steps.map((label, i) => (
        <li key={label}>
          <button type="button" disabled={i + 1 > reachable} onClick={() => onStep(i + 1)} aria-current={step === i + 1 ? "step" : undefined}
            className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed", step === i + 1 ? "bg-foreground/[0.07] font-bold text-foreground" : "text-muted-foreground enabled:hover:text-foreground")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold", i + 1 < step ? "bg-brand-solid text-brand-foreground" : "bg-surface-2")}>{i + 1 < step ? <IconCheck size={12} stroke={3} aria-hidden="true" /> : fa(i + 1)}</span>
            {label}
          </button>
        </li>
      ))}
    </ol>
  );
}

function ScenarioStep({ token, project, onChange, onError, onNext }: { token: string; project: VideoProject; onChange: (p: VideoProject) => void; onError: Fail; onNext: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<VideoScenario | null>(null);
  const [attachments, setAttachments] = useState<VideoAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [project.messages.length, pending]);

  async function say(message: string, files: VideoAttachment[] = attachments) {
    if ((!message.trim() && files.length === 0) || busy) return;
    setBusy(true);
    setError("");
    setPending(message.trim() || "(فایل پیوست)");
    setText("");
    setAttachments([]);
    try {
      onChange(await chatVideo(token, project.id, message.trim(), files));
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "ارسال پیام ناموفق بود");
      setText(message);
      setAttachments(files);
    } finally {
      setPending("");
      setBusy(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploadingFile(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadVideoFile(token, project.id, file);
        setAttachments((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "آپلود فایل ناموفق بود");
    } finally {
      setUploadingFile(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function removeAttachment(url: string) {
    setAttachments((prev) => prev.filter((a) => a.url !== url));
  }

  async function saveDraft() {
    if (!draft) return;
    try {
      onChange(await saveVideoScenario(token, project.id, draft));
      setEditing(false);
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "ذخیره ناموفق بود");
    }
  }

  const scenario = project.scenario;
  let cursor = 0;
  const checks = [
    { label: `نام برند${project.info.brand ? `: ${project.info.brand}` : ""}`, done: !!project.info.brand },
    { label: `لوگو${project.has_logo ? ": ارسال شد" : " (اختیاری)"}`, done: project.has_logo },
    { label: `دعوت به اقدام پایان ویدیو${project.info.cta ? `: ${project.info.cta}` : ""}`, done: !!project.info.cta },
  ];
  const required = checks.filter((_, i) => i !== 1);
  const doneCount = required.filter((c) => c.done).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="گفتگو با دستیار" className="flex min-h-[560px] flex-col rounded-xl border border-border bg-surface">
        <div className="flex-1 space-y-5 overflow-y-auto p-5" style={{ maxHeight: "62vh" }}>
          {[...project.messages, ...(pending ? [{ role: "user" as const, content: pending, attachments: undefined as VideoAttachment[] | undefined }] : [])].map((m, i) => (
            <div key={i} className={cn("flex gap-3", m.role === "user" && "flex-row-reverse")}>
              {m.role === "assistant" ? <BrandMark size="sm" /> : null}
              <div className={cn("max-w-[85%]", m.role === "user" ? "rounded-xl bg-surface-2 px-4 py-2" : "")}>
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {m.attachments.map((a) => (
                      <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="block">
                        {a.content_type?.startsWith("image/") ? (
                          <img src={a.url} alt={a.name} className="h-28 w-28 rounded-lg object-cover" />
                        ) : (
                          <span className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground">
                            <IconFileText size={14} aria-hidden="true" />{a.name}
                          </span>
                        )}
                      </a>
                    ))}
                  </div>
                )}
                {m.content && <p className="whitespace-pre-line text-sm leading-7 text-foreground">{m.content}</p>}
              </div>
            </div>
          ))}
          {busy && <p role="status" className="text-sm text-muted-foreground">دستیار در حال نوشتن…</p>}
          <div ref={bottom} />
        </div>
        <div className="border-t border-border p-4">
          {project.quick_replies.length > 0 && !busy && (
            <div className="mb-3 flex flex-wrap gap-2">
              {project.quick_replies.map((q) => (
                <button key={q} type="button" onClick={() => say(q)} className="rounded-full border border-border px-3 py-1.5 text-sm text-secondary-foreground outline-none transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{q}</button>
              ))}
            </div>
          )}
          <ErrorText>{error}</ErrorText>
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((a) => (
                <span key={a.url} className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
                  {a.content_type?.startsWith("image/") ? (
                    <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex flex-col items-center gap-1 px-1 text-center text-[10px] leading-tight text-muted-foreground">
                      <IconFileText size={18} aria-hidden="true" />
                      <span className="line-clamp-2 break-all">{a.name}</span>
                    </span>
                  )}
                  <button type="button" onClick={() => removeAttachment(a.url)} aria-label={`حذف ${a.name}`} className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-foreground text-background outline-none">
                    <IconX size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={(e: FormEvent) => { e.preventDefault(); say(text); }} className="flex items-end gap-2">
            <label htmlFor="v-msg" className="sr-only">پیام</label>
            <textarea id="v-msg" rows={2} maxLength={2000} value={text} disabled={busy} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); say(text); } }}
              placeholder="مثلاً: طراح سایتم و می‌خوام یه ریل بسازم که…" className="field min-h-0 flex-1" />
            <button type="button" onClick={() => fileInput.current?.click()} disabled={busy || uploadingFile} aria-label="پیوست فایل" title="پیوست فایل" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              {uploadingFile ? <span className="h-4 w-4 rounded-full border-2 border-muted-foreground/40 border-t-foreground motion-safe:animate-spin" /> : <IconPlus size={18} aria-hidden="true" />}
            </button>
            <Button type="submit" size="icon" disabled={busy || (!text.trim() && attachments.length === 0)} aria-label="ارسال"><IconArrowUp size={18} aria-hidden="true" /></Button>
            <input ref={fileInput} type="file" accept={ATTACH_ACCEPT} multiple hidden onChange={(e) => handleFiles(e.target.files)} />
          </form>
          {project.clips.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{fa(project.clips.length)} کلیپ فرستاده‌ای: {project.clips.map((c) => c.name).join("، ")}</p>}
        </div>
      </section>

      <aside aria-label="پیش‌نویس سناریو" className="space-y-4">
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-foreground">پیش‌نویس سناریو</h2>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", project.ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>{project.ready ? "آماده" : "در حال تکمیل"}</span>
          </div>
          {!scenario ? (
            <p className="mt-4 text-sm text-muted-foreground">با دستیار گفتگو کن؛ به‌محض اینکه هدف ویدیو روشن شد، سناریو همین‌جا نوشته می‌شود.</p>
          ) : editing && draft ? (
            <div className="mt-4 space-y-4">
              {draft.scenes.map((s, i) => (
                <div key={i} className="space-y-2 rounded-lg bg-surface-2 p-3">
                  <label className="field-label" htmlFor={`st-${i}`}>صحنه {fa(i + 1)} · متن روی ویدیو</label>
                  <textarea id={`st-${i}`} rows={2} className="field" value={s.text} onChange={(e) => setDraft({ ...draft, scenes: draft.scenes.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  <label className="field-label" htmlFor={`sn-${i}`}>متن گوینده</label>
                  <textarea id={`sn-${i}`} rows={3} className="field" value={s.narration} onChange={(e) => setDraft({ ...draft, scenes: draft.scenes.map((x, j) => (j === i ? { ...x, narration: e.target.value } : x)) })} />
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={saveDraft}>ذخیره</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>انصراف</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-4 text-xs text-muted-foreground">هوک</p>
              <p className="mt-1 font-bold leading-7 text-foreground">{scenario.title}</p>
              <p className="mb-2 mt-5 text-xs text-muted-foreground">صحنه‌ها · {fa(project.estimate.seconds)} ثانیه</p>
              <ol className="space-y-2">
                {scenario.scenes.map((s, i) => {
                  const start = cursor;
                  cursor += s.duration;
                  return (
                    <li key={i} className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-muted-foreground">{fa(i + 1)}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">{s.title || s.text.replace("\n", " ")}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{fa(start)}–{fa(cursor)} ث</span>
                    </li>
                  );
                })}
              </ol>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setDraft(scenario); setEditing(true); }}><IconPencil size={15} aria-hidden="true" />ویرایش متن‌ها</Button>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5">
          <h3 className="mb-3 text-sm font-bold text-foreground">اطلاعات لازم · {fa(doneCount)} از {fa(required.length)}</h3>
          <ul className="space-y-2 text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-secondary-foreground">
                <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full", c.done ? "bg-success/10 text-success" : "bg-surface-2 text-transparent")}><IconCheck size={12} stroke={3} aria-hidden="true" /></span>
                {c.label}
              </li>
            ))}
          </ul>
          {(project.info.format_reason || project.info.style_reason) && (
            <dl className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
              {project.info.format_reason && <div><dt className="text-xs text-muted-foreground">قالب و ابعاد</dt><dd className="font-bold text-foreground">{project.settings.format} · {FORMATS.find((f) => f.value === project.settings.format)?.hint}</dd><dd className="mt-0.5 text-xs text-muted-foreground">{project.info.format_reason}</dd></div>}
              {project.info.style_reason && <div><dt className="text-xs text-muted-foreground">سبک پیشنهادی ایجنت</dt><dd className="font-bold text-foreground">{styleLabel(project.settings.style, project.styles)}</dd><dd className="mt-0.5 text-xs text-muted-foreground">{project.info.style_reason}</dd></div>}
            </dl>
          )}
          <Button type="button" className="mt-5 w-full" disabled={!project.ready || busy} onClick={onNext}>ادامه به تنظیمات</Button>
          {!project.ready && <p className="mt-2 text-center text-xs text-muted-foreground">با مشخص شدن نام برند و دعوت به اقدام فعال می‌شود.</p>}
        </div>
      </aside>
    </div>
  );
}

function styleLabel(style: VideoSettings["style"], styles: VideoProject["styles"]) {
  return styles.find((s) => s.value === style)?.label ?? style;
}

function StylePicker({ project, onChange }: { project: VideoProject; onChange: (v: VideoSettings["style"]) => void }) {
  return (
    <fieldset>
      <legend className="field-label">سبک ویدیو</legend>
      {project.info.style_reason && <p className="mt-1 text-xs text-muted-foreground">{project.info.style_reason}</p>}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="max-h-80 min-w-0 flex-1 space-y-2 overflow-y-auto pe-1">
        {project.styles.map((st) => {
          const missing = st.clips > project.clips.length;
          return (
            <label key={st.value} className={cn("block", missing ? "cursor-not-allowed opacity-55" : "cursor-pointer")}>
              <input type="radio" className="peer sr-only" name="style" disabled={missing} checked={project.settings.style === st.value} onChange={() => onChange(st.value)} />
              <span className="block overflow-hidden rounded-xl border border-border bg-surface transition-colors peer-checked:border-foreground peer-checked:bg-surface-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <span className="block space-y-1 p-3">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-foreground">{st.label}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold", st.credits ? "bg-accent-soft text-accent" : "bg-success/10 text-success")}>{st.credits ? `+${fa(st.credits)} کردیت` : "رایگان"}</span>
                  </span>
                  <span className="block text-xs leading-5 text-muted-foreground">{st.hint}</span>
                  {missing && <span className="block text-xs font-bold text-warning">{fa(st.clips)} کلیپ لازم است؛ در گفتگو کلیپ بفرست</span>}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="mx-auto w-40 shrink-0 sm:mx-0 sm:w-44">
        <div className="grid aspect-[9/16] place-items-center rounded-xl border border-dashed border-border bg-surface-2 p-3 text-center">
          <div className="space-y-2 text-muted-foreground">
            <IconMovie size={26} className="mx-auto" aria-hidden="true" />
            <p className="text-xs font-bold text-foreground">{project.styles.find((st) => st.value === project.settings.style)?.label}</p>
            <p className="text-[11px]">ویدیوی نمونه‌ی این سبک اینجا نمایش داده می‌شود</p>
          </div>
        </div>
      </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">نمودار، شخصیت، اسلاید عکس و نمایش کد به‌زودی اضافه می‌شوند.</p>
    </fieldset>
  );
}

function VoicePicker({ token, value, onChange, onError }: { token: string; value: VideoSettings["voice"]; onChange: (v: VideoSettings["voice"]) => void; onError: Fail }) {
  const [playing, setPlaying] = useState<VideoSettings["voice"] | null>(null);
  const [loading, setLoading] = useState<VideoSettings["voice"] | null>(null);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<Partial<Record<VideoSettings["voice"], string>>>({});
  const loaded = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const o of VOICES) {
      if (loaded.current.has(o.value)) continue;
      loaded.current.add(o.value);
      fetchVoicePreview(token, o.value).then((url) => { urls.current[o.value] = url; }).catch((err) => onError(err));
    }
    return () => { audio.current?.pause(); Object.values(urls.current).forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [token, onError]);

  async function toggle(voice: VideoSettings["voice"]) {
    setError("");
    if (playing === voice) {
      audio.current?.pause();
      setPlaying(null);
      return;
    }
    audio.current?.pause();
    setPlaying(null);
    try {
      if (!urls.current[voice]) {
        setLoading(voice);
        urls.current[voice] = await fetchVoicePreview(token, voice);
      }
      const player = new Audio(urls.current[voice]);
      player.onended = () => setPlaying((p) => (p === voice ? null : p));
      audio.current = player;
      await player.play();
      setPlaying(voice);
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "پخش نمونه ناموفق بود");
    } finally {
      setLoading(null);
    }
  }

  return (
    <fieldset>
      <legend className="field-label">صدا و دوبله</legend>
      <p className="mt-1 text-xs text-muted-foreground">گوینده‌ی فارسی متن گوینده‌ی هر صحنه را می‌خواند. با دکمه‌ی پخش نمونه‌ی صدا را بشنو.</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {VOICES.map((o) => (
          <div key={o.value} className="relative">
            <label className="block cursor-pointer">
              <input type="radio" className="peer sr-only" name="voice" checked={value === o.value} onChange={() => onChange(o.value)} />
              <span className="block rounded-xl border border-border bg-surface p-3 pl-12 transition-colors peer-checked:border-foreground peer-checked:bg-surface-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                <span className="block text-sm font-bold text-foreground">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </label>
            <button type="button" onClick={() => toggle(o.value)} disabled={loading !== null} aria-label={`${playing === o.value ? "توقف" : "پخش"} نمونه‌ی ${o.label}`}
              className="absolute left-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              {loading === o.value ? <span className="h-4 w-4 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground motion-safe:animate-spin" /> : playing === o.value ? <IconPlayerPause size={15} aria-hidden="true" /> : <IconPlayerPlay size={15} aria-hidden="true" />}
            </button>
          </div>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
    </fieldset>
  );
}

const FORMAT_RATIO: Record<VideoSettings["format"], string> = { "9:16": "9 / 16", "4:5": "4 / 5", "1:1": "1 / 1", "16:9": "16 / 9" };

function Section({ icon: Icon, title, hint, children }: { icon: typeof IconMovie; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="[&_legend]:sr-only">
      <header className="mb-4 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon size={18} aria-hidden="true" /></span>
        <div>
          <h3 className="text-sm font-bold text-foreground">{title}</h3>
          {hint && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{hint}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function SettingsStep({ token, project, onChange, onError, onBack, onRendered }: { token: string; project: VideoProject; onChange: (p: VideoProject) => void; onError: Fail; onBack: () => void; onRendered: (p: VideoProject) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [coverBusy, setCoverBusy] = useState<"free" | "ai" | null>(null);
  const [cover, setCover] = useState(project.settings.cover_title || project.scenario?.title || "");
  const s = project.settings;

  async function patch(change: Partial<VideoSettings>) {
    setError("");
    try {
      onChange(await saveVideoSettings(token, project.id, change));
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "ذخیره ناموفق بود");
    }
  }

  async function makeCovers(ai: boolean) {
    setCoverBusy(ai ? "ai" : "free");
    setError("");
    try {
      onChange(await makeVideoCovers(token, project.id, cover.trim(), ai));
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "ساخت کاور ناموفق بود");
    } finally {
      setCoverBusy(null);
    }
  }

  async function pickCover(file: string) {
    setError("");
    try {
      onChange(await chooseVideoCover(token, project.id, file));
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "انتخاب کاور ناموفق بود");
    }
  }

  async function build() {
    setBusy(true);
    setError("");
    try {
      if (cover.trim() && cover !== s.cover_title) await saveVideoSettings(token, project.id, { cover_title: cover.trim() });
      onRendered(await renderVideo(token, project.id));
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "شروع ساخت ناموفق بود");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="divide-y divide-border rounded-xl border border-border bg-surface p-6 [&>*]:py-7 [&>*:first-child]:pt-0 [&>*:last-child]:pb-0">
        <Section icon={IconDeviceMobile} title="قالب و ابعاد" hint="نسبت تصویر را بر اساس جایی که ویدیو را منتشر می‌کنی انتخاب کن.">
          <Cards legend="قالب و ابعاد" value={s.format} options={FORMATS} onChange={(v) => patch({ format: v })} columns="grid-cols-2 sm:grid-cols-4"
            note={project.info.format_reason ? <p className="mt-1 text-xs text-muted-foreground">از گفتگوی سناریو تشخیص داده شد. {project.info.format_reason}</p> : null} />
        </Section>
        <Section icon={IconPalette} title="سبک ویدیو" hint="حال‌وهوای بصری ویدیو؛ طراح هوش مصنوعی ویدیو را با همین سبک می‌سازد.">
          <StylePicker project={project} onChange={(v) => patch({ style: v })} />
        </Section>
        <Section icon={IconMicrophone} title="صدا و دوبله">
          <VoicePicker token={token} value={s.voice} onChange={(v) => patch({ voice: v })} onError={onError} />
        </Section>
        <Section icon={IconGauge} title="سرعت گفتار" hint="سرعت خواندن متن توسط گوینده.">
          <Segment legend="سرعت گفتار" value={s.speed} options={SPEEDS} onChange={(v) => patch({ speed: v })} />
        </Section>
        <Section icon={IconTextCaption} title="زیرنویس" hint="زمان‌بندی از روی صدای گوینده تنظیم می‌شود.">
          <div className="flex flex-wrap gap-6">
            <Segment legend="سبک نمایش" value={s.subtitle_mode} options={SUB_MODES} onChange={(v) => patch({ subtitle_mode: v })} />
            <Segment legend="جای زیرنویس" value={s.subtitle_pos} options={SUB_POS} onChange={(v) => patch({ subtitle_pos: v })} />
          </div>
        </Section>
        <Section icon={IconPhoto} title="کاور" hint="اول عنوان را بنویس و «ساخت کاور» را بزن؛ سه طرح با سه مدل تصویرساز به اندازه‌ی قالب ویدیو ساخته می‌شود و یکی را انتخاب می‌کنی.">
          <label htmlFor="cover-title" className="sr-only">عنوان روی کاور</label>
          <textarea id="cover-title" rows={2} maxLength={80} className="field" placeholder="عنوان روی کاور" value={cover} onChange={(e) => setCover(e.target.value)} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="button" variant="outline" onClick={() => makeCovers(false)} disabled={!!coverBusy || !cover.trim() || !project.covers.has_reference}>
              <IconPhoto size={17} aria-hidden="true" />{coverBusy === "free" ? "در حال ساخت…" : "کاور رایگان از قاب ویدیو"}
            </Button>
            <Button type="button" variant="outline" onClick={() => makeCovers(true)} disabled={!!coverBusy || !cover.trim()}>
              <IconPalette size={17} aria-hidden="true" />{coverBusy === "ai" ? "در حال ساخت طرح‌ها…" : "طرح‌های هوش مصنوعی"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {project.covers.has_reference
              ? `کاور رایگان از یک قاب کلیپ یا ویدیوی خودت ساخته می‌شود و کردیتی ندارد. طرح‌های هوش مصنوعی همان قاب را زیباتر می‌کنند و ${fa(project.covers.price)} کردیت جدا از هزینه‌ی ساخت ویدیو دارند.`
              : `برای کاور رایگان اول یک کلیپ بفرست یا ویدیو را بساز. طرح‌های هوش مصنوعی ${fa(project.covers.price)} کردیت جدا از هزینه‌ی ساخت ویدیو دارند.`}
            {coverBusy === "ai" ? " ساخت چند دقیقه طول می‌کشد." : ""}
          </p>
          {project.covers.options.length > 0 && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              {project.covers.options.map((o) => (
                <label key={o.file} className="block cursor-pointer">
                  <input type="radio" name="cover" className="peer sr-only" checked={project.covers.chosen === o.file} onChange={() => pickCover(o.file)} />
                  <span className="block overflow-hidden rounded-xl border border-border bg-surface transition-colors peer-checked:border-foreground peer-checked:bg-surface-2 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                    <img src={o.url} alt={`کاور ${o.label}`} className="w-full bg-surface-2 object-cover" style={{ aspectRatio: FORMAT_RATIO[s.format] }} />
                    <span className="flex items-center justify-between gap-2 p-2 text-xs"><span className="font-bold text-foreground">{o.label}</span>{project.covers.chosen === o.file && <IconCheck size={14} aria-hidden="true" />}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Section>
      </div>

      <aside className="h-fit space-y-4 rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold text-foreground">هزینه‌ی ساخت</h2>
        <p className="text-xs text-muted-foreground">قالب {s.format} · حدود {fa(project.estimate.seconds)} ثانیه</p>
        <ul className="space-y-2 text-sm">
          {project.estimate.lines.map((l) => (
            <li key={l.label} className="flex justify-between gap-3 text-secondary-foreground"><span>{l.label}</span><span className="font-bold text-foreground">{fa(l.credits)}</span></li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-border pt-3 font-bold text-foreground"><span>جمع</span><span>{fa(project.estimate.total)} کردیت</span></div>
        <div className="rounded-lg bg-surface-2 p-3 text-xs leading-6 text-secondary-foreground">
          <p className="font-bold text-foreground">شامل {fa(project.estimate.included_edits)} بار ویرایش</p>
          بعد از ساخت اولیه می‌تونی متن، صدا، زیرنویس یا کاور رو {fa(project.estimate.included_edits)} بار عوض کنی، بدون هزینه‌ی اضافه. ویرایش بعدی هر بار {fa(project.estimate.extra_edit)} کردیت است.
        </div>
        <p className="text-xs text-muted-foreground">در دوره‌ی آزمایشی کردیتی کسر نمی‌شود؛ این عددها برآورد تعرفه‌ی آینده‌اند.</p>
        <ErrorText>{error}</ErrorText>
        <Button type="button" className="w-full" onClick={build} disabled={busy || project.status === "rendering"}><IconVideo size={17} aria-hidden="true" />{busy ? "در حال شروع…" : "ساخت ویدیو"}</Button>
        <Button type="button" variant="outline" className="w-full" onClick={onBack}>بازگشت به سناریو</Button>
      </aside>
    </div>
  );
}

function ResultStep({ token, project, onChange, onError }: { token: string; project: VideoProject; onChange: (p: VideoProject) => void; onError: Fail }) {
  const [shown, setShown] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = project.versions[project.versions.length - 1];
  const version = project.versions.find((v) => v.n === shown) ?? latest;

  async function revise(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      onChange(await reviseVideo(token, project.id, text.trim()));
      setText("");
      setShown(null);
    } catch (err) {
      onError(err);
      setError(err instanceof Error ? err.message : "اعمال ویرایش ناموفق بود");
    } finally {
      setBusy(false);
    }
  }

  if (!version) return <ErrorText>{project.last_failure ?? "ساخت ویدیو ناموفق بود"}</ErrorText>;
  const next = project.edits.used + 1;
  let cursor = 0;
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <video key={version.video_url} src={version.video_url} poster={version.poster_url} controls playsInline className="aspect-[9/16] max-h-[70vh] w-full rounded-xl bg-foreground/90 object-contain shadow-elevated" style={{ aspectRatio: aspectOf(version.settings.format) }} />
        <a href={`${version.video_url}&download=true`} download className="flex h-10 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-bold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"><IconDownload size={17} aria-hidden="true" />دانلود MP4</a>
        <div className="rounded-xl border border-border bg-surface p-3">
          <p className="mb-2 text-sm font-bold text-foreground">کاور</p>
          <img src={version.cover_url} alt="کاور ویدیو" className="w-full rounded-lg" />
          <a href={`${version.cover_url}&download=true`} download className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"><IconDownload size={15} aria-hidden="true" />دانلود کاور</a>
        </div>
      </div>
      <div className="min-w-0 space-y-6">
        <form onSubmit={revise} className="rounded-xl border border-border bg-surface p-4">
          <label htmlFor="rev" className="field-label">چی رو عوض کنم؟</label>
          <div className="mb-3 flex flex-wrap gap-2">
            {EDIT_CHIPS.map((c) => <button key={c} type="button" onClick={() => setText(c)} className="rounded-full border border-border px-3 py-1 text-xs text-secondary-foreground outline-none transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">{c}</button>)}
          </div>
          <div className="flex items-end gap-2">
            <textarea id="rev" rows={2} maxLength={500} className="field min-h-0 flex-1" placeholder="مثلاً: صدا رو زنانه کن و متن صحنه‌ی آخر رو کوتاه‌تر بنویس" value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
            <Button type="submit" disabled={busy || !text.trim()}>{busy ? "در حال اعمال…" : `اعمال ویرایش ${fa(next)}`}</Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{next <= project.edits.included ? `بدون هزینه‌ی اضافه. ویرایش ${fa(next)} از ${fa(project.edits.included)}.` : `از ویرایش ${fa(project.edits.included + 1)} به بعد هر بار ${fa(project.estimate.extra_edit)} کردیت (در دوره‌ی آزمایشی کسر نمی‌شود).`}</p>
          <ErrorText>{error}</ErrorText>
        </form>

        <section aria-labelledby="ver-h" className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between"><h2 id="ver-h" className="font-bold text-foreground">ویرایش‌ها</h2><span className="text-xs text-muted-foreground">{fa(project.edits.used)} از {fa(project.edits.included)} مصرف شده</span></div>
          <ol className="space-y-2">
            {[...project.versions].reverse().map((v) => (
              <li key={v.n}>
                <button type="button" onClick={() => setShown(v.n)} aria-pressed={v.n === version.n} className={cn("flex w-full items-center gap-3 rounded-lg border p-2 text-right outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring", v.n === version.n ? "border-foreground bg-surface-2" : "border-border hover:border-foreground/30")}>
                  <img src={v.poster_url} alt="" className="h-14 w-8 shrink-0 rounded object-cover" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-foreground">نسخه {fa(v.n)}{v.n === latest.n ? " · نسخه‌ی فعلی" : ""}</span><span className="block truncate text-xs text-muted-foreground">{v.note}</span></span>
                </button>
              </li>
            ))}
          </ol>
          {version.n !== latest.n && <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => rollbackVideo(token, project.id, version.n).then(onChange).catch(onError)}>برگرد به متن و تنظیمات این نسخه</Button>}
        </section>

        <section aria-labelledby="scn-h">
          <h2 id="scn-h" className="mb-3 font-bold text-foreground">صحنه‌ها</h2>
          <ol className="space-y-2">
            {version.scenario.scenes.map((s, i) => {
              const start = cursor;
              cursor += s.duration;
              return (
                <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-foreground">{fa(i + 1)}. {s.title || s.text.replace("\n", " ")}</span><span className="shrink-0 text-xs text-muted-foreground">{fa(start)}–{fa(cursor)} ث</span></div>
                  {s.narration && <p className="mt-1 text-xs leading-6 text-muted-foreground">{s.narration}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

function aspectOf(format: VideoSettings["format"]) {
  return { "9:16": "9 / 16", "4:5": "4 / 5", "1:1": "1 / 1", "16:9": "16 / 9" }[format];
}

function etaText(seconds: number | null | undefined): string {
  if (seconds == null) return "در حال برآورد زمان";
  if (seconds < 60) return "کمتر از یک دقیقه مانده";
  return `حدود ${Math.ceil(seconds / 60).toLocaleString("fa-IR")} دقیقه مانده`;
}

function RenderProgress({ progress }: { progress: VideoProject["progress"] }) {
  const percent = progress?.percent ?? 1;
  return (
    <div role="status" className="space-y-3 rounded-xl border border-border bg-surface p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-bold text-foreground">{progress?.label ?? "ساخت ویدیو شروع شد"}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{etaText(progress?.eta)}. می‌تونی از صفحه خارج بشی و بعداً برگردی.</p>
        </div>
        <span className="shrink-0 text-lg font-black tabular-nums text-foreground">{percent.toLocaleString("fa-IR")}٪</span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="پیشرفت ساخت ویدیو" className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-brand-solid transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function Workspace({ token, id, onError }: { token: string; id: string; onError: Fail }) {
  const [project, setProject] = useState<VideoProject | null>(null);
  const [missing, setMissing] = useState(false);
  const [step, setStep] = useState(1);
  const started = useRef(false);

  useEffect(() => {
    fetchVideoProject(token, id).then((p) => {
      setProject(p);
      if (!started.current) {
        started.current = true;
        setStep(p.versions.length || p.status === "rendering" ? 3 : 1);
      }
    }).catch((err) => { onError(err); setMissing(true); });
  }, [token, id, onError]);

  useEffect(() => {
    if (project?.status !== "rendering") return;
    const timer = setInterval(() => fetchVideoProject(token, id).then(setProject).catch(onError), 2000);
    return () => clearInterval(timer);
  }, [project?.status, token, id, onError]);

  if (missing) return <p className="text-sm text-muted-foreground">پروژه پیدا نشد. <Link href="/video" className="text-brand underline">بازگشت</Link></p>;
  if (!project) return <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>;

  const reachable = project.versions.length || project.status === "rendering" ? 3 : project.ready ? 2 : 1;
  const rendering = project.status === "rendering";
  return (
    <div className="space-y-6">
      <Stepper step={step} onStep={setStep} reachable={reachable} />
      {step === 1 && <ScenarioStep token={token} project={project} onChange={setProject} onError={onError} onNext={() => setStep(2)} />}
      {step === 2 && <SettingsStep token={token} project={project} onChange={setProject} onError={onError} onBack={() => setStep(1)} onRendered={(p) => { setProject(p); setStep(3); }} />}
      {step === 3 && (
        <>
          {rendering && (
            <RenderProgress progress={project.progress} />
          )}
          {project.status === "failed" && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">{project.error ?? "ساخت ویدیو ناموفق بود"}<span className="mt-1 block text-foreground/70">به تنظیمات برگرد و دوباره بساز.</span></div>}
          {!rendering && project.versions.length > 0 && <ResultStep token={token} project={project} onChange={setProject} onError={onError} />}
          {!rendering && project.versions.length === 0 && <Button type="button" variant="outline" onClick={() => setStep(2)}>بازگشت به تنظیمات</Button>}
        </>
      )}
    </div>
  );
}

function ComingSoon() {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-border bg-surface p-8 text-center">
      <IconMovie size={32} className="mx-auto text-brand" aria-hidden="true" />
      <h2 className="mt-4 font-bold text-foreground">ویدیوساز به‌زودی می‌آید</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">دسترسی ویدیوساز فعلاً آزمایشی است و به‌زودی برای همه باز می‌شود. وقتی آماده شد همین‌جا خبرت می‌کنیم.</p>
    </div>
  );
}

function VideoPage() {
  const params = useSearchParams();
  const id = params.get("id");
  const { token, logout } = useVideoToken();
  const nav = useAccountNav({ active: "video" });
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    if (token) fetchVideoAccess(token).then(setAllowed);
  }, [token]);
  const onError = useCallback((err: unknown) => {
    if (err instanceof Error && err.message === "UNAUTHORIZED") logout();
  }, [logout]);

  if (!token || allowed === null) return <ShellLoading />;
  return (
    <AppShell
      width="wide"
      nav={nav}
      backHref={id ? "/video" : "/"}
      primaryAction={<NewProjectLink />}
      onLogout={logout}
      title="ویدیوساز"
      description="از گفتگو تا ریل آماده، با صدا، زیرنویس و کاور."
    >
      {!allowed ? <ComingSoon /> : id ? <Workspace token={token} id={id} onError={onError} /> : <ProjectList token={token} onError={onError} />}
    </AppShell>
  );
}

export default function Page() {
  return <Suspense fallback={<ShellLoading />}><VideoPage /></Suspense>;
}
