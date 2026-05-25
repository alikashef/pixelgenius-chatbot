"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSparkles, IconArrowRight } from "@tabler/icons-react";
import { fetchFreelancerSettings, freelancerOnboarding } from "@/lib/api";

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

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-[--violet] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-6 py-4 backdrop-blur">
        <button onClick={() => router.push("/freelancer/dashboard")} className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-white">
          <IconArrowRight size={18} />
        </button>
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-[--violet]">
          <IconSparkles size={14} stroke={2} className="text-white" />
        </span>
        <h1 className="font-bold text-white">تنظیمات AI</h1>
        {saved && (
          <span className="mr-auto rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
            ذخیره شد ✓
          </span>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">
          این اطلاعات در system prompt دستیار هوشمند استفاده می‌شه تا مکالمه با مشتری شخصی‌سازی بشه.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6 space-y-4">
            <p className="font-semibold text-white">اطلاعات پایه</p>
            <div>
              <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">اسم کامل</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً علی رضایی" className="admin-input" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">موقعیت / تخصص</label>
              <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="مثلاً فریلنسر طراحی و توسعه وب" className="admin-input" required />
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6 space-y-4">
            <p className="font-semibold text-white">خدمات و قیمت</p>
            <div>
              <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">خدماتی که ارائه می‌دی</label>
              <textarea value={services} onChange={(e) => setServices(e.target.value)} rows={3} placeholder="مثلاً: طراحی لندینگ پیج، فروشگاه آنلاین، پنل مدیریت، سئو" className="admin-textarea" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">بازه قیمتی</label>
              <input value={priceRange} onChange={(e) => setPriceRange(e.target.value)} placeholder="مثلاً: ۵ تا ۵۰ میلیون تومان" className="admin-input" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">زمان تحویل معمول</label>
              <input value={timeline} onChange={(e) => setTimeline(e.target.value)} placeholder="مثلاً: لندینگ ۵ روز، فروشگاه ۳-۴ هفته" className="admin-input" required />
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6 space-y-4">
            <p className="font-semibold text-white">نکات اضافه برای AI</p>
            <div>
              <label className="mb-1.5 block text-xs text-[hsl(var(--muted-foreground))]">نکته مهم (اختیاری)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="چیزی که AI حتماً در مکالمه با مشتری رعایت کنه..." className="admin-textarea" />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-[--violet] py-3 text-sm font-bold text-white shadow-md shadow-[--violet-glow] transition-colors hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
          </button>
        </form>
      </main>
    </div>
  );
}
