"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  fetchOrders,
  fetchStats,
  approveOrder,
  uploadProposal,
  fetchAISettings,
  updateAISettings,
  Order,
} from "@/lib/api";

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
  pending_review: "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400",
  approved: "bg-blue-500/10 border border-blue-500/20 text-blue-400",
  awaiting_payment: "bg-orange-500/10 border border-orange-500/20 text-orange-400",
  paid: "bg-[--violet-glow] text-violet-300",
  cancelled: "bg-red-500/10 border border-red-500/20 text-red-400",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const SETTING_SECTIONS = [
  "project_price_ranges",
  "budget_plan_thresholds",
  "currency_label",
  "timeline_estimates",
  "ai_sales_rules",
  "recommended_technologies",
  "chatbot_question_flow",
  "predefined_response_templates",
  "lead_scoring_rules",
  "payment_terms",
];

function toLines(value: unknown) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function fromLines(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export default function AdminDashboard() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<"orders" | "settings">("orders");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [savingSettings, setSavingSettings] = useState(false);
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
      const [o, s, aiSettings] = await Promise.all([fetchOrders(token), fetchStats(token), fetchAISettings(token)]);
      setOrders(o);
      setStats(s);
      setSettings(aiSettings);
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

  async function handleSaveSettings() {
    setSavingSettings(true);
    setError("");
    try {
      const data = await updateAISettings(getToken(), settings);
      setSettings(data.settings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره تنظیمات");
    } finally {
      setSavingSettings(false);
    }
  }

  function setSettingValue(key: string, value: unknown) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateArrayItem(key: string, index: number, patch: Record<string, unknown>) {
    const list = Array.isArray(settings[key]) ? [...(settings[key] as Record<string, unknown>[])] : [];
    list[index] = { ...(list[index] || {}), ...patch };
    setSettingValue(key, list);
  }

  function addArrayItem(key: string, item: Record<string, unknown>) {
    const list = Array.isArray(settings[key]) ? [...(settings[key] as Record<string, unknown>[])] : [];
    setSettingValue(key, [...list, item]);
  }

  function removeArrayItem(key: string, index: number) {
    const list = Array.isArray(settings[key]) ? [...(settings[key] as unknown[])] : [];
    setSettingValue(key, list.filter((_, itemIndex) => itemIndex !== index));
  }

  const payAmount = finalPrice && payPercent
    ? Math.round(parseInt(finalPrice) * parseInt(payPercent) / 100)
    : null;

  if (loading) {
    return <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[hsl(var(--background))]">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-60" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.18),transparent)]" />

      <header className="relative z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 backdrop-blur px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-[hsl(var(--foreground))]">پنل ادمین</h1>
        <button onClick={() => { localStorage.removeItem("admin_token"); router.push("/admin/login"); }}
          className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] text-sm transition-colors">خروج</button>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 py-8 space-y-8">
        {error && <p className="text-red-400 text-center">{error}</p>}

        <div className="flex gap-2 border-b border-[hsl(var(--border))]">
          {[
            ["orders", "سفارشات"],
            ["settings", "تنظیمات فروش و AI"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as "orders" | "settings")}
              className={`px-4 py-3 text-sm transition-colors ${
                activeTab === key ? "border-b-2 border-[--violet] text-violet-300" : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "orders" && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="کل سفارشات" value={stats.total_orders.toLocaleString("fa-IR")} />
            <StatCard label="در انتظار" value={stats.pending_review.toLocaleString("fa-IR")} warn />
            <StatCard label="پرداخت‌شده" value={stats.paid_orders.toLocaleString("fa-IR")} accent />
            <StatCard label="درآمد (ریال)" value={(stats.total_revenue).toLocaleString("fa-IR")} />
          </div>
        )}

        {activeTab === "orders" && <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[hsl(var(--border))]">
            <h2 className="font-semibold text-[hsl(var(--foreground))]">سفارشات</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-[hsl(var(--muted-foreground))] text-center py-12">هیچ سفارشی ثبت نشده</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[hsl(var(--border))]">
                    {["پروژه", "تخمین قیمت", "قیمت نهایی", "وضعیت", "تاریخ", ""].map((h) => (
                      <th key={h} className="text-right text-[hsl(var(--muted-foreground))] text-xs px-5 py-3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b border-[hsl(var(--border))]/50 hover:bg-[hsl(var(--background))]/50 transition-colors">
                      <td className="px-5 py-4 text-sm text-[hsl(var(--foreground))] max-w-[180px] truncate">{order.project_name}</td>
                      <td className="px-5 py-4 text-sm text-[hsl(var(--muted-foreground))]">{order.price_label}</td>
                      <td className="px-5 py-4 text-sm text-violet-300">
                        {order.final_price ? `${order.final_price.toLocaleString("fa-IR")} ریال` : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_CLASS[order.status]}`}>
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-[hsl(var(--muted-foreground))]">{formatDate(order.created_at)}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => router.push(`/admin/orders/${order.id}`)} className="text-violet-300 hover:text-violet-200 text-xs transition-colors">
                          مدیریت
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>}

        {activeTab === "settings" && (
          <div className="space-y-5">
            <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl px-6 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-[hsl(var(--foreground))]">تنظیمات فروش و هوش مصنوعی</h2>
                <p className="text-[hsl(var(--muted-foreground))] text-xs mt-1">
                  این فرم‌ها مستقیماً روی رفتار چت‌بات اثر می‌گذارند؛ بدون تغییر کد می‌توانید قیمت، بودجه، سوال‌ها و قوانین فروش را اصلاح کنید.
                </p>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="bg-[--violet] hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl px-5 py-3 text-sm transition-colors"
              >
                {savingSettings ? "در حال ذخیره..." : "ذخیره همه تنظیمات"}
              </button>
            </div>

            <section className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-5 space-y-4">
              <h3 className="text-[hsl(var(--foreground))] font-semibold">واحد پول و شرایط پرداخت</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="برچسب ارز">
                  <input value={String(settings.currency_label || "")} onChange={(e) => setSettingValue("currency_label", e.target.value)}
                    className="admin-input" placeholder="میلیون تومان" />
                </Field>
                <Field label="پیش‌پرداخت پیش‌فرض (%)">
                  <input type="number" value={String((settings.payment_terms as any)?.default_deposit_percentage || "")}
                    onChange={(e) => setSettingValue("payment_terms", { ...(settings.payment_terms as object || {}), default_deposit_percentage: Number(e.target.value) })}
                    className="admin-input" />
                </Field>
                <Field label="حداقل پیش‌پرداخت (%)">
                  <input type="number" value={String((settings.payment_terms as any)?.minimum_deposit_percentage || "")}
                    onChange={(e) => setSettingValue("payment_terms", { ...(settings.payment_terms as object || {}), minimum_deposit_percentage: Number(e.target.value) })}
                    className="admin-input" />
                </Field>
              </div>
              <Field label="توضیح شرایط پرداخت">
                <textarea value={String((settings.payment_terms as any)?.notes || "")}
                  onChange={(e) => setSettingValue("payment_terms", { ...(settings.payment_terms as object || {}), notes: e.target.value })}
                  className="admin-textarea min-h-[90px]" />
              </Field>
            </section>

            <EditableList
              title="بازه قیمت پروژه‌ها"
              items={Array.isArray(settings.project_price_ranges) ? settings.project_price_ranges as Record<string, unknown>[] : []}
              onAdd={() => addArrayItem("project_price_ranges", { key: "", label: "", price_range: "", timeline: "" })}
              renderItem={(item, index) => (
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="کلید"><input className="admin-input" value={String(item.key || "")} onChange={(e) => updateArrayItem("project_price_ranges", index, { key: e.target.value })} /></Field>
                  <Field label="عنوان"><input className="admin-input" value={String(item.label || "")} onChange={(e) => updateArrayItem("project_price_ranges", index, { label: e.target.value })} /></Field>
                  <Field label="بازه قیمت"><input className="admin-input" value={String(item.price_range || "")} onChange={(e) => updateArrayItem("project_price_ranges", index, { price_range: e.target.value })} /></Field>
                  <Field label="زمان"><input className="admin-input" value={String(item.timeline || "")} onChange={(e) => updateArrayItem("project_price_ranges", index, { timeline: e.target.value })} /></Field>
                </div>
              )}
              onRemove={(index) => removeArrayItem("project_price_ranges", index)}
            />

            <EditableList
              title="سطح‌های بودجه"
              items={Array.isArray(settings.budget_plan_thresholds) ? settings.budget_plan_thresholds as Record<string, unknown>[] : []}
              onAdd={() => addArrayItem("budget_plan_thresholds", { key: "", display: "", min_million_toman: "", max_million_toman: "" })}
              renderItem={(item, index) => (
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="کلید"><input className="admin-input" value={String(item.key || "")} onChange={(e) => updateArrayItem("budget_plan_thresholds", index, { key: e.target.value })} /></Field>
                  <Field label="عنوان فارسی"><input className="admin-input" value={String(item.display || "")} onChange={(e) => updateArrayItem("budget_plan_thresholds", index, { display: e.target.value })} /></Field>
                  <Field label="حداقل (میلیون تومان)"><input className="admin-input" value={String(item.min_million_toman ?? "")} onChange={(e) => updateArrayItem("budget_plan_thresholds", index, { min_million_toman: e.target.value ? Number(e.target.value) : undefined })} /></Field>
                  <Field label="حداکثر (میلیون تومان)"><input className="admin-input" value={String(item.max_million_toman ?? "")} onChange={(e) => updateArrayItem("budget_plan_thresholds", index, { max_million_toman: e.target.value ? Number(e.target.value) : undefined })} /></Field>
                </div>
              )}
              onRemove={(index) => removeArrayItem("budget_plan_thresholds", index)}
            />

            <SettingsTextarea title="قوانین فروش AI" value={toLines(settings.ai_sales_rules)} onChange={(value) => setSettingValue("ai_sales_rules", fromLines(value))} />
            <SettingsTextarea title="جریان سوال‌های چت‌بات" value={toLines(settings.chatbot_question_flow)} onChange={(value) => setSettingValue("chatbot_question_flow", fromLines(value))} />

            <EditableList
              title="تکنولوژی‌های پیشنهادی"
              items={Array.isArray(settings.recommended_technologies) ? settings.recommended_technologies as Record<string, unknown>[] : []}
              onAdd={() => addArrayItem("recommended_technologies", { condition: "", recommendation: "" })}
              renderItem={(item, index) => (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="شرط"><input className="admin-input" value={String(item.condition || "")} onChange={(e) => updateArrayItem("recommended_technologies", index, { condition: e.target.value })} /></Field>
                  <Field label="پیشنهاد"><input className="admin-input" value={String(item.recommendation || "")} onChange={(e) => updateArrayItem("recommended_technologies", index, { recommendation: e.target.value })} /></Field>
                </div>
              )}
              onRemove={(index) => removeArrayItem("recommended_technologies", index)}
            />

            <EditableList
              title="زمان‌بندی‌ها"
              items={Array.isArray(settings.timeline_estimates) ? settings.timeline_estimates as Record<string, unknown>[] : []}
              onAdd={() => addArrayItem("timeline_estimates", { project_type: "", estimate: "" })}
              renderItem={(item, index) => (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="نوع پروژه"><input className="admin-input" value={String(item.project_type || "")} onChange={(e) => updateArrayItem("timeline_estimates", index, { project_type: e.target.value })} /></Field>
                  <Field label="زمان تخمینی"><input className="admin-input" value={String(item.estimate || "")} onChange={(e) => updateArrayItem("timeline_estimates", index, { estimate: e.target.value })} /></Field>
                </div>
              )}
              onRemove={(index) => removeArrayItem("timeline_estimates", index)}
            />

            <section className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-5 space-y-4">
              <h3 className="text-[hsl(var(--foreground))] font-semibold">قالب‌های پاسخ آماده</h3>
              {Object.entries((settings.predefined_response_templates || {}) as Record<string, string>).map(([key, value]) => (
                <Field key={key} label={key}>
                  <textarea
                    value={value}
                    onChange={(e) => setSettingValue("predefined_response_templates", { ...(settings.predefined_response_templates as object || {}), [key]: e.target.value })}
                    className="admin-textarea min-h-[90px]"
                  />
                </Field>
              ))}
            </section>

            <EditableList
              title="قوانین امتیازدهی لید"
              items={Array.isArray(settings.lead_scoring_rules) ? settings.lead_scoring_rules as Record<string, unknown>[] : []}
              onAdd={() => addArrayItem("lead_scoring_rules", { condition: "", score: 0 })}
              renderItem={(item, index) => (
                <div className="grid gap-3 md:grid-cols-[1fr_120px]">
                  <Field label="شرط"><input className="admin-input" value={String(item.condition || "")} onChange={(e) => updateArrayItem("lead_scoring_rules", index, { condition: e.target.value })} /></Field>
                  <Field label="امتیاز"><input type="number" className="admin-input" value={String(item.score || 0)} onChange={(e) => updateArrayItem("lead_scoring_rules", index, { score: Number(e.target.value) })} /></Field>
                </div>
              )}
              onRemove={(index) => removeArrayItem("lead_scoring_rules", index)}
            />

            <details className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-5">
              <summary className="cursor-pointer text-[hsl(var(--foreground))] font-semibold">نمایش JSON خام برای بررسی فنی</summary>
              <pre dir="ltr" className="mt-4 overflow-auto rounded-xl bg-[hsl(var(--background))] p-4 text-xs leading-6 text-[hsl(var(--secondary-foreground))]">
                {JSON.stringify(Object.fromEntries(SETTING_SECTIONS.map((key) => [key, settings[key]])), null, 2)}
              </pre>
            </details>
          </div>
        )}
      </main>

      {/* Order Management Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}>
          <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))] sticky top-0 bg-[--surface]">
              <h3 className="font-semibold text-[hsl(var(--foreground))] truncate">{selected.project_name}</h3>
              <button onClick={() => setSelected(null)} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors flex-shrink-0 mr-4">✕</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info */}
              <div className="space-y-3 text-sm">
                <p className="text-[hsl(var(--muted-foreground))] text-xs">خلاصه</p>
                <p className="text-[hsl(var(--secondary-foreground))] leading-relaxed">{selected.summary}</p>
                <ul className="space-y-1 mt-2">
                  {selected.features.map((f, i) => (
                    <li key={i} className="text-[hsl(var(--muted-foreground))] flex gap-2"><span className="text-violet-300">•</span>{f}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div><p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">تکنولوژی</p><p className="text-[hsl(var(--secondary-foreground))]">{selected.tech_stack}</p></div>
                  <div><p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">تحویل</p><p className="text-[hsl(var(--secondary-foreground))]">{selected.delivery_days} روز</p></div>
                  <div><p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">تخمین اولیه</p><p className="text-[hsl(var(--secondary-foreground))]">{selected.price_label}</p></div>
                  <div><p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">وضعیت</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[selected.status]}`}>
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-[hsl(var(--border))] pt-5 space-y-3">
                <p className="text-[hsl(var(--foreground))] text-sm font-medium">تاریخچه چت این پروژه</p>
                {(selected.chat_history || []).length === 0 ? (
                  <p className="text-sm text-[hsl(var(--muted-foreground))]">
                    برای این سفارش تاریخچه چت ثبت نشده (احتمالاً سفارش قدیمی است).
                  </p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {(selected.chat_history || []).map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "bg-[--violet-glow] border border-[--violet-border] text-[hsl(var(--foreground))]"
                            : "bg-[--surface] border border-[hsl(var(--border))] text-[hsl(var(--secondary-foreground))]"
                        }`}
                      >
                        <p className="text-xs mb-1 opacity-70">{message.role === "user" ? "کاربر" : "دستیار"}</p>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Approve Section */}
              {selected.status !== "paid" && selected.status !== "cancelled" && (
                <div className="border-t border-[hsl(var(--border))] pt-5 space-y-4">
                  <p className="text-[hsl(var(--foreground))] text-sm font-medium">تایید و تعیین مبلغ</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[hsl(var(--muted-foreground))] text-xs mb-2">قیمت نهایی (ریال)</label>
                      <input type="number" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)}
                        placeholder="مثال: 18000000"
                        className="w-full bg-[--surface] border border-[hsl(var(--border))] rounded-xl px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[--violet] transition-colors" />
                    </div>
                    <div>
                      <label className="block text-[hsl(var(--muted-foreground))] text-xs mb-2">درصد پیش‌پرداخت</label>
                      <input type="number" min={10} max={100} value={payPercent} onChange={(e) => setPayPercent(e.target.value)}
                        className="w-full bg-[--surface] border border-[hsl(var(--border))] rounded-xl px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[--violet] transition-colors" />
                    </div>
                  </div>
                  {payAmount && (
                    <div className="bg-[--violet-glow] border border-[--violet-border] rounded-xl px-4 py-3 flex justify-between items-center">
                      <p className="text-[hsl(var(--muted-foreground))] text-xs">مبلغ قابل پرداخت توسط مشتری</p>
                      <p className="text-violet-300 font-bold">{payAmount.toLocaleString("fa-IR")} ریال</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-[hsl(var(--muted-foreground))] text-xs mb-2">یادداشت برای مشتری (اختیاری)</label>
                    <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2}
                      className="w-full bg-[--surface] border border-[hsl(var(--border))] rounded-xl px-3 py-2.5 text-sm text-[hsl(var(--foreground))] outline-none focus:border-[--violet] transition-colors resize-none" />
                  </div>
                  {error && <p className="text-red-400 text-sm">{error}</p>}
                  <button onClick={handleApprove} disabled={approving || !finalPrice}
                    className="w-full bg-[--violet] hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl py-3 text-sm transition-colors">
                    {approving ? "در حال ثبت..." : selected.status === "awaiting_payment" ? "به‌روزرسانی" : "تایید و ارسال به مشتری"}
                  </button>
                </div>
              )}

              {/* Upload Proposal */}
              <div className="border-t border-[hsl(var(--border))] pt-5">
                <p className="text-[hsl(var(--foreground))] text-sm font-medium mb-3">آپلود پروپوزال PDF</p>
                {selected.proposal_file && (
                  <p className="text-violet-300 text-xs mb-2">✓ فایل آپلود شده: {selected.proposal_file.split("/").pop()}</p>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleUpload}
                  className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-full border border-[hsl(var(--border))] hover:border-[--violet-border] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] rounded-xl py-3 text-sm transition-colors disabled:opacity-60">
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
    <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-xl p-5 text-center">
      <p className="text-[hsl(var(--muted-foreground))] text-xs mb-2">{label}</p>
      <p className={`font-bold text-xl ${accent ? "text-violet-300" : warn ? "text-amber-600" : "text-[hsl(var(--foreground))]"}`}>{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[hsl(var(--muted-foreground))] text-xs mb-2">{label}</span>
      {children}
    </label>
  );
}

function EditableList({
  title,
  items,
  renderItem,
  onAdd,
  onRemove,
}: {
  title: string;
  items: Record<string, unknown>[];
  renderItem: (item: Record<string, unknown>, index: number) => React.ReactNode;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[hsl(var(--foreground))] font-semibold">{title}</h3>
        <button onClick={onAdd} className="border border-[hsl(var(--border))] hover:border-[--violet-border] text-[hsl(var(--foreground))] rounded-xl px-4 py-2 text-xs transition-colors">
          افزودن
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="bg-[--surface] border border-[hsl(var(--border))] rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">{renderItem(item, index)}</div>
              <button onClick={() => onRemove(index)} className="text-red-400 hover:text-red-300 text-xs px-2 py-2">
                حذف
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SettingsTextarea({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) {
  return (
    <section className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-[hsl(var(--foreground))] font-semibold">{title}</h3>
        <p className="text-[hsl(var(--muted-foreground))] text-xs mt-1">هر خط یک مورد جداگانه است.</p>
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className="admin-textarea min-h-[180px]" />
    </section>
  );
}
