import type { Metadata } from "next";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import PricingSection from "@/components/landing/PricingSection";
import CTASection from "@/components/landing/CTASection";

export const metadata: Metadata = {
  title: "FreelioAI — دستیار هوشمند فریلنسرهای حرفه‌ای",
  description:
    "ویجت AI رو روی سایتت بذار. مشتریت نیازمندی‌هاش رو شفاف می‌کنه، تو پروپوزال می‌دی، milestone تعریف می‌کنی و پرداخت می‌گیری — همه روی برند خودت.",
  openGraph: {
    title: "FreelioAI — دستیار هوشمند فریلنسرها",
    description: "از intake مشتری تا تحویل پروژه، با هوش مصنوعی فارسی",
    locale: "fa_IR",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <CTASection />
    </main>
  );
}
