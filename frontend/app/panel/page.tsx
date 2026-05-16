"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMyOrders, Order } from "@/lib/api";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-yellow-500/10 text-yellow-400",
  approved: "bg-blue-500/10 text-blue-400",
  awaiting_payment: "bg-orange-500/10 text-orange-400",
  paid: "bg-accent/10 text-accent",
  cancelled: "bg-red-500/10 text-red-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PanelPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (!token) {
      router.replace("/login?redirect=/panel");
      return;
    }
    fetchMyOrders(token)
      .then(setOrders)
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("customer_token");
          router.replace("/login?redirect=/panel");
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  function logout() {
    localStorage.removeItem("customer_token");
    localStorage.removeItem("customer_id");
    router.push("/chat");
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
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-gray-100">درخواست‌های من</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/chat")}
            className="text-accent text-sm hover:text-accent-hover transition-colors"
          >
            + درخواست جدید
          </button>
          <button onClick={logout} className="text-muted hover:text-gray-200 text-sm transition-colors">
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {error && <p className="text-red-400 text-center mb-6">{error}</p>}

        {orders.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted mb-4">هنوز درخواستی ثبت نکردید</p>
            <button
              onClick={() => router.push("/chat")}
              className="bg-accent hover:bg-accent-hover text-black font-bold rounded-xl px-6 py-3 text-sm transition-colors"
            >
              شروع مشاوره
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <button
                key={order.id}
                onClick={() => router.push(`/panel/${order.id}`)}
                className="w-full bg-surface border border-border hover:border-accent/50 rounded-2xl p-5 text-right transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-100 truncate">{order.project_name}</h3>
                    <p className="text-muted text-sm mt-1 line-clamp-2">{order.summary}</p>
                    <p className="text-muted text-xs mt-2">{formatDate(order.created_at)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${STATUS_CLASS[order.status]}`}>
                      {STATUS_LABEL[order.status]}
                    </span>
                    {order.payment_amount && (
                      <span className="text-accent text-sm font-bold">
                        {order.payment_amount.toLocaleString("fa-IR")} ریال
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
