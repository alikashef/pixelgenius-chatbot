"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchOrders, fetchStats, approveOrder, uploadProposal, Order } from "@/lib/api";

interface Stats {
  total_orders: number;
  paid_orders: number;
  pending_review: number;
  total_revenue: number;
}

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
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdminDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // approve form state
  const [finalPrice, setFinalPrice] = useState("");
  const [payPercent, setPayPercent] = useState("50");
  const [adminNote, setAdminNote] = useState("");
  const [approving, setApproving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function getToken() {
    return localStorage.getItem("admin_token") || "";
  }

  async function load() {
    const token = getToken();
    if (!token) { router.replace("/admin/login"); return; }
    try {
      const [o, s] = await Promise.all([fetchOrders(token), fetchStats(token)]);
      setOrders(o);
      setStats(s);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "UNAUTHORIZED") { localStorage.removeItem("admin_token"); router.replace("/admin/login"); }
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openOrder(order: Order) {
    setSelected(order);
    setFinalPrice(order.final_price?.toString() || "");
    setPayPercent(order.payment_percentage?.toString() || "50");
    setAdminNote(order.admin_note || "");
    setError("");
  }

  async function handleApprove() {
    if (!selected || !finalPrice) return;
    setApproving(true);
    setError("");
    try {
      const updated = await approveOrder(
        getToken(), selected.id,
        parseInt(finalPrice), parseInt(payPercent), adminNote || undefined
      );
      setSelected(updated);
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا");
    } finally {
      setApproving(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selected || !e.target.files?.[0]) return;
    setUploading(true);
    setError("");
    try {
      const updated = await uploadProposal(getToken(), selected.id, e.target.files[0]);
      setSelected(updated);
      setOrders((prev) => prev.map((o) => o.id === updated.id ? updated : o));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در آپلود");
    } finally {
      setUploading(false);
    }
  }

  const payAmount = finalPrice && payPercent
    ? Math.round(parseInt(finalPrice) * parseInt(payPercent) / 100)
    : null;

  if (loading) {
    return <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-gray-100">پنل ادمین</h1>
        <button onClick={() => { localStorage.removeItem("admin_token"); router.push("/admin/login"); }}
          className="text-muted hover:text-gray-200 text-sm transition-colors">خروج</button>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {error && <p className="text-red-400 text-center">{error}</p>}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="کل سفارشات" value={stats.total_orders.toLocaleString("fa-IR")} />
            <StatCard label="در انتظار" value={stats.pending_review.toLocaleString("fa-IR")} warn />
            <StatCard label="پرداخت‌شده" value={stats.paid_orders.toLocaleString("fa-IR")} accent />
            <StatCard label="درآمد (ریال)" value={(stats.total_revenue).toLocaleString("fa-IR")} />
          </div>
        )}

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
                    {["پروژه", "تخمین قیمت", "قیمت نهایی", "وضعیت", "تاریخ", ""].map((h) => (
                      <th key={h} className="text-right text-muted text-xs px-5 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                      <td className="px-5 py-4 text-sm text-gray-200 max-w-[180px] truncate">{order.project_name}</td>
                      <td className="px-5 py-4 text-sm text-muted">{order.price_label}</td>
                      <td className="px-5 py-4 text-sm text-accent">
                        {order.final_price ? `${order.final_price.toLocaleString("fa-IR")} ریال` : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLASS[order.status]}`}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted">{formatDate(order.created_at)}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => openOrder(order)} className="text-accent hover:text-accent-hover text-xs transition-colors">
                          مدیریت
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

      {/* Order Management Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}>
          <div className="bg-surface border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface">
              <h3 className="font-semibold text-gray-100 truncate">{selected.project_name}</h3>
              <button onClick={() => setSelected(null)} className="text-muted hover:text-gray-200 transition-colors flex-shrink-0 mr-4">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info */}
              <div className="space-y-3 text-sm">
                <p className="text-muted text-xs">خلاصه</p>
                <p className="text-gray-300 leading-relaxed">{selected.summary}</p>
                <ul className="space-y-1 mt-2">
                  {selected.features.map((f, i) => (
                    <li key={i} className="text-gray-400 flex gap-2"><span className="text-accent">•</span>{f}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div><p className="text-muted text-xs mb-1">تکنولوژی</p><p className="text-gray-300">{selected.tech_stack}</p></div>
                  <div><p className="text-muted text-xs mb-1">تحویل</p><p className="text-gray-300">{selected.delivery_days} روز</p></div>
                  <div><p className="text-muted text-xs mb-1">تخمین اولیه</p><p className="text-gray-300">{selected.price_label}</p></div>
                  <div><p className="text-muted text-xs mb-1">وضعیت</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[selected.status]}`}>
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>
                </div>
              </div>

              {/* Approve Section */}
              {selected.status !== "paid" && selected.status !== "cancelled" && (
                <div className="border-t border-border pt-5 space-y-4">
                  <p className="text-gray-100 text-sm font-medium">تایید و تعیین مبلغ</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-muted text-xs mb-2">قیمت نهایی (ریال)</label>
                      <input type="number" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)}
                        placeholder="مثال: 18000000"
                        className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-accent transition-colors" />
                    </div>
                    <div>
                      <label className="block text-muted text-xs mb-2">درصد پیش‌پرداخت</label>
                      <input type="number" min={10} max={100} value={payPercent} onChange={(e) => setPayPercent(e.target.value)}
                        className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-accent transition-colors" />
                    </div>
                  </div>
                  {payAmount && (
                    <div className="bg-accent/5 border border-accent/20 rounded-xl px-4 py-3 flex justify-between items-center">
                      <p className="text-muted text-xs">مبلغ قابل پرداخت توسط مشتری</p>
                      <p className="text-accent font-bold">{payAmount.toLocaleString("fa-IR")} ریال</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-muted text-xs mb-2">یادداشت برای مشتری (اختیاری)</label>
                    <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2}
                      className="w-full bg-bg border border-border rounded-xl px-3 py-2.5 text-sm text-gray-100 outline-none focus:border-accent transition-colors resize-none" />
                  </div>
                  {error && <p className="text-red-400 text-sm">{error}</p>}
                  <button onClick={handleApprove} disabled={approving || !finalPrice}
                    className="w-full bg-accent hover:bg-accent-hover disabled:opacity-60 text-black font-bold rounded-xl py-3 text-sm transition-colors">
                    {approving ? "در حال ثبت..." : selected.status === "awaiting_payment" ? "به‌روزرسانی" : "تایید و ارسال به مشتری"}
                  </button>
                </div>
              )}

              {/* Upload Proposal */}
              <div className="border-t border-border pt-5">
                <p className="text-gray-100 text-sm font-medium mb-3">آپلود پروپوزال PDF</p>
                {selected.proposal_file && (
                  <p className="text-accent text-xs mb-2">✓ فایل آپلود شده: {selected.proposal_file.split("/").pop()}</p>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleUpload}
                  className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-full border border-border hover:border-accent/50 text-gray-300 hover:text-gray-100 rounded-xl py-3 text-sm transition-colors disabled:opacity-60">
                  {uploading ? "در حال آپلود..." : selected.proposal_file ? "جایگزینی فایل" : "انتخاب و آپلود فایل"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 text-center">
      <p className="text-muted text-xs mb-2">{label}</p>
      <p className={`font-bold text-xl ${accent ? "text-accent" : warn ? "text-yellow-400" : "text-gray-100"}`}>{value}</p>
    </div>
  );
}
