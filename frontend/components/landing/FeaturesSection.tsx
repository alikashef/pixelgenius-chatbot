import {
  IconBrandReact,
  IconMessageCircle2,
  IconChartBar,
  IconCreditCard,
  IconShieldCheck,
  IconRobot,
} from "@tabler/icons-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const FEATURES = [
  {
    icon: IconBrandReact,
    title: "ویجت قابل embed",
    description:
      "یه خط کد به سایتت اضافه کن. چت روی دامنه خودت لود می‌شه — بدون ریدایرکت، بدون برند خارجی.",
    accent: false,
  },
  {
    icon: IconRobot,
    title: "AI هوشمند فارسی",
    description:
      "دستیار AI نیازمندی‌های پروژه رو می‌پرسه، ابهامات رو برطرف می‌کنه و یه spec کامل تولید می‌کنه.",
    accent: true,
  },
  {
    icon: IconMessageCircle2,
    title: "چت پروژه زنده",
    description:
      "AI در طول پروژه active می‌مونه. مشتری سؤال داره؟ AI از روند پروژه خبر داره و جواب می‌ده.",
    accent: false,
  },
  {
    icon: IconChartBar,
    title: "مدیریت Milestone",
    description:
      "مراحل پروژه رو تعریف کن، خروجی هر مرحله رو مستند کن. همه‌چیز شفاف و قابل پیگیری.",
    accent: false,
  },
  {
    icon: IconCreditCard,
    title: "پرداخت مرحله‌ای",
    description:
      "مشتری مرحله به مرحله پرداخت می‌کنه. درگاه زرین‌پال، امن، بدون دردسر.",
    accent: false,
  },
  {
    icon: IconShieldCheck,
    title: "تسک خودکار از چت",
    description:
      "مشتری تغییری درخواست می‌ده؟ AI تشخیص می‌ده و تسک جدید برای تو تعریف می‌کنه.",
    accent: false,
  },
];

export default function FeaturesSection() {
  return (
    <section
      id="features"
      className="border-t border-[hsl(var(--border))] bg-[--surface]/30"
    >
      <div className="mx-auto max-w-7xl px-4 py-24">
        <div className="mb-14 text-center">
          <p className="mb-3 text-sm font-semibold text-violet-400">ویژگی‌ها</p>
          <h2 className="text-3xl font-black text-white md:text-4xl">
            همه‌چیزی که یه فریلنسر حرفه‌ای نیاز داره
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[hsl(var(--muted-foreground))]">
            از اولین چت مشتری تا تحویل نهایی — یه ابزار، همه مراحل.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className={`p-6 transition-all duration-200 hover:-translate-y-1 hover:border-[--violet-border] ${
                  feature.accent
                    ? "border-[--violet-border] bg-[--violet-glow]"
                    : ""
                }`}
              >
                <CardHeader className="p-0">
                  <span
                    className={`mb-5 grid h-12 w-12 place-items-center rounded-2xl ${
                      feature.accent
                        ? "bg-[--violet] text-white shadow-lg shadow-[--violet-glow]"
                        : "bg-[--surface-2] text-violet-400 border border-[hsl(var(--border))]"
                    }`}
                  >
                    <Icon size={22} stroke={1.8} />
                  </span>
                  <CardTitle className="text-white">{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
