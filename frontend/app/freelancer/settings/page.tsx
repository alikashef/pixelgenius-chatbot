"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconCheck, IconLayoutDashboard, IconSettings } from "@tabler/icons-react";
import { fetchFreelancerSettings, freelancerOnboarding } from "@/lib/api";
import AppShell, { ShellLoading } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export default function FreelancerSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [services, setServices] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [timeline, setTimeline] = useState("");
  const [note, setNote] = useState("");

  function getToken() {
    return localStorage.getItem("freelancer_token") || "";
  }

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/freelancer/login"); return; }
    fetchFreelancerSettings(token)
      .then((data) => {
        setName(data.name || "");
        setPosition(data.position || "");
        setServices(data.services || "");
        setPriceRange(data.price_range || "");
        setTimeline(data.timeline || "");
        setNote(data.note || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const token = getToken();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const data = await freelancerOnboarding(token, {
        name: name.trim(),
        position: position.trim(),
        services: services.trim(),
        price_range: priceRange.trim(),
        timeline: timeline.trim(),
        note: note.trim() || undefined,
      });
      if (data.name) localStorage.setItem("freelancer_name", data.name);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ShellLoading />;

  const sections = [
    {
      title: "اطلاعات پایه",
      description: "دستیار خودش رو با این اسم و تخصص به مشتری معرفی می‌کنه.",
      fields: (
        <>
          <div>
            <label htmlFor="fl-name" className="field-label">اسم کامل</label>
            <input id="fl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً علی رضایی" className="field" autoComplete="name" required />
          </div>
          <div>
            <label htmlFor="fl-position" className="field-label">موقعیت / تخصص</label>
            <input id="fl-position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="مثلاً فریلنسر طراحی و توسعه وب" className="field" required />
          </div>
        </>
      ),
    },
    {
      title: "خدمات و قیمت",
      description: "برآورد قیمت و زمان‌بندی که دستیار به مشتری می‌ده از همین‌جا میاد.",
      fields: (
        <>
          <div>
            <label htmlFor="fl-services" className="field-label">خدماتی که ارائه می‌دی</label>
            <textarea id="fl-services" value={services} onChange={(e) => setServices(e.target.value)} rows={3} placeholder="مثلاً: طراحی لندینگ پیج، فروشگاه آنلاین، پنل مدیریت، سئو" className="admin-textarea" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fl-price" className="field-label">بازه قیمتی</label>
              <input id="fl-price" value={priceRange} onChange={(e) => setPriceRange(e.target.value)} placeholder="مثلاً: ۵ تا ۵۰ میلیون تومان" className="field" required />
            </div>
            <div>
              <label htmlFor="fl-timeline" className="field-label">زمان تحویل معمول</label>
              <input id="fl-timeline" value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="مثلاً: لندینگ ۵ روز" className="field" required />
            </div>
          </div>
        </>
      ),
    },
    {
      title: "نکات اضافه",
      description: "هر قانونی که دستیار باید در گفتگو رعایت کنه.",
      fields: (
        <div>
          <label htmlFor="fl-note" className="field-label">نکته مهم <span className="font-normal text-muted-foreground">(اختیاری)</span></label>
          <textarea id="fl-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="چیزی که AI حتماً در مکالمه با مشتری رعایت کنه..." className="admin-textarea" />
        </div>
      ),
    },
  ];

  return (
    <AppShell
      area="فریلنسر"
      nav={[
        { key: "dashboard", label: "داشبورد", icon: IconLayoutDashboard, href: "/freelancer/dashboard" },
        { key: "settings", label: "تنظیمات دستیار", icon: IconSettings, href: "/freelancer/settings", active: true },
      ]}
      onLogout={() => {
        ["freelancer_token", "freelancer_id", "freelancer_name", "freelancer_bot_token"].forEach((k) => localStorage.removeItem(k));
        router.push("/freelancer/login");
      }}
      title="تنظیمات دستیار"
      description="این اطلاعات در دستورالعمل دستیار هوشمند استفاده می‌شه تا گفتگو با مشتری شخصی‌سازی بشه."
    >
      <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-border bg-surface">
        {sections.map((section) => (
          <fieldset key={section.title} className="grid gap-5 border-b border-border p-6 md:grid-cols-[minmax(0,14rem)_1fr] md:gap-10">
            <legend className="sr-only">{section.title}</legend>
            <div>
              <p className="font-bold text-foreground">{section.title}</p>
              <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{section.description}</p>
            </div>
            <div className="space-y-4">{section.fields}</div>
          </fieldset>
        ))}

        <div className="flex flex-wrap items-center justify-end gap-3 bg-surface-2/60 px-6 py-4">
          {error && <p role="alert" className="ml-auto text-sm text-danger">{error}</p>}
          {saved && (
            <span role="status" className="ml-auto inline-flex items-center gap-1 text-sm font-bold text-success">
              <IconCheck size={16} stroke={2.5} aria-hidden="true" />
              ذخیره شد
            </span>
          )}
          <Button type="submit" disabled={saving}>
            {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
