import {
  IconCode,
  IconMessageCircle2,
  IconCreditCard,
} from "@tabler/icons-react";

const STEPS = [
  {
    number: "۰۱",
    icon: IconCode,
    title: "ویجت رو اضافه کن",
    description:
      "اکانت بساز، اطلاعات سرویس‌هات رو وارد کن و یه خط کد رو به سایتت اضافه کن. همین.",
    highlight: "embed در ۳ دقیقه",
  },
  {
    number: "۰۲",
    icon: IconMessageCircle2,
    title: "مشتری با AI صحبت می‌کنه",
    description:
      "AI فارسی نیازمندی‌های پروژه رو می‌پرسه، ابهامات رو برطرف می‌کنه و یه spec کامل آماده می‌کنه.",
    highlight: "بدون فرم خسته‌کننده",
  },
  {
    number: "۰۳",
    icon: IconCreditCard,
    title: "پروپوزال، milestone، پرداخت",
    description:
      "پروپوزال بده، مراحل پروژه رو تعریف کن و مشتری مرحله به مرحله پرداخت می‌کنه. AI طول پروژه همراهتونه.",
    highlight: "پرداخت امن زرین‌پال",
  },
];

export default function HowItWorksSection() {
  return (
    <section id="how" className="mx-auto max-w-7xl px-4 py-24">
      <div className="mb-14 text-center">
        <p className="mb-3 text-sm font-semibold text-violet-400">نحوه کار</p>
        <h2 className="text-3xl font-black text-white md:text-4xl">
          سه قدم تا اولین پروژه
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[hsl(var(--muted-foreground))]">
          بدون پیچیدگی. از راه‌اندازی تا دریافت پرداخت در کمتر از یک روز.
        </p>
      </div>

      <div className="relative grid gap-6 md:grid-cols-3">
        {/* connector line */}
        <div className="absolute left-[16.67%] right-[16.67%] top-10 hidden h-px bg-gradient-to-l from-transparent via-[--violet-border] to-transparent md:block" />

        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <div
              key={step.number}
              className="relative rounded-3xl border border-[hsl(var(--border))] bg-[--surface] p-7 transition-colors hover:border-[--violet-border]"
            >
              <div className="mb-5 flex items-start justify-between">
                <span className="text-3xl font-black text-[--violet-border]">
                  {step.number}
                </span>
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[--violet-glow] border border-[--violet-border] text-violet-400">
                  <Icon size={22} stroke={1.8} />
                </span>
              </div>

              <h3 className="text-lg font-black text-white">{step.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
                {step.description}
              </p>

              <div className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-[--violet-border] bg-[--violet-glow] px-3 py-1 text-xs font-semibold text-violet-300">
                {step.highlight}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
