"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { IconSparkles } from "@tabler/icons-react";
import { freelancerOnboarding } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const STEPS = [
  { title: "اسم و موقعیت", desc: "مشتری‌ها با چه عنوانی تو رو می‌شناسن؟" },
  { title: "خدمات", desc: "چه نوع پروژه‌هایی انجام می‌دی؟" },
  { title: "بازه قیمتی", desc: "قیمت‌گذاری معمول تو چطوره؟" },
  { title: "زمان تحویل", desc: "معمولاً پروژه‌ها چقدر طول می‌کشه؟" },
  { title: "نکته مهم", desc: "چیزی هست که AI حتماً باید بدونه؟ (اختیاری)" },
];

export default function FreelancerOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [services, setServices] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [timeline, setTimeline] = useState("");
  const [note, setNote] = useState("");

  const isLastStep = step === STEPS.length - 1;

  function canAdvance() {
    if (step === 0) return name.trim().length > 0 && position.trim().length > 0;
    if (step === 1) return services.trim().length > 0;
    if (step === 2) return priceRange.trim().length > 0;
    if (step === 3) return timeline.trim().length > 0;
    return true;
  }

  async function handleNext(e: FormEvent) {
    e.preventDefault();
    if (!canAdvance()) return;
    if (!isLastStep) { setStep((s) => s + 1); return; }

    const token = localStorage.getItem("freelancer_token") || "";
    if (!token) { router.replace("/freelancer/login"); return; }

    setLoading(true);
    setError("");
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
      router.push("/freelancer/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره اطلاعات");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background bg-aura px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <ThemeToggle className="absolute left-4 top-4 z-10" />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/25">
            <IconSparkles size={22} stroke={2} aria-hidden="true" />
          </span>
          <h1 className="text-xl font-black text-foreground">راه‌اندازی FreelioAI</h1>
          <p className="text-sm text-muted-foreground">یه‌بار این اطلاعات رو بده تا AI شخصی‌سازی بشه</p>
        </div>

        <div className="mb-6 flex gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <p className="mb-1 font-bold text-foreground">{STEPS[step].title}</p>
          <p className="mb-5 text-sm text-muted-foreground">{STEPS[step].desc}</p>

          <form onSubmit={handleNext} className="space-y-4">
            {step === 0 && (
              <>
                <div>
                  <label className="field-label">اسم کامل</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً علی رضایی" className="admin-input" required />
                </div>
                <div>
                  <label className="field-label">موقعیت / تخصص</label>
                  <input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="مثلاً فریلنسر طراحی و توسعه وب" className="admin-input" required />
                </div>
              </>
            )}

            {step === 1 && (
              <div>
                <label className="field-label">خدماتی که ارائه می‌دی</label>
                <textarea
                  value={services}
                  onChange={(e) => setServices(e.target.value)}
                  rows={4}
                  placeholder="مثلاً: طراحی لندینگ پیج، فروشگاه آنلاین، پنل مدیریت، سئو"
                  className="admin-textarea"
                  required
                />
              </div>
            )}

            {step === 2 && (
              <div>
                <label className="field-label">بازه قیمتی پروژه‌هات</label>
                <input
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  placeholder="مثلاً: ۵ تا ۵۰ میلیون تومان"
                  className="admin-input"
                  required
                />
                <p className="mt-2 text-xs text-muted-foreground">این عدد به AI کمک می‌کنه بودجه مشتری رو بهتر ارزیابی کنه.</p>
              </div>
            )}

            {step === 3 && (
              <div>
                <label className="field-label">زمان تحویل معمول</label>
                <input
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  placeholder="مثلاً: لندینگ ۵ روز، فروشگاه ۳-۴ هفته"
                  className="admin-input"
                  required
                />
              </div>
            )}

            {step === 4 && (
              <div>
                <label className="field-label">نکته مهم (اختیاری)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="چیزی که AI حتماً باید در مکالمه با مشتری رعایت کنه..."
                  className="admin-textarea"
                />
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex-1 rounded-xl border border-border py-3 text-sm text-muted-foreground transition-colors hover:border-primary-line hover:text-foreground"
                >
                  قبلی
                </button>
              )}
              <button
                type="submit"
                disabled={loading || !canAdvance()}
                className="flex-1 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {loading ? "در حال ذخیره..." : isLastStep ? "شروع کار" : "بعدی"}
              </button>
            </div>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          مرحله {step + 1} از {STEPS.length}
        </p>
      </div>
    </div>
  );
}
