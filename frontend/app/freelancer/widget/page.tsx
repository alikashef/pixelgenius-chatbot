"use client";

import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowUp, IconCheck, IconExternalLink, IconMessageCircle, IconVolume, IconVolumeOff, IconX } from "@tabler/icons-react";
import AppShell, { NewProjectLink, ShellLoading, useAccountNav } from "@/components/AppShell";
import { CopyBlock } from "@/components/McpTour";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DEFAULT_WIDGET, fetchFreelancerSettings, updateWidgetSettings, WidgetColor, WidgetSettings, clearSession } from "@/lib/api";
import { ROBOT_SHAPES, WIDGET_COLORS, accentStyle, robotColors } from "@/lib/widget";

const RobotHead = dynamic(() => import("robot-heads").then((module) => module.RobotHead), {
  ssr: false,
  loading: () => <span className="block h-full w-full" />,
});

function Swatches({ name, value, onChange, label }: { name: string; value: WidgetColor; onChange: (c: WidgetColor) => void; label: string }) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(WIDGET_COLORS) as WidgetColor[]).map((key) => (
          <label key={key} className="cursor-pointer" title={WIDGET_COLORS[key].label}>
            <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} className="peer sr-only" />
            <span className="sr-only">{WIDGET_COLORS[key].label}</span>
            <span
              aria-hidden="true"
              className="grid h-9 w-9 place-items-center rounded-full border-2 border-transparent ring-1 ring-border transition peer-checked:border-background peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
              style={{ background: WIDGET_COLORS[key].hex }}
            >
              {value === key && <IconCheck size={15} stroke={3} style={{ color: `hsl(${WIDGET_COLORS[key].onHsl})` }} />}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function WidgetPreview({ widget, name }: { widget: WidgetSettings; name: string }) {
  const brand = widget.brand_name || name || "دستیار پروژه";
  const greeting = widget.greeting || `سلام! من دستیار هوشمند ${name || "تیم"} هستم. بهم بگو چه پروژه‌ای در ذهن داری؟`;
  const right = widget.position === "bottom-right";
  return (
    <div className="relative h-[560px] overflow-hidden rounded-2xl border border-border bg-surface-2 bg-dots" style={accentStyle(widget)}>
      <p className="absolute inset-x-0 top-3 text-center text-[11px] font-bold text-muted-foreground">پیش‌نمایش روی سایت تو</p>
      <div className={cn("absolute bottom-20 w-[300px] overflow-hidden rounded-2xl border border-border bg-background shadow-elevated", right ? "right-4" : "left-4")}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-solid text-brand-foreground" aria-hidden="true">
            <IconMessageCircle size={16} />
          </span>
          <p className="min-w-0 flex-1 truncate text-[13px] font-black text-foreground">{brand}</p>
          <IconX size={15} className="text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="flex flex-col items-center px-3 pt-3">
          <div className="h-[104px] w-[130px]" aria-hidden="true">
            <RobotHead shape={widget.robot_shape} state={widget.voice ? "speaking" : "idle"} size={100} floorShadow interactive={false} {...robotColors(widget.robot_color)} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-brand">
            {widget.voice ? <IconVolume size={13} aria-hidden="true" /> : <IconVolumeOff size={13} aria-hidden="true" />}
            {widget.voice ? "با صدا" : "بدون صدا"}
          </p>
        </div>
        <div className="space-y-2 p-3 text-[12px] leading-6">
          <p className="rounded-xl bg-surface-2 px-3 py-2 text-foreground">{greeting}</p>
          <div className="flex items-center gap-2 rounded-xl border border-input px-3 py-2 text-muted-foreground">
            <span className="flex-1">پیام بنویسید...</span>
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-solid text-brand-foreground" aria-hidden="true"><IconArrowUp size={14} /></span>
          </div>
        </div>
      </div>
      <span
        aria-hidden="true"
        className={cn("absolute bottom-4 grid h-12 w-12 place-items-center rounded-full bg-brand-solid text-brand-foreground shadow-elevated", right ? "right-4" : "left-4")}
      >
        <IconMessageCircle size={22} />
      </span>
    </div>
  );
}

export default function FreelancerWidgetPage() {
  const router = useRouter();
  const [widget, setWidget] = useState<WidgetSettings>(DEFAULT_WIDGET);
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [origin, setOrigin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function logout() {
    clearSession();
    router.push("/login");
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    const token = localStorage.getItem("freelancer_token");
    if (!token) { router.replace("/login"); return; }
    fetchFreelancerSettings(token)
      .then((data) => {
        setName(data.name);
        setBotToken(data.bot_token);
        setWidget({ ...DEFAULT_WIDGET, ...data.widget });
      })
      .catch(() => setError("دریافت تنظیمات ناموفق بود"))
      .finally(() => setLoading(false));
  }, [router]);

  function update(patch: Partial<WidgetSettings>) {
    setWidget((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem("freelancer_token");
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      setWidget(await updateWidgetSettings(token, widget));
      setSaved(true);
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") logout();
      else setError(err instanceof Error ? err.message : "ذخیره ناموفق بود");
    } finally {
      setSaving(false);
    }
  }

  const nav = useAccountNav({ active: "freelancer-widget" });

  if (loading) return <ShellLoading />;

  const snippet = `<script src="${origin}/embed.js" data-bot="${botToken}" async></script>`;

  return (
    <AppShell
      width="wide"
      nav={nav}
      primaryAction={<NewProjectLink />}
      user={name ? { name } : undefined}
      onLogout={logout}
      title="ظاهر و نصب ویجت"
      description="چت‌بات رو با برند خودت هماهنگ کن، روبات و صداش رو انتخاب کن و با یک خط کد روی سایتت نصبش کن."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-border bg-surface">
          <fieldset className="space-y-4 border-b border-border p-6">
            <legend className="sr-only">برند</legend>
            <p className="font-bold text-foreground">برند</p>
            <div>
              <label htmlFor="w-brand" className="field-label">اسم نمایشی ویجت</label>
              <input id="w-brand" className="field" maxLength={60} value={widget.brand_name} placeholder={name || "مثلاً استودیو سارا"} onChange={(e) => update({ brand_name: e.target.value })} />
            </div>
            <div>
              <label htmlFor="w-greeting" className="field-label">پیام خوش‌آمد <span className="font-normal text-muted-foreground">(اختیاری)</span></label>
              <textarea id="w-greeting" className="admin-textarea" rows={2} maxLength={300} value={widget.greeting} placeholder={`سلام! من دستیار هوشمند ${name || "تو"} هستم...`} onChange={(e) => update({ greeting: e.target.value })} />
            </div>
            <Swatches name="accent" label="رنگ اصلی" value={widget.accent} onChange={(accent) => update({ accent })} />
          </fieldset>

          <fieldset className="space-y-4 border-b border-border p-6">
            <legend className="sr-only">روبات</legend>
            <p className="font-bold text-foreground">روبات</p>
            <fieldset>
              <legend className="field-label">شکل سر</legend>
              <div className="grid grid-cols-4 gap-2">
                {ROBOT_SHAPES.map((shape) => (
                  <label key={shape.id} className="cursor-pointer">
                    <input type="radio" name="robot-shape" value={shape.id} checked={widget.robot_shape === shape.id} onChange={() => update({ robot_shape: shape.id })} className="peer sr-only" />
                    <span className="flex flex-col items-center gap-1 rounded-xl border border-border px-1 pb-2 pt-1 text-xs font-bold text-secondary-foreground transition-colors hover:border-foreground/30 peer-checked:border-foreground peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      <span className="h-14 w-14" aria-hidden="true">
                        <RobotHead shape={shape.id} size={56} antenna={false} floorShadow={false} interactive={false} {...robotColors(widget.robot_color)} />
                      </span>
                      {shape.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Swatches name="robot-color" label="رنگ روبات" value={widget.robot_color} onChange={(robot_color) => update({ robot_color })} />
            <div className="flex items-start justify-between gap-4 rounded-xl bg-surface-2 p-4">
              <div>
                <p id="w-voice-label" className="text-sm font-bold text-foreground">صدای روبات</p>
                <p className="mt-0.5 text-xs leading-6 text-muted-foreground">روبات موقع فکر کردن و جواب دادن حرف می‌زنه. مشتری هم هر وقت خواست می‌تونه صدا رو قطع کنه.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={widget.voice}
                aria-labelledby="w-voice-label"
                onClick={() => update({ voice: !widget.voice })}
                className={cn("relative mt-1 h-6 w-11 shrink-0 rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background", widget.voice ? "bg-success" : "bg-foreground/20")}
              >
                <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background shadow-xs transition-all", widget.voice ? "right-0.5" : "right-[22px]")} />
              </button>
            </div>
          </fieldset>

          <fieldset className="space-y-3 p-6">
            <legend className="sr-only">جایگاه</legend>
            <p className="font-bold text-foreground">جایگاه دکمه</p>
            <div className="grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
              {[{ id: "bottom-left", label: "پایین چپ" }, { id: "bottom-right", label: "پایین راست" }].map((pos) => (
                <label key={pos.id} className="cursor-pointer">
                  <input type="radio" name="position" value={pos.id} checked={widget.position === pos.id} onChange={() => update({ position: pos.id as WidgetSettings["position"] })} className="peer sr-only" />
                  <span className="flex min-h-9 items-center justify-center rounded-md text-sm font-bold text-muted-foreground peer-checked:bg-surface peer-checked:text-foreground peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-ring dark:peer-checked:bg-foreground/10">
                    {pos.label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface-2/60 px-6 py-4">
            {error && <p role="alert" className="ml-auto text-sm text-danger">{error}</p>}
            {saved && (
              <span role="status" className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-success">
                <IconCheck size={16} stroke={2.5} aria-hidden="true" />
                ذخیره شد؛ روی سایتت هم اعمال شد
              </span>
            )}
            <Button type="submit" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره تغییرات"}</Button>
          </div>
        </form>

        <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <WidgetPreview widget={widget} name={name} />
          <section aria-labelledby="install-title" className="rounded-xl border border-border bg-surface p-5">
            <h2 id="install-title" className="font-bold text-foreground">نصب روی سایت</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">این کد رو قبل از <code dir="ltr">&lt;/body&gt;</code> سایتت بذار. تغییرات ظاهر بدون تغییر کد اعمال می‌شن.</p>
            <CopyBlock text={snippet} label="کپی کد نصب ویجت" />
            <Button variant="outline" size="sm" asChild className="mt-3 w-full">
              <a href={`/chat?bot=${botToken}&embed=1`} target="_blank" rel="noopener noreferrer">
                <IconExternalLink size={15} aria-hidden="true" />
                پیش‌نمایش زنده
              </a>
            </Button>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
