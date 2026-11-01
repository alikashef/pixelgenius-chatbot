"use client";

import AppShell, { NewProjectLink, useAccountNav } from "@/components/AppShell";
import { PricingPlans } from "@/components/landing/PricingSection";

export default function PricingPage() {
  const nav = useAccountNav({ active: "pricing" });
  return (
    <AppShell
      nav={nav}
      backHref="/"
      primaryAction={<NewProjectLink />}
      width="wide"
      title="تعرفه‌ها"
      description="قیمت کردیت هر بخش و اشتراک میزبانی سایت."
    >
      <PricingPlans />
    </AppShell>
  );
}
