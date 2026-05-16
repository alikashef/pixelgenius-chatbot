"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchOrders, fetchStats } from "@/lib/api";

interface Order {
  id: string;
  project_name: string;
  summary: string;
  features: string[];
  tech_stack: string;
  delivery_days: number;
  price: number;
  price_label: string;
  status: "pending" | "paid" | "cancelled";
  paid_at: string | null;
  created_at: string;
}

interface Stats {
  total_orders: number;
  paid_orders: number;
  total_revenue: number;
}

const STATUS_LABEL = {
  paid: "پرداخت‌شده",
  pending: "در انتظار",
  cancelled: "لغو‌شده",
};

const STATUS_CLASS = {
  paid: "bg-accent/10 text-accent",
  pending: "bg-yellow-500/10 text-yellow-400",
  cancelled: "bg-red-500/10 text-red-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      router.replace("/admin/login");
      return;
    }

    Promise.all([fetchOrders(token), fetchStats(token)])
      .then(([ordersData, statsData]) => {
        setOrders(ordersData);
        setStats(statsData);
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("admin_token");
          router.replace("/admin/login");
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  function logout() {
    localStorage.removeItem("admin_token");
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-gray-100">پنل ادمین</h1>
        <button onClick={logout} className="text-muted hover:text-gray-200 text-sm transition-colors">
          خروج
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {error && <p className="text-red-400 text-center">{error}</p>}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="کل سفارشات" value={stats.total_orders.toLocaleString("fa-IR")} />
            <StatCard label="پرداخت‌شده" value={stats.paid_orders.toLocaleString("fa-IR")} accent />
            <StatCard
              label="درآمد کل"
              value={`${(stats.total_revenue / 10).toLocaleString("fa-IR")} تومان`}
            />
          </div>
        )}

        {/* Orders Table */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-gray-100">سفارشات</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-muted text-center py-12">هیچ سفارشی ثبت نشده</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["پروژه", "قیمت", "تکنولوژی", "وضعیت", "تاریخ", ""].map((h) => (
                      <th key={h} className="text-right text-muted text-xs px-6 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border/50 hover:bg-bg/50 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-gray-200 max-w-[200px] truncate">
                        {order.project_name}
                      </td>
                      <td className="px-6 py-4 text-sm text-accent">{order.price_label}</td>
                      <td className="px-6 py-4 text-sm text-muted">{order.tech_stack}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLASS[order.status]}`}
                        >
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-muted">{formatDate(order.created_at)}</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => setSelected(order)}
                          className="text-accent hover:text-accent-hover text-xs transition-colors"
                        >
                          جزئیات
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Order Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-surface border border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-gray-100">{selected.project_name}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-gray-200 transition-colors">
                ✕
              </button>
            </div>
            <div className="p-6 space-y-5 text-sm">
              <Field label="خلاصه" value={selected.summary} />
              <div>
                <p className="text-muted text-xs mb-2">امکانات</p>
                <ul className="space-y-1">
                  {selected.features.map((f, i) => (
                    <li key={i} className="text-gray-300 flex gap-2">
                      <span className="text-accent">•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
              <Field label="تکنولوژی" value={selected.tech_stack} />
              <div className="grid grid-cols-2 gap-4">
                <Field label="قیمت" value={selected.price_label} />
                <Field label="مدت تحویل" value={`${selected.delivery_days} روز`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="وضعیت"
                  value={STATUS_LABEL[selected.status]}
                />
                {selected.paid_at && (
                  <Field label="تاریخ پرداخت" value={formatDate(selected.paid_at)} />
                )}
              </div>
              <Field label="شناسه سفارش" value={selected.id} mono />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 text-center">
      <p className="text-muted text-xs mb-2">{label}</p>
      <p className={`font-bold text-xl ${accent ? "text-accent" : "text-gray-100"}`}>{value}</p>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-muted text-xs mb-1">{label}</p>
      <p className={`text-gray-200 ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
    </div>
  );
}
