"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconCheck, IconChevronLeft, IconCode, IconCopy, IconExternalLink, IconInbox, IconLayoutDashboard, IconSettings } from "@tabler/icons-react";
import { fetchFreelancerOrders, Order } from "@/lib/api";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";

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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("freelancer_token");
    if (!token) { router.replace("/freelancer/login"); return; }
    setName(localStorage.getItem("freelancer_name") || "");
    setBotToken(localStorage.getItem("freelancer_bot_token") || "");

    fetchFreelancerOrders(token)
      .then(setOrders)
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("freelancer_token");
          router.replace("/freelancer/login");
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  function handleLogout() {
    ["freelancer_token", "freelancer_id", "freelancer_name", "freelancer_bot_token"].forEach((k) => localStorage.removeItem(k));
    router.push("/freelancer/login");
  }

  function copyEmbedUrl() {
    const url = `${window.location.origin}/chat?bot=${botToken}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const pending = orders.filter((o) => o.status === "pending_review").length;
  const paid = orders.filter((o) => o.status === "paid").length;

  const embedUrl = typeof window !== "undefined" ? `${window.location.origin}/chat?bot=${botToken}` : `/chat?bot=${botToken}`;

  return (
    <AppShell
      area="فریلنسر"
      nav={[
        { key: "dashboard", label: "داشبورد", icon: IconLayoutDashboard, href: "/freelancer/dashboard", active: true, count: orders.length || undefined },
        { key: "settings", label: "تنظیمات دستیار", icon: IconSettings, href: "/freelancer/settings" },
      ]}
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
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden="true">
                <IconCode size={20} />
              </span>
              <div className="min-w-0">
                <h2 id="embed-title" className="font-bold text-foreground">لینک چت‌بات اختصاصی تو</h2>
                <p className="mt-0.5 text-[13px] leading-6 text-muted-foreground">این لینک رو روی سایتت بذار یا مستقیم به مشتری‌هات بده.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code dir="ltr" className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-left font-mono text-xs text-secondary-foreground">
                {embedUrl}
              </code>
              <div className="flex gap-2">
                <Button variant="default" size="sm" onClick={copyEmbedUrl} className="flex-1 sm:flex-none">
                  {copied ? <IconCheck size={15} aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
                  {copied ? "کپی شد" : "کپی لینک"}
                </Button>
                <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
                  <a href={`/chat?bot=${botToken}`} target="_blank" rel="noopener noreferrer">
                    <IconExternalLink size={15} aria-hidden="true" />
                    پیش‌نمایش
                  </a>
                </Button>
              </div>
            </div>
          </section>
        )}

        <section aria-labelledby="orders-title" className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="orders-title" className="font-bold text-foreground">درخواست‌ها</h2>
            <Link href="/admin/dashboard" className="inline-flex items-center gap-0.5 rounded text-[13px] font-bold text-secondary-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
              مدیریت کامل
              <IconChevronLeft size={15} aria-hidden="true" />
            </Link>
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
                    href={`/admin/orders/${order.id}`}
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
