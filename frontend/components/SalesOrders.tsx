"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconAlertCircle, IconCheck, IconChevronLeft, IconCreditCard, IconX } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Order } from "@/lib/api";

// Prices are stored in rial (what the gateway charges); customers read toman.
export function toman(rial: number | null | undefined) {
  if (!rial) return null;
  return `${Math.round(rial / 10).toLocaleString("fa-IR")} تومان`;
}

/** The internal admin note is appended to the stored summary; customers only see their own request. */
export function customerSummary(summary: string) {
  return summary.split(/\n*خلاصه ادمین:/)[0].trim();
}

export const ORDER_STEPS = [
  { title: "ثبت درخواست", hint: "درخواستت به تیم رسید." },
  { title: "بررسی و قیمت‌گذاری", hint: "تیم نیازهات رو بررسی می‌کنه و قیمت نهایی و مراحل کار رو مشخص می‌کنه." },
  { title: "پیش‌پرداخت", hint: "قیمت نهایی آماده‌ست؛ با پرداخت پیش‌پرداخت، کار شروع می‌شه." },
  { title: "اجرای پروژه", hint: "پیش‌پرداخت انجام شد و تیم روی پروژه کار می‌کنه." },
] as const;

/** Index of the step the order is on; -1 for a cancelled order. */
export function orderStep(status: Order["status"]): number {
  if (status === "cancelled") return -1;
  if (status === "pending_review") return 1;
  if (status === "approved" || status === "awaiting_payment") return 2;
  return 3;
}

const STATUS: Record<Order["status"], { label: string; tone: string }> = {
  pending_review: { label: "در حال بررسی", tone: "bg-warning/10 text-warning" },
  approved: { label: "منتظر پرداخت", tone: "bg-pending/10 text-pending" },
  awaiting_payment: { label: "منتظر پرداخت", tone: "bg-pending/10 text-pending" },
  paid: { label: "در حال اجرا", tone: "bg-success/10 text-success" },
  cancelled: { label: "لغو شده", tone: "bg-danger/10 text-danger" },
};

export function OrderStatusPill({ status }: { status: Order["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold leading-6", STATUS[status].tone)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATUS[status].label}
    </span>
  );
}

/** Compact progress: one segment per step, filled up to the current one. */
function MiniProgress({ status }: { status: Order["status"] }) {
  const step = orderStep(status);
  return (
    <div className="flex gap-1" aria-hidden="true">
      {ORDER_STEPS.map((s, i) => (
        <span
          key={s.title}
          className={cn(
            "h-1 w-6 rounded-full",
            step < 0 ? "bg-danger/30" : i < step ? "bg-brand-solid" : i === step ? "bg-brand-solid/45" : "bg-foreground/10"
          )}
        />
      ))}
    </div>
  );
}

const FILTERS = [
  { id: "all", label: "همه", match: () => true },
  { id: "action", label: "نیاز به اقدام", match: (o: Order) => o.status === "awaiting_payment" || o.status === "approved" },
  { id: "progress", label: "در جریان", match: (o: Order) => o.status === "pending_review" || o.status === "paid" },
  { id: "closed", label: "لغو شده", match: (o: Order) => o.status === "cancelled" },
] as const;

/** Customer's sales orders: what needs their action first, then a scannable list (table on desktop, cards on mobile). */
export default function SalesOrders({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const due = orders.filter((o) => o.status === "awaiting_payment" && o.payment_amount);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, orders.filter(f.match).length])), [orders]);
  const shown = orders.filter(FILTERS.find((f) => f.id === filter)!.match);

  return (
    <div className="space-y-5">
      {due.length > 0 && (
        <div role="status" className="flex flex-col gap-3 rounded-xl border border-pending/30 bg-pending/10 p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
          <IconAlertCircle size={22} className="mt-0.5 shrink-0 text-pending" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">
              {due.length === 1 ? `«${due[0].project_name}» منتظر پیش‌پرداخت توست` : `${due.length.toLocaleString("fa-IR")} سفارش منتظر پیش‌پرداخت توست`}
            </p>
            <p className="mt-0.5 text-xs leading-6 text-secondary-foreground">قیمت نهایی آماده‌ست؛ با پرداخت پیش‌پرداخت، کار پروژه شروع می‌شه.</p>
          </div>
          </div>
          <Link
            href={`/panel/${due[0].id}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <IconCreditCard size={17} aria-hidden="true" />
            {due.length === 1 ? `پرداخت ${toman(due[0].payment_amount)}` : "مشاهده و پرداخت"}
          </Link>
        </div>
      )}

      <div role="tablist" aria-label="فیلتر سفارش‌ها" className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1">
        {FILTERS.filter((f) => f.id === "all" || counts[f.id] > 0).map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "flex min-h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              filter === f.id ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
            <span className="rounded-full bg-foreground/[0.07] px-1.5 text-[11px] leading-5">{counts[f.id].toLocaleString("fa-IR")}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] gap-4 border-b border-border bg-surface-2/70 px-5 py-2.5 text-xs font-bold text-muted-foreground md:grid">
          <span>پروژه</span>
          <span>وضعیت</span>
          <span>مبلغ</span>
          <span className="w-24" aria-hidden="true" />
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">سفارشی در این دسته نیست.</p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((order) => {
              const price = toman(order.final_price);
              const needsPay = order.status === "awaiting_payment" && order.payment_amount;
              return (
                <li key={order.id} className="relative transition-colors hover:bg-foreground/[0.025]">
                  <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.9fr)_auto] md:items-center md:gap-4">
                    <div className="min-w-0">
                      <Link
                        href={`/panel/${order.id}`}
                        className="block truncate font-bold text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
                      >
                        {order.project_name}
                      </Link>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" })}
                        {order.delivery_days ? ` · تحویل حدود ${order.delivery_days.toLocaleString("fa-IR")} روز` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:flex-col md:items-start md:gap-1.5">
                      <OrderStatusPill status={order.status} />
                      <MiniProgress status={order.status} />
                    </div>
                    <div className="text-sm">
                      <p className={cn("font-bold", price ? "text-foreground" : "text-secondary-foreground")}>{price || order.price_label || "—"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{price ? "قیمت نهایی" : "برآورد اولیه"}</p>
                    </div>
                    <div className={cn("relative z-10 w-full items-center justify-end gap-2 md:flex md:w-24", needsPay ? "flex" : "hidden")}>
                      {needsPay ? (
                        <Link
                          href={`/panel/${order.id}`}
                          className="inline-flex min-h-9 items-center rounded-lg bg-primary px-3.5 text-[13px] font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          پرداخت
                        </Link>
                      ) : (
                        <IconChevronLeft size={18} className="text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Full journey for the order page: done, current and upcoming steps with what happens next. */
export function OrderSteps({ status }: { status: Order["status"] }) {
  const step = orderStep(status);
  if (step < 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger">
        <IconX size={18} aria-hidden="true" />
        این سفارش لغو شده است.
      </div>
    );
  }
  return (
    <section aria-label="مراحل سفارش" className="rounded-xl border border-border bg-surface p-5">
      <ol className="grid gap-4 sm:grid-cols-4 sm:gap-2">
        {ORDER_STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <li key={s.title} aria-current={current ? "step" : undefined} className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2">
              <div className="flex items-center gap-2 sm:w-full">
                <span
                  className={cn(
                    "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold",
                    done ? "bg-brand-solid text-brand-foreground" : current ? "bg-brand-soft text-brand ring-2 ring-brand-solid" : "bg-surface-2 text-muted-foreground"
                  )}
                >
                  {done ? <IconCheck size={15} stroke={2.6} aria-hidden="true" /> : (i + 1).toLocaleString("fa-IR")}
                </span>
                {i < ORDER_STEPS.length - 1 && (
                  <span className={cn("hidden h-0.5 flex-1 rounded-full sm:block", done ? "bg-brand-solid" : "bg-foreground/10")} aria-hidden="true" />
                )}
              </div>
              <p className={cn("text-sm font-bold", current ? "text-foreground" : done ? "text-secondary-foreground" : "text-muted-foreground")}>{s.title}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-[13px] leading-6 text-secondary-foreground">{ORDER_STEPS[Math.max(0, step)]?.hint}</p>
    </section>
  );
}
