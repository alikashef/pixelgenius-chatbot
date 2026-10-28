"use client";

import { FormEvent, ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconBrush,
  IconCheck,
  IconCircleCheck,
  IconCircleDashed,
  IconExternalLink,
  IconLayoutDashboard,
  IconPlus,
  IconSchool,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import {
  EMPTY_KNOWLEDGE,
  fetchFreelancerSettings,
  freelancerOnboarding,
  FreelancerField,
  FreelancerKnowledge,
  FreelancerService,
  updateFreelancerKnowledge, clearSession } from "@/lib/api";
import AppShell, { ShellLoading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const FIELDS: { id: Exclude<FreelancerField, "">; label: string; templates: string[] }[] = [
  { id: "web", label: "طراحی و توسعه وب", templates: ["لندینگ پیج", "سایت شرکتی", "فروشگاه اینترنتی"] },
  { id: "mobile", label: "اپلیکیشن موبایل", templates: ["اپ اندروید", "اپ iOS", "اپ کراس‌پلتفرم"] },
  { id: "uiux", label: "طراحی UI/UX", templates: ["طراحی UI سایت", "طراحی UI اپ موبایل", "تحقیق و تست کاربر"] },
  { id: "graphic", label: "گرافیک و برندینگ", templates: ["طراحی لوگو", "هویت بصری", "طراحی پست شبکه‌های اجتماعی"] },
  { id: "motion", label: "موشن و ویدیو", templates: ["موشن‌گرافیک تبلیغاتی", "لوگو موشن", "تدوین ویدیو"] },
  { id: "content", label: "محتوا و کپی‌رایتینگ", templates: ["مقاله سئو", "متن صفحات سایت", "کپشن شبکه‌های اجتماعی"] },
  { id: "marketing", label: "دیجیتال مارکتینگ", templates: ["مدیریت پیج اینستاگرام", "تبلیغات کلیکی", "استراتژی محتوا"] },
  { id: "seo", label: "سئو", templates: ["سئو تکنیکال", "سئو داخلی", "لینک‌سازی"] },
  { id: "other", label: "سایر", templates: [] },
];

const UNITS: { id: FreelancerService["unit"]; label: string }[] = [
  { id: "project", label: "هر پروژه" },
  { id: "item", label: "هر مورد" },
  { id: "hour", label: "ساعتی" },
  { id: "month", label: "ماهانه" },
];

const EMPTY_SERVICE: FreelancerService = { name: "", price_min: null, price_max: null, unit: "project", days_min: null, days_max: null, description: "" };

function toNumber(value: string): number | null {
  const digits = value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

function formatToman(value: number | null) {
  return value ? `${value.toLocaleString("fa-IR")} تومان` : "";
}

function NumberField({ id, label, value, onChange, suffix }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; suffix?: string }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      <input
        id={id}
        inputMode="numeric"
        dir="ltr"
        className="field text-left"
        value={value === null ? "" : value.toLocaleString("en-US")}
        onChange={(e) => onChange(toNumber(e.target.value))}
        placeholder="—"
      />
      {suffix && <p className="mt-1 min-h-5 text-[11px] text-muted-foreground">{suffix}</p>}
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <fieldset id={id} className="scroll-mt-24 grid gap-5 border-b border-border p-6 last:border-0 md:grid-cols-[minmax(0,13rem)_1fr] md:gap-10">
      <legend className="sr-only">{title}</legend>
      <div>
        <p className="font-bold text-foreground">{title}</p>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </fieldset>
  );
}

export default function FreelancerTrainingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [botToken, setBotToken] = useState("");

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [note, setNote] = useState("");
  // Quick-onboarding summaries; kept for freelancers who have not filled the services table yet.
  const [legacy, setLegacy] = useState({ services: "", price_range: "", timeline: "" });
  const [k, setK] = useState<FreelancerKnowledge>(EMPTY_KNOWLEDGE);

  function getToken() {
    return localStorage.getItem("freelancer_token") || "";
  }

  function logout() {
    clearSession();
    router.push("/login");
  }

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetchFreelancerSettings(token)
      .then((data) => {
        setName(data.name || "");
        setPosition(data.position || "");
        setNote(data.note || "");
        setBotToken(data.bot_token || "");
        setLegacy({ services: data.services || "", price_range: data.price_range || "", timeline: data.timeline || "" });
        setK({ ...EMPTY_KNOWLEDGE, ...(data.knowledge || {}) });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  function update(patch: Partial<FreelancerKnowledge>) {
    setK((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }

  function updateService(index: number, patch: Partial<FreelancerService>) {
    update({ services: k.services.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  }

  const field = FIELDS.find((f) => f.id === k.field);
  const pricedServices = k.services.filter((s) => s.name.trim() && (s.price_min || s.price_max));

  const checklist = [
    { id: "profile", label: "حوزه و عنوان کاری", done: Boolean(k.field && name.trim() && position.trim()) },
    { id: "profile", label: "معرفی و سابقه", done: Boolean(k.bio.trim() || k.experience_years) },
    { id: "services", label: "خدمات با قیمت", done: pricedServices.length > 0, weight: 2 },
    { id: "process", label: "فرایند کار", done: Boolean(k.process.trim()) },
    { id: "process", label: "سوال‌های نیازسنجی", done: k.intake_questions.some((q) => q.trim()) },
    { id: "process", label: "شرایط پرداخت", done: Boolean(k.payment_terms.trim()) },
    { id: "faq", label: "سوال‌های متداول", done: k.faqs.some((f) => f.q.trim() && f.a.trim()) },
  ];
  const total = checklist.reduce((sum, item) => sum + (item.weight || 1), 0);
  const score = Math.round((checklist.reduce((sum, item) => sum + (item.done ? item.weight || 1 : 0), 0) / total) * 100);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      // Keep the one-line summaries in sync with the services table for older parts of the app.
      const named = k.services.filter((s) => s.name.trim());
      const prices = named.flatMap((s) => [s.price_min, s.price_max]).filter((v): v is number => Boolean(v));
      const days = named.flatMap((s) => [s.days_min, s.days_max]).filter((v): v is number => Boolean(v));
      const data = await freelancerOnboarding(token, {
        name: name.trim(),
        position: position.trim(),
        services: named.length ? named.map((s) => s.name.trim()).join("، ") : legacy.services,
        price_range: prices.length ? `${formatToman(Math.min(...prices))} تا ${formatToman(Math.max(...prices))}` : legacy.price_range,
        timeline: days.length ? `${Math.min(...days).toLocaleString("fa-IR")} تا ${Math.max(...days).toLocaleString("fa-IR")} روز` : legacy.timeline,
        note: note.trim() || undefined,
      });
      if (data.name) localStorage.setItem("freelancer_name", data.name);
      setK({ ...EMPTY_KNOWLEDGE, ...(await updateFreelancerKnowledge(token, k)) });
      setSaved(true);
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") logout();
      else setError(err instanceof Error ? err.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ShellLoading />;

  return (
    <AppShell
      area="فریلنسر"
      width="wide"
      nav={[
        { key: "dashboard", label: "داشبورد", icon: IconLayoutDashboard, href: "/freelancer/dashboard" },
        { key: "widget", label: "ظاهر و نصب ویجت", icon: IconBrush, href: "/freelancer/widget" },
        { key: "settings", label: "آموزش دستیار", icon: IconSchool, href: "/freelancer/settings", active: true },
      ]}
      user={name ? { name } : undefined}
      onLogout={logout}
      title="آموزش دستیار"
      description="هر چی اینجا بنویسی، دستیارت موقع گفتگو با مشتری استفاده می‌کنه: حوزه‌ی کاری، خدمات، قیمت‌ها و روش کارت. قیمت‌ها فقط از همین جدول گفته می‌شن."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-border bg-surface">
          <Section id="profile" title="حوزه و سابقه" description="دستیار خودش رو با این عنوان معرفی می‌کنه و فقط درباره‌ی همین حوزه حرف می‌زنه.">
            <fieldset>
              <legend className="field-label">حوزه‌ی کاری</legend>
              <div className="flex flex-wrap gap-2">
                {FIELDS.map((f) => (
                  <label key={f.id} className="cursor-pointer">
                    <input type="radio" name="field" value={f.id} checked={k.field === f.id} onChange={() => update({ field: f.id })} className="peer sr-only" />
                    <span className="inline-flex min-h-9 items-center rounded-full border border-border px-3.5 text-[13px] font-bold text-secondary-foreground transition-colors hover:border-foreground/30 peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {f.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            {k.field === "other" && (
              <div>
                <label htmlFor="t-field-label" className="field-label">حوزه‌ات رو بنویس</label>
                <input id="t-field-label" className="field" maxLength={80} value={k.field_label} onChange={(e) => update({ field_label: e.target.value })} placeholder="مثلاً عکاسی محصول" />
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="t-name" className="field-label">اسم کامل</label>
                <input id="t-name" className="field" autoComplete="name" required value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="مثلاً سارا رضایی" />
              </div>
              <div>
                <label htmlFor="t-position" className="field-label">عنوان کاری</label>
                <input id="t-position" className="field" required value={position} onChange={(e) => { setPosition(e.target.value); setSaved(false); }} placeholder="مثلاً موشن‌گرافیست ارشد" />
              </div>
              <NumberField id="t-exp" label="سال‌های سابقه" value={k.experience_years} onChange={(v) => update({ experience_years: v === null ? null : Math.min(v, 60) })} />
              <div>
                <label htmlFor="t-portfolio" className="field-label">لینک نمونه‌کارها</label>
                <input id="t-portfolio" type="url" dir="ltr" className="field text-left" maxLength={300} value={k.portfolio_url} onChange={(e) => update({ portfolio_url: e.target.value })} placeholder="https://" />
              </div>
            </div>
            <div>
              <label htmlFor="t-bio" className="field-label">معرفی کوتاه</label>
              <textarea id="t-bio" className="admin-textarea" rows={3} maxLength={800} value={k.bio} onChange={(e) => update({ bio: e.target.value })} placeholder="تخصصت، مشتری‌هایی که باهاشون کار کردی و چیزی که کارت رو متمایز می‌کنه." />
            </div>
          </Section>

          <Section id="services" title="خدمات و قیمت‌ها" description="دستیار فقط همین خدمات رو پیشنهاد می‌ده و قیمت رو از همین بازه‌ها می‌گه. قیمت‌ها به تومانه.">
            {k.services.length === 0 && (
              <div className="rounded-xl border border-dashed border-input p-5 text-center">
                <p className="text-sm text-muted-foreground">هنوز خدمتی اضافه نکردی.</p>
                {field && field.templates.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => update({ services: field.templates.map((t) => ({ ...EMPTY_SERVICE, name: t })) })}
                  >
                    <IconSparkles size={15} aria-hidden="true" />
                    خدمات رایج «{field.label}» رو اضافه کن
                  </Button>
                )}
              </div>
            )}
            {k.services.map((service, i) => (
              <div key={i} className="rounded-xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`s-name-${i}`} className="field-label">نام خدمت</label>
                    <input id={`s-name-${i}`} className="field" maxLength={120} value={service.name} onChange={(e) => updateService(i, { name: e.target.value })} placeholder="مثلاً موشن تبلیغاتی ۳۰ ثانیه‌ای" />
                  </div>
                  <button
                    type="button"
                    onClick={() => update({ services: k.services.filter((_, j) => j !== i) })}
                    aria-label={`حذف ${service.name || "خدمت"}`}
                    className="mt-6 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <IconTrash size={17} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_8rem]">
                  <NumberField id={`s-min-${i}`} label="قیمت از" value={service.price_min} onChange={(v) => updateService(i, { price_min: v })} suffix={formatToman(service.price_min)} />
                  <NumberField id={`s-max-${i}`} label="قیمت تا" value={service.price_max} onChange={(v) => updateService(i, { price_max: v })} suffix={formatToman(service.price_max)} />
                  <div>
                    <label htmlFor={`s-unit-${i}`} className="field-label">واحد</label>
                    <select id={`s-unit-${i}`} className="field" value={service.unit} onChange={(e) => updateService(i, { unit: e.target.value as FreelancerService["unit"] })}>
                      {UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-1 grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
                  <NumberField id={`s-dmin-${i}`} label="زمان تحویل از (روز)" value={service.days_min} onChange={(v) => updateService(i, { days_min: v })} />
                  <NumberField id={`s-dmax-${i}`} label="تا (روز)" value={service.days_max} onChange={(v) => updateService(i, { days_max: v })} />
                  <div>
                    <label htmlFor={`s-desc-${i}`} className="field-label">توضیح کوتاه</label>
                    <input id={`s-desc-${i}`} className="field" maxLength={400} value={service.description} onChange={(e) => updateService(i, { description: e.target.value })} placeholder="چه چیزهایی شامل می‌شه" />
                  </div>
                </div>
              </div>
            ))}
            {k.services.length < 25 && (
              <Button type="button" variant="outline" onClick={() => update({ services: [...k.services, { ...EMPTY_SERVICE }] })}>
                <IconPlus size={16} aria-hidden="true" />
                افزودن خدمت
              </Button>
            )}
          </Section>

          <Section id="process" title="روش کار" description="دستیار با این‌ها انتظار مشتری رو درست تنظیم می‌کنه و سوال‌های لازم رو می‌پرسه.">
            <div>
              <label htmlFor="t-process" className="field-label">فرایند کارت</label>
              <textarea id="t-process" className="admin-textarea" rows={3} maxLength={1500} value={k.process} onChange={(e) => update({ process: e.target.value })} placeholder="مثلاً: ۱. جلسه‌ی بریف ۲. استوری‌بورد ۳. اجرا ۴. دو مرحله اصلاح ۵. تحویل" />
            </div>
            <fieldset>
              <legend className="field-label">سوال‌هایی که دستیار حتماً از مشتری بپرسه</legend>
              <div className="space-y-2">
                {k.intake_questions.map((q, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      aria-label={`سوال ${i + 1}`}
                      className="field"
                      maxLength={200}
                      value={q}
                      onChange={(e) => update({ intake_questions: k.intake_questions.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder="مثلاً مدت ویدیو چقدره؟"
                    />
                    <button
                      type="button"
                      onClick={() => update({ intake_questions: k.intake_questions.filter((_, j) => j !== i) })}
                      aria-label={`حذف سوال ${i + 1}`}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <IconTrash size={17} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
              {k.intake_questions.length < 12 && (
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => update({ intake_questions: [...k.intake_questions, ""] })}>
                  <IconPlus size={15} aria-hidden="true" />
                  افزودن سوال
                </Button>
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="t-payment" className="field-label">شرایط پرداخت</label>
                <textarea id="t-payment" className="admin-textarea" rows={2} maxLength={600} value={k.payment_terms} onChange={(e) => update({ payment_terms: e.target.value })} placeholder="مثلاً ۵۰٪ پیش‌پرداخت، بقیه بعد از تحویل" />
              </div>
              <div>
                <label htmlFor="t-scope" className="field-label">کارهایی که انجام نمی‌دی</label>
                <textarea id="t-scope" className="admin-textarea" rows={2} maxLength={800} value={k.out_of_scope} onChange={(e) => update({ out_of_scope: e.target.value })} placeholder="مثلاً فیلم‌برداری و خرید هاست" />
              </div>
            </div>
            <div>
              <label htmlFor="t-note" className="field-label">نکته‌ی مهم دیگه <span className="font-normal text-muted-foreground">(اختیاری)</span></label>
              <textarea id="t-note" className="admin-textarea" rows={2} value={note} onChange={(e) => { setNote(e.target.value); setSaved(false); }} placeholder="هر چیزی که دستیار باید حتماً رعایت کنه" />
            </div>
            <fieldset>
              <legend className="field-label">لحن گفتگو</legend>
              <div className="grid max-w-xs grid-cols-2 gap-1 rounded-lg bg-surface-2 p-1">
                {[{ id: "friendly", label: "صمیمی" }, { id: "formal", label: "رسمی" }].map((t) => (
                  <label key={t.id} className="cursor-pointer">
                    <input type="radio" name="tone" value={t.id} checked={k.tone === t.id} onChange={() => update({ tone: t.id as FreelancerKnowledge["tone"] })} className="peer sr-only" />
                    <span className="flex min-h-9 items-center justify-center rounded-md text-sm font-bold text-muted-foreground peer-checked:bg-surface peer-checked:text-foreground peer-checked:shadow-card peer-focus-visible:ring-2 peer-focus-visible:ring-ring dark:peer-checked:bg-foreground/10">
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Section>

          <Section id="faq" title="سوال‌های متداول" description="جواب سوال‌هایی که مشتری‌ها زیاد می‌پرسن؛ دستیار دقیقاً بر اساس همین جواب می‌ده.">
            {k.faqs.map((faq, i) => (
              <div key={i} className="space-y-2 rounded-xl border border-border p-4">
                <div className="flex gap-2">
                  <input
                    aria-label={`سوال متداول ${i + 1}`}
                    className="field font-bold"
                    maxLength={300}
                    value={faq.q}
                    onChange={(e) => update({ faqs: k.faqs.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })}
                    placeholder="سوال؛ مثلاً چند بار اصلاح دارید؟"
                  />
                  <button
                    type="button"
                    onClick={() => update({ faqs: k.faqs.filter((_, j) => j !== i) })}
                    aria-label={`حذف سوال متداول ${i + 1}`}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-danger/10 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <IconTrash size={17} aria-hidden="true" />
                  </button>
                </div>
                <textarea
                  aria-label={`جواب سوال متداول ${i + 1}`}
                  className="admin-textarea"
                  rows={2}
                  maxLength={1000}
                  value={faq.a}
                  onChange={(e) => update({ faqs: k.faqs.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })}
                  placeholder="جواب"
                />
              </div>
            ))}
            {k.faqs.length < 20 && (
              <Button type="button" variant="outline" onClick={() => update({ faqs: [...k.faqs, { q: "", a: "" }] })}>
                <IconPlus size={16} aria-hidden="true" />
                افزودن سوال متداول
              </Button>
            )}
          </Section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface/95 px-6 py-4 backdrop-blur">
            {error && <p role="alert" className="ml-auto text-sm text-danger">{error}</p>}
            {saved && (
              <span role="status" className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-success">
                <IconCheck size={16} stroke={2.5} aria-hidden="true" />
                ذخیره شد؛ دستیارت از همین الان با این اطلاعات جواب می‌ده
              </span>
            )}
            <Button type="submit" disabled={saving}>{saving ? "در حال ذخیره..." : "ذخیره آموزش"}</Button>
          </div>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <section aria-labelledby="training-score" className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <h2 id="training-score" className="font-bold text-foreground">میزان آموزش</h2>
              <span className="text-2xl font-black text-foreground">{score.toLocaleString("fa-IR")}٪</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-labelledby="training-score">
              <div className={cn("h-full rounded-full transition-all", score === 100 ? "bg-success" : "bg-brand-solid")} style={{ width: `${score}%` }} />
            </div>
            <ul className="mt-4 space-y-2">
              {checklist.map((item) => (
                <li key={item.label}>
                  <a href={`#${item.id}`} className="flex items-center gap-2 rounded text-[13px] text-secondary-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                    {item.done ? (
                      <IconCircleCheck size={17} className="shrink-0 text-success" aria-label="انجام شده" />
                    ) : (
                      <IconCircleDashed size={17} className="shrink-0 text-muted-foreground" aria-label="انجام نشده" />
                    )}
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="training-test" className="rounded-xl border border-border bg-surface p-5">
            <h2 id="training-test" className="font-bold text-foreground">دستیارت رو امتحان کن</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">بعد از ذخیره، مثل یک مشتری باهاش حرف بزن و ببین قیمت‌ها و جواب‌هاش درسته یا نه.</p>
            <Button variant="outline" size="sm" asChild className="mt-3 w-full">
              <a href={`/chat?bot=${botToken}&embed=1`} target="_blank" rel="noopener noreferrer">
                <IconExternalLink size={15} aria-hidden="true" />
                گفتگوی آزمایشی
              </a>
            </Button>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
