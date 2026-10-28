"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconSparkles, IconSettings, IconLogout, IconCopy, IconCheck, IconExternalLink } from "@tabler/icons-react";
import { fetchFreelancerOrders, Order } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-info/10 text-info border-info/20",
  awaiting_payment: "bg-pending/10 text-pending border-pending/20",
  paid: "bg-success/10 text-success border-success/20",
  cancelled: "bg-danger/10 text-danger border-danger/20",
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

  return (
    <div className="min-h-screen bg-background bg-aura">
      <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 px-4 sm:px-6">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-primary-foreground shadow-md shadow-primary/30">
          <IconSparkles size={18} stroke={2.2} aria-hidden="true" />
        </span>
        <span className="font-black tracking-tight text-foreground">Freelio<span className="text-gradient">AI</span></span>
        <div className="mr-auto flex items-center gap-2">
          <span className="hidden text-sm text-muted-foreground sm:inline">{name}</span>
          <ThemeToggle />
          <Link href="/freelancer/settings" aria-label="تنظیمات" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:border-primary-line hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <IconSettings size={17} aria-hidden="true" />
          </Link>
          <button onClick={handleLogout} aria-label="خروج" className="grid h-9 w-9 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:border-danger/40 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring">
            <IconLogout size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">سلام{name ? `، ${name}` : ""}</h1>
          <p className="mt-1 text-sm text-muted-foreground">درخواست‌هایی که از چت‌بات تو ثبت شدن</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "کل درخواست‌ها", value: orders.length },
            { label: "در انتظار بررسی", value: pending, warn: true },
            { label: "پرداخت شده", value: paid, accent: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-surface p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
              <p className={`text-xl font-black ${s.accent ? "text-brand" : s.warn && s.value > 0 ? "text-warning" : "text-foreground"}`}>
                {s.value.toLocaleString("fa-IR")}
              </p>
            </div>
          ))}
        </div>

        {/* Embed Section */}
        {botToken && (
          <div className="rounded-2xl border border-primary-line bg-primary-soft p-5">
            <p className="mb-1 font-semibold text-brand">لینک چت‌بات اختصاصی تو</p>
            <p className="mb-3 text-xs text-brand">این لینک رو روی سایتت بذار یا به مشتریانت بده</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-primary-line bg-background/40 px-3 py-2 text-xs text-brand dir-ltr" dir="ltr">
                {typeof window !== "undefined" ? `${window.location.origin}/chat?bot=${botToken}` : `/chat?bot=${botToken}`}
              </code>
              <button
                onClick={copyEmbedUrl}
                className="flex items-center gap-1.5 rounded-lg border border-primary-line bg-primary/20 px-3 py-2 text-xs font-semibold text-brand transition-colors hover:text-foreground"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                {copied ? "کپی شد" : "کپی"}
              </button>
              <a
                href={`/chat?bot=${botToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-primary-line bg-primary/20 px-3 py-2 text-xs font-semibold text-brand transition-colors hover:text-foreground"
              >
                <IconExternalLink size={14} />
                باز کن
              </a>
            </div>
          </div>
        )}

        {/* Orders */}
        <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-card">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <p className="font-semibold text-foreground">درخواست‌ها</p>
            <Link href="/admin/dashboard" className="text-xs text-brand hover:text-foreground transition-colors">
              مدیریت کامل ←
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">هنوز درخواستی از چت‌بات تو نرسیده</p>
              <p className="mt-1 text-xs text-muted-foreground/60">مشتریانت رو به لینک چت‌بات هدایت کن</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-background/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{order.project_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm text-muted-foreground">{order.price_label}</p>
                    <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
