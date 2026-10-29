import { IconCheck, IconGift } from "@tabler/icons-react";
import { BILLING_ENABLED, FREELANCER_PLANS, formatToman, HOSTING_PLANS, Plan, yearly } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** A row of plan cards; purchase stays "coming soon" until payment is live. */
export default function PricingSection({ id, title, description, plans }: { id: string; title: string; description: string; plans: Plan[] }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20">
      <div className="mb-5">
        <h2 id={`${id}-title`} className="text-lg font-black text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-xl border bg-surface p-5",
              plan.highlight ? "border-brand-line shadow-[inset_0_0_0_1px_hsl(var(--brand-line))]" : "border-border"
            )}
          >
            {plan.highlight && (
              <span className="absolute -top-2.5 left-5 rounded-full bg-brand-solid px-2.5 text-[11px] font-bold leading-5 text-brand-foreground">محبوب‌تر</span>
            )}
            <h3 className="text-sm font-bold text-foreground">{plan.name}</h3>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{plan.tagline}</p>
            <p className="mt-4 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-foreground">{formatToman(plan.monthly / 1000)}</span>
              <span className="text-xs text-muted-foreground">هزار تومان / ماه</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">سالانه {formatToman(yearly(plan) / 1000)} هزار تومان (۲ ماه رایگان)</p>
            <ul className="mt-5 flex-1 space-y-2.5">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-[13px] leading-6 text-secondary-foreground">
                  <IconCheck size={15} stroke={2.4} className="mt-1 shrink-0 text-brand" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={!BILLING_ENABLED}
              className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 text-sm font-bold text-muted-foreground disabled:cursor-not-allowed"
            >
              خرید
              <span className="rounded-full bg-accent-soft px-2 text-[11px] leading-5 text-accent">به‌زودی</span>
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Everything the pricing page shows below its title: the free-for-now notice and both plan rows. */
export function PricingPlans() {
  return (
    <>
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
    </>
  );
}
