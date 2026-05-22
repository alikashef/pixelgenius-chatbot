"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconSparkles, IconSettings, IconLogout, IconCopy, IconCheck, IconExternalLink } from "@tabler/icons-react";
import { fetchFreelancerOrders, Order } from "@/lib/api";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awaiting_payment: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
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
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-6 py-4 backdrop-blur">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-[--violet]">
          <IconSparkles size={16} stroke={2} className="text-white" />
        </span>
        <span className="font-bold text-white">FreelioAI</span>
        <div className="mr-auto flex items-center gap-3">
          <Link href="/freelancer/settings" className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-white">
            <IconSettings size={18} />
          </Link>
          <span className="text-sm text-[hsl(var(--muted-foreground))]">{name}</span>
          <button onClick={handleLogout} className="text-[hsl(var(--muted-foreground))] transition-colors hover:text-white">
            <IconLogout size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white">سلام{name ? `، ${name}` : ""} 👋</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">درخواست‌هایی که از چت‌بات تو ثبت شدن</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "کل درخواست‌ها", value: orders.length },
            { label: "در انتظار بررسی", value: pending, warn: true },
            { label: "پرداخت شده", value: paid, accent: true },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[hsl(var(--border))] bg-[--surface] p-4 text-center">
              <p className="text-xs text-[hsl(var(--muted-foreground))] mb-1">{s.label}</p>
              <p className={`text-xl font-black ${s.accent ? "text-violet-300" : s.warn && s.value > 0 ? "text-amber-400" : "text-white"}`}>
                {s.value.toLocaleString("fa-IR")}
              </p>
            </div>
          ))}
        </div>

        {/* Embed Section */}
        {botToken && (
          <div className="rounded-2xl border border-[--violet-border] bg-[--violet-glow] p-5">
            <p className="mb-1 font-semibold text-violet-200">لینک چت‌بات اختصاصی تو</p>
            <p className="mb-3 text-xs text-violet-300/70">این لینک رو روی سایتت بذار یا به مشتریانت بده</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-[--violet-border] bg-[hsl(var(--background))]/40 px-3 py-2 text-xs text-violet-100 dir-ltr" dir="ltr">
                {typeof window !== "undefined" ? `${window.location.origin}/chat?bot=${botToken}` : `/chat?bot=${botToken}`}
              </code>
              <button
                onClick={copyEmbedUrl}
                className="flex items-center gap-1.5 rounded-lg border border-[--violet-border] bg-[--violet]/20 px-3 py-2 text-xs font-semibold text-violet-300 transition-colors hover:text-white"
              >
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                {copied ? "کپی شد" : "کپی"}
              </button>
              <a
                href={`/chat?bot=${botToken}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-[--violet-border] bg-[--violet]/20 px-3 py-2 text-xs font-semibold text-violet-300 transition-colors hover:text-white"
              >
                <IconExternalLink size={14} />
                باز کن
              </a>
            </div>
          </div>
        )}

        {/* Orders */}
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] overflow-hidden">
          <div className="px-5 py-4 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <p className="font-semibold text-white">درخواست‌ها</p>
            <Link href="/admin/dashboard" className="text-xs text-violet-400 hover:text-white transition-colors">
              مدیریت کامل ←
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-[--violet] border-t-transparent" />
            </div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[hsl(var(--muted-foreground))]">هنوز درخواستی از چت‌بات تو نرسیده</p>
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]/60">مشتریانت رو به لینک چت‌بات هدایت کن</p>
            </div>
          ) : (
            <div className="divide-y divide-[hsl(var(--border))]">
              {orders.map((order) => (
                <Link
                  key={order.id}
                  href={`/admin/orders/${order.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[hsl(var(--background))]/50"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-white">{order.project_name}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-sm text-[hsl(var(--muted-foreground))]">{order.price_label}</p>
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
