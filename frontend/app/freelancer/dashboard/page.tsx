"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconBrush, IconChevronLeft, IconCode, IconInbox } from "@tabler/icons-react";
import { fetchFreelancerOrders, Order, clearSession } from "@/lib/api";
import AppShell, { NewProjectLink, useAccountNav } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { CopyBlock } from "@/components/McpTour";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-warning/10 text-warning",
  approved: "bg-info/10 text-info",
  awaiting_payment: "bg-pending/10 text-pending",
  paid: "bg-success/10 text-success",
  cancelled: "bg-danger/10 text-danger",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function FreelancerDashboardPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [botToken, setBotToken] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("freelancer_token");
    if (!token) { router.replace("/login"); return; }
    setOrigin(window.location.origin);
    setName(localStorage.getItem("freelancer_name") || "");
    setBotToken(localStorage.getItem("freelancer_bot_token") || "");

    fetchFreelancerOrders(token)
      .then(setOrders)
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("freelancer_token");
          router.replace("/login");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    clearSession();
    router.push("/login");
  }


  const pending = orders.filter((o) => o.status === "pending_review").length;
  const paid = orders.filter((o) => o.status === "paid").length;


  const nav = useAccountNav({ active: "freelancer-dashboard", counts: { "freelancer-dashboard": orders.length || undefined } });

  return (
    <AppShell
      nav={nav}
      backHref="/"
      primaryAction={<NewProjectLink />}
      user={name ? { name } : undefined}
      onLogout={handleLogout}
      title={`سلام${name ? `، ${name}` : ""}`}
      description="درخواست‌هایی که مشتری‌هات از طریق چت‌بات تو ثبت کرده‌اند."
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: "کل درخواست‌ها", value: orders.length, dot: "bg-foreground/25" },
            { label: "در انتظار بررسی", value: pending, dot: "bg-warning" },
            { label: "پرداخت شده", value: paid, dot: "bg-success" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-5">
              <p className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} aria-hidden="true" />
                {s.label}
              </p>
              <p className="mt-3 text-[1.75rem] font-black leading-none tracking-tight text-foreground">{s.value.toLocaleString("fa-IR")}</p>
            </div>
          ))}
        </div>

        {botToken && (
          <section aria-labelledby="embed-title" className="rounded-xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
                <IconCode size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="embed-title" className="font-bold text-foreground">چت‌بات رو روی سایتت نصب کن</h2>
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">این کد رو روی سایتت بذار، یا لینک مستقیم رو به مشتری‌هات بده.</p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href="/freelancer/widget">
                  <IconBrush size={15} aria-hidden="true" />
                  شخصی‌سازی ظاهر
                </Link>
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-bold text-muted-foreground">کد نصب</p>
                <CopyBlock text={`<script src="${origin}/embed.js" data-bot="${botToken}" async></script>`} label="کپی کد نصب ویجت" />
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground">لینک مستقیم</p>
                <CopyBlock text={`${origin}/chat?bot=${botToken}`} label="کپی لینک چت‌بات" />
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="orders-title" className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="orders-title" className="font-bold text-foreground">درخواست‌ها</h2>
            <span className="text-xs text-muted-foreground">برای قیمت‌گذاری و ارسال پروپوزال روی هر درخواست بزن</span>
          </div>

          {loading ? (
            <div role="status" aria-label="در حال بارگذاری" className="flex justify-center py-12">
              <span className="h-7 w-7 rounded-full border-[3px] border-foreground/15 border-t-brand-solid motion-safe:animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <IconInbox size={32} stroke={1.4} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
              <p className="font-bold text-foreground">هنوز درخواستی نرسیده</p>
              <p className="mt-1 text-[13px] text-muted-foreground">مشتری‌هات رو به لینک چت‌بات هدایت کن.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/freelancer/orders/${order.id}`}
                    className="flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-foreground/[0.02] focus-visible:bg-foreground/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{order.project_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                    </div>
                    <p className="hidden text-[13px] text-muted-foreground sm:block">{order.price_label}</p>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold leading-6 ${STATUS_CLASS[order.status]}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                      {STATUS_LABEL[order.status]}
                    </span>
                    <IconChevronLeft size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
