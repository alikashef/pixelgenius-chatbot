"use client";

import { useEffect, useRef, useState } from "react";
import { testImageGeneration, updateAISettings } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/admin/SkillsManager";
import Select from "@/components/ui/select";

type LayerKey = "frontend" | "backend" | "database" | "extras";

interface Tier {
  key: string;
  label: string;
  description: string;
  frontend: string[];
  backend: string[];
  database: string[];
  extras: string[];
}

interface ImageConfig {
  enabled: boolean;
  model: string;
  size: string;
  max_images: number;
}

const LAYERS: { key: LayerKey; label: string; options: string[] }[] = [
  {
    key: "frontend",
    label: "فرانت‌اند",
    options: ["Next.js", "React (Vite)", "Vue / Nuxt", "Svelte / SvelteKit", "Astro", "TypeScript", "JavaScript", "HTML/CSS ساده", "Tailwind CSS", "shadcn/ui", "WordPress Theme", "Flutter", "React Native"],
  },
  {
    key: "backend",
    label: "بک‌اند",
    options: ["FastAPI (Python)", "Django (Python)", "Node.js / Express", "NestJS", "Next.js API Routes", "Laravel (PHP)", "Go (Gin/Fiber)", "ASP.NET Core", "Spring Boot (Java)", "WordPress / WooCommerce", "Strapi / Directus", "Supabase / Firebase"],
  },
  {
    key: "database",
    label: "دیتابیس",
    options: ["PostgreSQL", "MySQL / MariaDB", "SQLite", "MongoDB", "Redis", "pgvector", "Qdrant", "Elasticsearch", "Meilisearch"],
  },
  {
    key: "extras",
    label: "زیرساخت و سرویس‌ها",
    options: ["Docker", "Caddy / Nginx", "Celery / RQ", "S3 / MinIO", "Zarinpal", "SMS (ملی‌پیامک)", "Cloudflare CDN", "CI/CD (GitHub Actions)", "LLM API (OpenAI-compatible)", "WebSocket / SSE"],
  },
];

const IMAGE_SIZES = ["512x512", "1024x1024", "1024x1792", "1792x1024"];

interface Props {
  getToken: () => string;
  settings: Record<string, unknown>;
  onSettingsChange: (settings: Record<string, unknown>) => void;
  onUnauthorized: () => void;
}

export default function DesignerSettings({ getToken: getTokenProp, settings, onSettingsChange, onUnauthorized: onUnauthorizedProp }: Props) {
  // the parent recreates these callbacks on every render
  const tokenRef = useRef(getTokenProp);
  const unauthorizedRef = useRef(onUnauthorizedProp);
  tokenRef.current = getTokenProp;
  unauthorizedRef.current = onUnauthorizedProp;

  const [tiers, setTiers] = useState<Tier[]>([]);
  const [image, setImage] = useState<ImageConfig>({ enabled: true, model: "", size: "1024x1024", max_images: 4 });
  const [chatModel, setChatModel] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [testPrompt, setTestPrompt] = useState("minimal flat illustration of a laptop on a desk, soft violet gradient background, no text");
  const [testing, setTesting] = useState(false);
  const [testUrl, setTestUrl] = useState("");

  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current || !Array.isArray(settings.designer_stack_tiers)) return;
    loaded.current = true;
    setTiers(settings.designer_stack_tiers as Tier[]);
    setChatModel(String(settings.designer_ai_model || ""));
    if (settings.image_generation) setImage(settings.image_generation as ImageConfig);
  }, [settings]);

  function fail(err: unknown) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") unauthorizedRef.current();
    else setMessage({ type: "error", text: err instanceof Error ? err.message : "خطای ناشناخته" });
  }

  function patchTier(index: number, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
    setDirty(true);
  }

  function patchImage(patch: Partial<ImageConfig>) {
    setImage((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const data = await updateAISettings(tokenRef.current(), { designer_stack_tiers: tiers, image_generation: image, designer_ai_model: chatModel });
      onSettingsChange(data.settings);
      setDirty(false);
      setMessage({ type: "ok", text: "تنظیمات طراحی محصول ذخیره شد و از گفتگوی بعدی اعمال می‌شود." });
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setMessage(null);
    setTestUrl("");
    try {
      // the test uses the saved model, so persist pending edits first
      if (dirty) await save();
      const result = await testImageGeneration(tokenRef.current(), testPrompt);
      setTestUrl(result.url);
    } catch (err) {
      fail(err);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">استک بر اساس اندازه پروژه</h2>
            <p className="text-muted-foreground text-xs mt-1 leading-6">
              برای هر اندازه، زبان‌ها و ابزارهای هر لایه را انتخاب کنید. چت طراح اندازهٔ پروژه را از نیاز مشتری تشخیص می‌دهد و استک را از همین جدول برمی‌دارد.
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="bg-primary hover:bg-primary-hover disabled:opacity-50 text-primary-foreground font-bold rounded-xl px-5 py-3 text-sm transition-colors"
          >
            {saving ? "در حال ذخیره..." : dirty ? "ذخیره تغییرات" : "ذخیره شد"}
          </button>
        </div>

        {message && (
          <p className={cn("rounded-xl border px-4 py-3 text-sm", message.type === "ok" ? "border-success/30 bg-success/10 text-success" : "border-danger/30 bg-danger/10 text-danger")}>
            {message.text}
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="designer-chat-model" className="block text-sm font-semibold text-foreground">مدل گفتگوی طراح محصول</label>
          <Select id="designer-chat-model" value={chatModel} onChange={(event) => { setChatModel(event.target.value); setDirty(true); }} className="admin-input" dir="auto">
            <option value="">همان مدل پیش‌فرض فروش</option>
            <option value="gapgpt-qwen-3.6">GapGPT Qwen 3.6</option>
            <option value="gpt-5-mini">GPT-5 mini</option>
            <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
            <option value="claude-opus-4-6">Claude Opus 4.6</option>
          </Select>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {tiers.map((tier, index) => (
            <div key={tier.key} className="rounded-2xl border border-border bg-background/40 p-4 space-y-4">
              <div className="space-y-2">
                <input className="admin-input font-semibold" value={tier.label} onChange={(e) => patchTier(index, { label: e.target.value })} />
                <textarea
                  className="admin-textarea min-h-[72px] text-xs"
                  value={tier.description}
                  onChange={(e) => patchTier(index, { description: e.target.value })}
                  placeholder="چه پروژه‌هایی در این اندازه‌اند؟"
                />
              </div>
              {LAYERS.map((layer) => (
                <MultiSelect
                  key={layer.key}
                  label={layer.label}
                  options={layer.options}
                  value={tier[layer.key] || []}
                  onChange={(value) => patchTier(index, { [layer.key]: value } as Partial<Tier>)}
                />
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-foreground">تولید تصویر با هوش مصنوعی</h2>
            <p className="text-muted-foreground text-xs mt-1 leading-6">
              وقتی کانفیگ پروژه به عکس نیاز دارد (Hero، بنر، تصویر محصول)، طراح برای هر تصویر یک prompt می‌نویسد و با این مدل ساخته می‌شود؛ آدرس تصویر داخل کانفیگ قرار می‌گیرد.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-foreground cursor-pointer">
            <Switch checked={image.enabled} onChange={() => patchImage({ enabled: !image.enabled })} />
            فعال
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="block md:col-span-1">
            <span className="block text-muted-foreground text-xs mb-2">شناسهٔ مدل</span>
            <input dir="ltr" className="admin-input" value={image.model} onChange={(e) => patchImage({ model: e.target.value })} />
          </label>
          <label className="block">
            <span className="block text-muted-foreground text-xs mb-2">اندازهٔ تصویر</span>
            <Select className="admin-input" value={image.size} onChange={(e) => patchImage({ size: e.target.value })}>
              {IMAGE_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="block text-muted-foreground text-xs mb-2">حداکثر تصویر در هر پروژه</span>
            <input
              type="number"
              min={0}
              max={8}
              className="admin-input"
              value={image.max_images}
              onChange={(e) => patchImage({ max_images: Math.min(8, Math.max(0, Number(e.target.value) || 0)) })}
            />
          </label>
        </div>

        <div className="rounded-2xl border border-dashed border-border p-4 space-y-3">
          <p className="text-xs text-muted-foreground">تست مدل (هر تست یک تصویر واقعی می‌سازد و هزینه دارد)</p>
          <textarea dir="ltr" className="admin-textarea min-h-[72px]" value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} />
          <button
            onClick={runTest}
            disabled={testing || !testPrompt.trim()}
            className="border border-border hover:border-brand-line disabled:opacity-50 rounded-xl px-4 py-2 text-xs text-foreground transition-colors"
          >
            {testing ? "در حال ساخت تصویر..." : "ساخت تصویر آزمایشی"}
          </button>
          {testUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={testUrl} alt="تصویر آزمایشی" className="max-h-72 rounded-xl border border-border" />
          )}
        </div>
      </section>
    </div>
  );
}

function MultiSelect({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (value: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const all = [...options, ...value.filter((v) => !options.includes(v))];

  function toggle(option: string) {
    onChange(value.includes(option) ? value.filter((v) => v !== option) : [...value, option]);
  }

  function addCustom() {
    const name = custom.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setCustom("");
  }

  return (
    <div>
      <span className="block text-muted-foreground text-xs mb-2">
        {label} <span className="text-brand">({value.length.toLocaleString("fa-IR")})</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {all.map((option) => {
          const on = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(option)}
              dir="auto"
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                on
                  ? "border-primary bg-brand-soft text-brand"
                  : "border-border text-muted-foreground hover:border-brand-line",
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
      <input
        dir="auto"
        className="admin-input mt-2 !py-1.5 text-xs"
        placeholder="گزینهٔ دلخواه + Enter"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addCustom();
          }
        }}
      />
    </div>
  );
}
