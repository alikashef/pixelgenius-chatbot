"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Skill,
  SkillCategory,
  createSkill,
  deleteSkill,
  fetchSkillCategories,
  fetchSkillContent,
  fetchSkills,
  reindexSkills,
  updateAISettings,
  updateSkill,
  uploadSkillFile,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import Select from "@/components/ui/select";

interface Props {
  getToken: () => string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
  onUnauthorized: () => void;
}

const ACCEPT = ".md,.markdown,.txt,.json,.csv,.pdf";

export default function SkillsManager({ getToken: getTokenProp, settings, onSettingsChange, onUnauthorized: onUnauthorizedProp }: Props) {
  // the parent recreates these callbacks on every render; keep stable references so effects do not loop
  const tokenRef = useRef(getTokenProp);
  const unauthorizedRef = useRef(onUnauthorizedProp);
  tokenRef.current = getTokenProp;
  unauthorizedRef.current = onUnauthorizedProp;
  const getToken = useCallback(() => tokenRef.current(), []);
  const onUnauthorized = useCallback(() => unauthorizedRef.current(), []);
  const [categories, setCategories] = useState<SkillCategory[]>([]);
  const [active, setActive] = useState("ai_rag");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("");
  const [content, setContent] = useState("");
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const skillsEnabled = settings.skills_enabled !== false;
  const topK = Number(settings.skills_top_k) || 2;
  const briefTopK = Number(settings.skills_brief_top_k) || 3;
  const activeCategory = categories.find((c) => c.key === active);

  const run = useCallback(
    async <T,>(action: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setMessage(null);
      try {
        const result = await action();
        if (success) setMessage({ type: "ok", text: success });
        return result;
      } catch (err) {
        if (err instanceof Error && err.message === "UNAUTHORIZED") onUnauthorized();
        else setMessage({ type: "error", text: err instanceof Error ? err.message : "خطای ناشناخته" });
      }
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    const token = getToken();
    const [cats, list] = await Promise.all([fetchSkillCategories(token), fetchSkills(token, active)]);
    setCategories(cats);
    setSkills(list);
  }, [getToken, active]);

  useEffect(() => {
    setLoading(true);
    run(load).finally(() => setLoading(false));
  }, [load, run]);

  // vectors are computed in the background after an upload; poll until every chunk has one
  const hasPendingVectors = skills.some((s) => s.enabled && s.embedded_count < s.chunk_count);
  useEffect(() => {
    if (!hasPendingVectors) return;
    const timer = setInterval(() => run(load), 6000);
    return () => clearInterval(timer);
  }, [hasPendingVectors, load, run]);

  function resetForm() {
    setTitle("");
    setKeywords("");
    setContent("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    for (const file of list) {
      const done = await run(
        () => uploadSkillFile(getToken(), active, file, list.length === 1 ? title : "", keywords),
        `«${file.name}» اضافه شد؛ ایندکس وکتور در پس‌زمینه ساخته می‌شود.`,
      );
      if (!done) break;
    }
    resetForm();
    await run(load);
    setBusy(false);
  }

  async function handleAddText() {
    setBusy(true);
    const created = await run(
      () => createSkill(getToken(), { category: active, title, content, keywords }),
      "مهارت جدید ذخیره شد.",
    );
    if (created) {
      resetForm();
      await run(load);
    }
    setBusy(false);
  }

  async function toggle(skill: Skill) {
    await run(() => updateSkill(getToken(), skill.id, { enabled: !skill.enabled }));
    await run(load);
  }

  async function remove(skill: Skill) {
    if (!window.confirm(`«${skill.title}» حذف شود؟`)) return;
    await run(() => deleteSkill(getToken(), skill.id), "حذف شد.");
    await run(load);
  }

  async function toggleExpand(skill: Skill) {
    if (expanded[skill.id] !== undefined) {
      setExpanded(({ [skill.id]: _removed, ...rest }) => rest);
      return;
    }
    const full = await run(() => fetchSkillContent(getToken(), skill.id));
    if (full) setExpanded((prev) => ({ ...prev, [skill.id]: full.content }));
  }

  async function saveGlobal(partial: Record<string, unknown>) {
    const data = await run(() => updateAISettings(getToken(), partial));
    if (data) onSettingsChange(data.settings);
  }

  return (
    <div className="space-y-5">
      <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">مهارت‌ها و دانش چت طراحی محصول</h2>
            <p className="text-muted-foreground text-xs mt-1 leading-6">
              فایل یا متن تخصصی هر بخش (هوش مصنوعی/RAG، فرانت، بک‌اند، دیتابیس، معماری…) را اضافه کنید. در هر گفتگو، مرتبط‌ترین
              بخش‌های هر دسته با جستجوی کلیدواژه و وکتور انتخاب و به پرامپت طراح اضافه می‌شود.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
              <Switch checked={skillsEnabled} onChange={() => saveGlobal({ skills_enabled: !skillsEnabled })} />
              استفاده در چت
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              قطعه در هر دسته
              <Select
                value={topK}
                onChange={(e) => saveGlobal({ skills_top_k: Number(e.target.value) })}
                className="admin-input !w-16 !py-1.5"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              مهارت در JSON هر دسته
              <Select
                value={briefTopK}
                onChange={(e) => saveGlobal({ skills_brief_top_k: Number(e.target.value) })}
                className="admin-input !w-16 !py-1.5"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </label>
            <button
              onClick={async () => {
                if (await run(() => reindexSkills(getToken()), "ایندکس وکتور از نو ساخته می‌شود.")) await run(load);
              }}
              className="border border-border hover:border-brand-line rounded-xl px-4 py-2 text-xs text-foreground transition-colors"
            >
              ساخت مجدد ایندکس
            </button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setActive(c.key)}
            className={cn(
              "rounded-2xl border p-3 text-right transition-all hover:-translate-y-1",
              active === c.key
                ? "border-primary bg-brand-soft"
                : "border-border bg-surface hover:border-brand-line",
            )}
          >
            <span className="block text-xs font-semibold text-foreground leading-5">{c.label}</span>
            <span className="block text-[11px] text-muted-foreground mt-1">
              {c.enabled_count.toLocaleString("fa-IR")} فعال از {c.count.toLocaleString("fa-IR")}
            </span>
          </button>
        ))}
      </div>

      {message && (
        <p
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            message.type === "ok"
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger",
          )}
        >
          {message.text}
        </p>
      )}

      <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-foreground">افزودن به «{activeCategory?.label}»</h3>
            <p className="text-muted-foreground text-xs mt-1">{activeCategory?.hint}</p>
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden text-xs">
            {(["file", "text"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn("px-4 py-2 transition-colors", mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
              >
                {m === "file" ? "آپلود فایل" : "نوشتن متن"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <input className="admin-input" placeholder="عنوان (اختیاری برای فایل)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input
            className="admin-input"
            placeholder="کلیدواژه‌ها با کاما جدا شوند: rag, pgvector, چت‌بات"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
          />
        </div>

        {mode === "file" ? (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              "cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging ? "border-primary bg-brand-soft" : "border-border hover:border-brand-line",
            )}
          >
            <p className="text-sm text-foreground">{busy ? "در حال آپلود..." : "فایل را اینجا رها کنید یا کلیک کنید"}</p>
            <p className="text-xs text-muted-foreground mt-2">MD، TXT، JSON، CSV و PDF — حداکثر ۵ مگابایت</p>
            <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          </div>
        ) : (
          <>
            <textarea
              className="admin-textarea min-h-[200px]"
              placeholder="متن مهارت یا دانش فنی را اینجا بنویسید..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              onClick={handleAddText}
              disabled={busy || !title.trim() || content.trim().length < 20}
              className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold rounded-xl px-5 py-3 text-sm transition-colors"
            >
              {busy ? "در حال ذخیره..." : "ذخیره مهارت"}
            </button>
          </>
        )}
      </section>

      <section className="space-y-3">
        {loading && <p className="text-center text-sm text-muted-foreground">در حال بارگذاری...</p>}
        {!loading && skills.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
            هنوز مهارتی در این دسته نیست.
          </p>
        )}
        {skills.map((skill) => {
          const vectorReady = skill.chunk_count > 0 && skill.embedded_count >= skill.chunk_count;
          return (
            <article
              key={skill.id}
              className={cn(
                "bg-surface border border-border rounded-2xl p-4 transition-opacity",
                !skill.enabled && "opacity-55",
              )}
            >
              <div className="flex items-start gap-3">
                <Switch checked={skill.enabled} onChange={() => toggle(skill)} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-semibold text-sm text-foreground">{skill.title}</h4>
                    {skill.builtin && <Badge tone="violet">پیش‌فرض</Badge>}
                    {skill.source_name && <Badge tone="muted">{skill.source_name}</Badge>}
                    <Badge tone={vectorReady ? "green" : "yellow"}>
                      {vectorReady ? "وکتور آماده" : `وکتور ${skill.embedded_count}/${skill.chunk_count}`}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {skill.chunk_count.toLocaleString("fa-IR")} قطعه · {skill.size.toLocaleString("fa-IR")} کاراکتر
                    </span>
                  </div>
                  {skill.keywords.length > 0 && (
                    <p className="mt-1 text-[11px] text-brand">{skill.keywords.join(" · ")}</p>
                  )}
                  <p className="mt-2 text-xs leading-6 text-muted-foreground whitespace-pre-wrap">
                    {expanded[skill.id] ?? `${skill.preview}${skill.size > 200 ? "…" : ""}`}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 text-xs">
                  <button onClick={() => toggleExpand(skill)} className="px-2 py-1 text-muted-foreground hover:text-foreground">
                    {expanded[skill.id] !== undefined ? "بستن" : "متن کامل"}
                  </button>
                  <button onClick={() => remove(skill)} className="px-2 py-1 text-danger hover:text-danger">حذف</button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

export function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-border")}
    >
      <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", checked ? "right-0.5" : "right-[18px]")} />
    </button>
  );
}

function Badge({ tone, children }: { tone: "violet" | "green" | "yellow" | "muted"; children: React.ReactNode }) {
  const tones = {
    violet: "bg-brand-soft text-brand border-brand-line",
    green: "bg-success/10 text-success border-success/20",
    yellow: "bg-warning/10 text-warning border-warning/20",
    muted: "bg-transparent text-muted-foreground border-border",
  };
  return <span dir="auto" className={cn("rounded-full border px-2 py-0.5 text-[11px]", tones[tone])}>{children}</span>;
}
