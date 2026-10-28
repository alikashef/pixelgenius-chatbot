"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { freelancerOnboarding } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

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
    if (!token) { router.replace("/login"); return; }

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
    <AuthLayout variant="freelancer" wide title={STEPS[step].title} description={STEPS[step].desc}>
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-muted-foreground">
          <span>راه‌اندازی دستیار</span>
          <span>مرحله {(step + 1).toLocaleString("fa-IR")} از {STEPS.length.toLocaleString("fa-IR")}</span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label="پیشرفت راه‌اندازی">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? "bg-brand-solid" : "bg-foreground/10"}`} />
          ))}
        </div>
      </div>

          <form onSubmit={handleNext} className="space-y-4">
            {step === 0 && (
              <>
                <div>
                  <label htmlFor="ob-1" className="field-label">اسم کامل</label>
                  <input id="ob-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً علی رضایی" className="field min-h-12" required />
                </div>
                <div>
                  <label htmlFor="ob-2" className="field-label">موقعیت / تخصص</label>
                  <input id="ob-2" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="مثلاً فریلنسر طراحی و توسعه وب" className="field min-h-12" required />
                </div>
              </>
            )}

            {step === 1 && (
              <div>
                <label htmlFor="ob-3" className="field-label">خدماتی که ارائه می‌دی</label>
                <textarea
                  id="ob-3"
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
                <label htmlFor="ob-4" className="field-label">بازه قیمتی پروژه‌هات</label>
                <input
                  id="ob-4"
                  value={priceRange}
                  onChange={(e) => setPriceRange(e.target.value)}
                  placeholder="مثلاً: ۵ تا ۵۰ میلیون تومان"
                  className="field min-h-12"
                  required
                />
                <p className="mt-2 text-xs text-muted-foreground">این عدد به AI کمک می‌کنه بودجه مشتری رو بهتر ارزیابی کنه.</p>
              </div>
            )}

            {step === 3 && (
              <div>
                <label htmlFor="ob-5" className="field-label">زمان تحویل معمول</label>
                <input
                  id="ob-5"
                  value={timeline}
                  onChange={(e) => setTimeline(e.target.value)}
                  placeholder="مثلاً: لندینگ ۵ روز، فروشگاه ۳-۴ هفته"
                  className="field min-h-12"
                  required
                />
              </div>
            )}

            {step === 4 && (
              <div>
                <label htmlFor="ob-6" className="field-label">نکته مهم (اختیاری)</label>
                <textarea
                  id="ob-6"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="چیزی که AI حتماً باید در مکالمه با مشتری رعایت کنه..."
                  className="admin-textarea"
                />
              </div>
            )}

            {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

            <div className="flex gap-3">
              {step > 0 && (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} className="h-12 flex-1">
                  قبلی
                </Button>
              )}
              <Button type="submit" disabled={loading || !canAdvance()} className="h-12 flex-1">
                {loading ? "در حال ذخیره..." : isLastStep ? "شروع کار" : "بعدی"}
              </Button>
            </div>
          </form>
    </AuthLayout>
  );
}
