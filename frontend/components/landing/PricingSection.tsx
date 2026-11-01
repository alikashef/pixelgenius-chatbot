import Link from "next/link";
import { IconCheck, IconGift } from "@tabler/icons-react";
import { BILLING_ENABLED, CREDIT_GROUPS, CREDIT_PACKS, formatToman, HOSTING_PLANS, MIN_TOPUP_TOMAN, Plan, TOMAN_PER_CREDIT, yearly } from "@/lib/plans";
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

/** Wallet price list: the rate, top-up amounts, and what every section costs in credits. */
function CreditPricing() {
  return (
    <section id="credits" aria-labelledby="credits-title" className="scroll-mt-20">
      <div className="mb-5">
        <h2 id="credits-title" className="text-lg font-black text-foreground">کیف پول و کردیت</h2>
        <p className="mt-1 text-sm leading-7 text-muted-foreground">
          کیف پولت رو هر مقدار خواستی شارژ کن و هر بخش فقط به اندازه‌ی مصرفش ازش کم می‌کنه. اشتراک ماهانه نداری و ریز همه‌ی مصارف رو توی حسابت می‌بینی.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-surface p-5">
        <p className="text-sm font-bold text-foreground">هر ۱ کردیت = {formatToman(TOMAN_PER_CREDIT)} تومان</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CREDIT_PACKS.map((pack) => (
            <li key={pack} className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-center">
              <span className="block text-sm font-black text-foreground">{formatToman(pack)} تومان</span>
              <span className="block text-xs text-muted-foreground">{formatToman(pack / TOMAN_PER_CREDIT)} کردیت</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          حداقل شارژ {formatToman(MIN_TOPUP_TOMAN)} تومان؛ مبلغ دلخواه هم می‌تونی وارد کنی. کردیت منقضی نمی‌شه.{" "}
          <Link href="/account?tab=wallet" className="font-bold text-brand underline-offset-4 hover:underline">شارژ کیف پول</Link>
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {CREDIT_GROUPS.map((group) => (
          <article key={group.id} className="flex flex-col rounded-xl border border-border bg-surface p-5">
            <h3 className="text-sm font-bold text-foreground">{group.title}</h3>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">{group.description}</p>
            <ul className="mt-4 divide-y divide-border">
              {group.lines.map((line) => (
                <li key={line.label} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0 text-secondary-foreground">
                    {line.label}
                    {line.note && <span className="block text-[11px] text-muted-foreground">{line.note}</span>}
                  </span>
                  <span className="shrink-0 font-black text-foreground">
                    {typeof line.credits === "number" ? `${formatToman(line.credits)} کردیت` : line.credits.match(/[۰-۹]/) ? `${line.credits} کردیت` : line.credits}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Everything the pricing page shows below its title: the credit price list and the hosting plans. */
export function PricingPlans() {
  return (
    <div className="space-y-12">
      <CreditPricing />
      <PricingSection
        id="hosting"
        title="میزبانی سایت"
        description="قیمت میزبانی جداست و با کردیت حساب نمی‌شه. هر سایتی که منتشر می‌کنی ۵ روز رایگان روشنه؛ بعد با اشتراک ماهانه روشن می‌مونه و می‌تونی دامنه‌ی خودت رو وصل کنی."
        plans={HOSTING_PLANS}
      />
      <div className="flex items-start gap-3 rounded-xl border border-accent-line bg-accent-soft p-4">
        <IconGift size={22} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-[13px] leading-6 text-secondary-foreground">
          پرداخت میزبانی به‌زودی فعال می‌شه. تا اون موقع سایت‌ها در دو روز آخر مهلت رایگان تمدید می‌شن.
        </p>
      </div>
    </div>
  );
}
