"use client";

import { IconGift } from "@tabler/icons-react";
import AppShell, { NewProjectLink, useAccountNav } from "@/components/AppShell";
import PricingSection from "@/components/landing/PricingSection";
import { FREELANCER_PLANS, HOSTING_PLANS } from "@/lib/plans";

export default function PricingPage() {
  const nav = useAccountNav({ active: "pricing" });
  return (
    <AppShell
      nav={nav}
      primaryAction={<NewProjectLink />}
      width="wide"
      title="تعرفه‌ها"
      description="میزبانی سایت‌هایی که با طراح محصول می‌سازی و اشتراک دستیار فریلنسر."
    >
      <div className="mb-8 flex items-start gap-3 rounded-xl border border-accent-line bg-accent-soft p-4">
        <IconGift size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-foreground">فعلاً همه‌چیز رایگانه</p>
          <p className="mt-0.5 text-[13px] leading-6 text-secondary-foreground">
            پرداخت آنلاین به‌زودی فعال می‌شه. تا اون موقع از همه‌ی امکانات رایگان استفاده کن؛ سایت‌ها هم در دو روز آخر مهلت رایگان تمدید می‌شن.
          </p>
        </div>
      </div>
      <div className="space-y-12">
        <PricingSection
          id="hosting"
          title="میزبانی سایت"
          description="هر سایتی که منتشر می‌کنی ۵ روز رایگان روشنه؛ بعد با اشتراک ماهانه روشن می‌مونه و می‌تونی دامنه‌ی خودت رو وصل کنی."
          plans={HOSTING_PLANS}
        />
        <PricingSection
          id="freelancer"
          title="دستیار فریلنسر"
          description="چت‌بات اختصاصی روی سایتت که با خدمات و قیمت‌های خودت با مشتری‌ها نیازسنجی می‌کنه."
          plans={FREELANCER_PLANS}
        />
      </div>
    </AppShell>
  );
}
