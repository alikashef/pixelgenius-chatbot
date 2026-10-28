"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import SkillsManager from "@/components/admin/SkillsManager";
import DesignerSettings from "@/components/admin/DesignerSettings";
import FreelancerInvites from "@/components/admin/FreelancerInvites";
import {
  AdminSite,
  manageAdminSites,
  fetchOrders,
  approveOrder,
  uploadProposal,
  fetchAISettings,
  updateAISettings,
  Order,
} from "@/lib/api";
import AppShell, { ShellLoading } from "@/components/AppShell";
import { IconAdjustments, IconCheck, IconClipboardList, IconPalette, IconUsers, IconWand, IconWorld, IconX } from "@tabler/icons-react";

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

type AdminTab = "orders" | "settings" | "design" | "sites" | "skills" | "freelancers";

// Sales orders (priced, paid) and product-design projects (config briefs) are separate workflows.
const ADMIN_TABS: { key: AdminTab; group: string; label: string; title: string; description: string; icon: typeof IconClipboardList }[] = [
  { key: "orders", group: "فروش", label: "سفارش‌ها", title: "سفارش‌های فروش", description: "درخواست‌های مشاور فروش را بررسی کن، قیمت نهایی بده و وضعیت پرداخت را دنبال کن.", icon: IconClipboardList },
  { key: "settings", group: "فروش", label: "تنظیمات فروش و AI", title: "تنظیمات فروش و AI", description: "رفتار مشاور فروش، شرایط پرداخت و دانش قیمت‌گذاری.", icon: IconAdjustments },
  { key: "design", group: "طراحی محصول", label: "پروژه‌ها", title: "پروژه‌های طراحی محصول", description: "کانفیگ‌هایی که طراح محصول برای کاربران ساخته؛ بدون قیمت‌گذاری و پرداخت.", icon: IconWand },
  { key: "sites", group: "طراحی محصول", label: "سایت‌های منتشرشده", title: "سایت‌های منتشرشده", description: "پیش‌نمایش‌ها و انتشارهای فعال پروژه‌های طراحی؛ تمدید یا حذفشان کن.", icon: IconWorld },
  { key: "skills", group: "طراحی محصول", label: "تنظیمات طراح محصول", title: "تنظیمات طراح محصول", description: "استک‌ها، مهارت‌ها و تنظیمات تولید تصویر طراح محصول.", icon: IconPalette },
  { key: "freelancers", group: "فریلنسرها", label: "دعوت و اعضا", title: "فریلنسرها", description: "ثبت‌نام فریلنسر فقط با دعوت‌نامه است؛ کد دعوت بساز و اعضا را ببین.", icon: IconUsers },
];

function isAdminTab(value: string | null): value is AdminTab {
  return ADMIN_TABS.some((t) => t.key === value);
}

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
  const [selected, setSelected] = useState<Order | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("orders");
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
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
      const [o, aiSettings] = await Promise.all([fetchOrders(token), fetchAISettings(token)]);
      setOrders(o);
      setSettings(aiSettings);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "UNAUTHORIZED") { localStorage.removeItem("admin_token"); router.replace("/admin/login"); }
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isAdminTab(tab)) setActiveTab(tab);
    load();
  }, []);

  function selectTab(tab: AdminTab) {
    setActiveTab(tab);
    window.history.replaceState(null, "", tab === "orders" ? "/admin/dashboard" : `/admin/dashboard?tab=${tab}`);
  }

  const salesOrders = orders.filter((o) => o.mode !== "designer");
  const designOrders = orders.filter((o) => o.mode === "designer");
  const salesStats = {
    total: salesOrders.length,
    pending: salesOrders.filter((o) => o.status === "pending_review").length,
    paid: salesOrders.filter((o) => o.status === "paid").length,
    revenue: salesOrders.filter((o) => o.status === "paid").reduce((sum, o) => sum + (o.payment_amount || 0), 0),
  };

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
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 3000);
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

  if (loading) return <ShellLoading />;

  return (
    <>
      {savedToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-5 py-3 text-sm font-bold text-foreground shadow-elevated animate-in fade-in slide-in-from-bottom-3 duration-300">
          <IconCheck size={18} stroke={2.5} className="text-success" aria-hidden="true" />
          تنظیمات با موفقیت ذخیره شد
        </div>
      )}
      <AppShell
        area="ادمین"
        width="wide"
        nav={ADMIN_TABS.map(({ key, group, label, icon }) => ({
          key,
          group,
          label,
          icon,
          active: activeTab === key,
          onSelect: () => selectTab(key),
          count: key === "orders" ? salesOrders.length || undefined : key === "design" ? designOrders.length || undefined : undefined,
        }))}
        user={{ name: "مدیر سیستم" }}
        onLogout={() => { localStorage.removeItem("admin_token"); router.push("/admin/login"); }}
        title={ADMIN_TABS.find((t) => t.key === activeTab)?.title}
        description={ADMIN_TABS.find((t) => t.key === activeTab)?.description}
      >
        <div className="space-y-8">
        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

        {activeTab === "sites" && <PublishedSites orders={orders} />}

        {activeTab === "orders" && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="کل سفارش‌ها" value={salesStats.total.toLocaleString("fa-IR")} />
            <StatCard label="در انتظار بررسی" value={salesStats.pending.toLocaleString("fa-IR")} warn />
            <StatCard label="پرداخت‌شده" value={salesStats.paid.toLocaleString("fa-IR")} accent />
            <StatCard label="درآمد (ریال)" value={salesStats.revenue.toLocaleString("fa-IR")} />
          </div>
        )}

        {activeTab === "orders" && <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-bold text-foreground">همه سفارش‌ها</h2>
          </div>
          {salesOrders.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">هیچ سفارش فروشی ثبت نشده</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-2/70">
                    {["پروژه", "تخمین قیمت", "قیمت نهایی", "وضعیت", "تاریخ", ""].map((h) => (
                      <th key={h} className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {salesOrders.map((order) => (
                    <tr key={order.id} className="border-b border-border transition-colors last:border-0 hover:bg-foreground/[0.02]">
                      <td className="max-w-[220px] truncate px-5 py-4 text-sm font-bold text-foreground">{order.project_name}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{order.price_label}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-sm text-foreground">
                        {order.final_price ? `${order.final_price.toLocaleString("fa-IR")} ریال` : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold leading-6 ${STATUS_CLASS[order.status]}`}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                          {STATUS_LABEL[order.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">{formatDate(order.created_at)}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => router.push(`/admin/orders/${order.id}`)} className="inline-flex min-h-8 items-center rounded-lg border border-border px-3 text-xs font-bold text-foreground outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">
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

        {activeTab === "design" && (
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-bold text-foreground">همه پروژه‌های طراحی</h2>
            </div>
            {designOrders.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">هنوز پروژه‌ی طراحی محصولی ساخته نشده</p>
            ) : (
              <ul className="divide-y divide-border">
                {designOrders.map((order) => (
                  <li key={order.id} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-foreground/[0.02]">
                    <span className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground sm:grid" aria-hidden="true">
                      <IconWand size={19} stroke={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">{order.project_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground" dir="auto">
                        {[order.tech_stack, formatDate(order.created_at)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <button onClick={() => router.push(`/admin/orders/${order.id}`)} className="inline-flex min-h-8 shrink-0 items-center rounded-lg border border-border px-3 text-xs font-bold text-foreground outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring">
                      مشاهده
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "freelancers" && (
          <FreelancerInvites getToken={getToken} onUnauthorized={() => { localStorage.removeItem("admin_token"); router.push("/admin/login"); }} />
        )}

        {activeTab === "skills" && (
          <div className="space-y-8">
            <DesignerSettings
              getToken={getToken}
              settings={settings}
              onSettingsChange={setSettings}
              onUnauthorized={() => { localStorage.removeItem("admin_token"); router.push("/admin/login"); }}
            />
            <SkillsManager
              getToken={getToken}
              settings={settings}
              onSettingsChange={setSettings}
              onUnauthorized={() => { localStorage.removeItem("admin_token"); router.push("/admin/login"); }}
            />
          </div>
        )}

        {activeTab === "settings" && (
          <div className="space-y-5">
            <div className="bg-surface border border-border rounded-2xl px-6 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-semibold text-foreground">تنظیمات فروش و هوش مصنوعی</h2>
                <p className="text-muted-foreground text-xs mt-1">
                  این فرم‌ها مستقیماً روی رفتار چت‌بات اثر می‌گذارند؛ بدون تغییر کد می‌توانید قیمت، بودجه، سوال‌ها و قوانین فروش را اصلاح کنید.
                </p>
              </div>
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-foreground font-bold rounded-xl px-5 py-3 text-sm transition-colors"
              >
                {savingSettings ? "در حال ذخیره..." : "ذخیره همه تنظیمات"}
              </button>
            </div>

            <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="text-foreground font-semibold">مدل هوش مصنوعی</h3>
                <p className="text-muted-foreground text-xs mt-1">مدلی که چت‌بات برای پاسخ به مشتریان استفاده می‌کند.</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  { key: "gapgpt-qwen-3.6", label: "GapGPT Qwen 3.6", desc: "سریع و اقتصادی" },
                  { key: "claude-opus-4-6", label: "Claude Opus 4.6", desc: "قدرتمند و دقیق برای متن و تصویر" },
                ].map((model) => {
                  const isSelected = (settings.ai_model || "gapgpt-qwen-3.6") === model.key;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      onClick={() => setSettingValue("ai_model", model.key)}
                      className={`flex flex-col items-start gap-1 rounded-xl border px-4 py-3 text-right transition-all ${
                        isSelected
                          ? "border-brand-line bg-brand-soft text-foreground"
                          : "border-border bg-background text-muted-foreground hover:border-brand-line hover:text-foreground"
                      }`}
                    >
                      <span className="text-sm font-semibold">{model.label}</span>
                      <span className="text-xs opacity-70">{model.desc}</span>
                      {isSelected && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-brand"><span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />فعال</span>}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
              <h3 className="text-foreground font-semibold">واحد پول و شرایط پرداخت</h3>
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

            <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
              <h3 className="text-foreground font-semibold">قالب‌های پاسخ آماده</h3>
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

            <details className="bg-surface border border-border rounded-2xl p-5">
              <summary className="cursor-pointer text-foreground font-semibold">نمایش JSON خام برای بررسی فنی</summary>
              <pre dir="ltr" className="mt-4 overflow-auto rounded-xl bg-background p-4 text-xs leading-6 text-secondary-foreground">
                {JSON.stringify(Object.fromEntries(SETTING_SECTIONS.map((key) => [key, settings[key]])), null, 2)}
              </pre>
            </details>
          </div>
        )}
        </div>
      </AppShell>

      {/* Order Management Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/50 p-4 backdrop-blur-[2px]"
          onClick={() => setSelected(null)}>
          <div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-surface shadow-elevated"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-surface">
              <h3 className="font-semibold text-foreground truncate">{selected.project_name}</h3>
              <button onClick={() => setSelected(null)} aria-label="بستن" className="mr-4 grid h-9 w-9 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"><IconX size={18} aria-hidden="true" /></button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info */}
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground text-xs">خلاصه</p>
                <p className="text-secondary-foreground leading-relaxed">{selected.summary}</p>
                <ul className="space-y-1 mt-2">
                  {selected.features.map((f, i) => (
                    <li key={i} className="text-muted-foreground flex gap-2"><span className="text-brand">•</span>{f}</li>
                  ))}
                </ul>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div><p className="text-muted-foreground text-xs mb-1">تکنولوژی</p><p className="text-secondary-foreground">{selected.tech_stack}</p></div>
                  <div><p className="text-muted-foreground text-xs mb-1">تحویل</p><p className="text-secondary-foreground">{selected.delivery_days} روز</p></div>
                  <div><p className="text-muted-foreground text-xs mb-1">تخمین اولیه</p><p className="text-secondary-foreground">{selected.price_label}</p></div>
                  <div><p className="text-muted-foreground text-xs mb-1">وضعیت</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLASS[selected.status]}`}>
                      {STATUS_LABEL[selected.status]}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-5 space-y-3">
                <p className="text-foreground text-sm font-medium">تاریخچه چت این پروژه</p>
                {(selected.chat_history || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    برای این سفارش تاریخچه چت ثبت نشده (احتمالاً سفارش قدیمی است).
                  </p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {(selected.chat_history || []).map((message, index) => (
                      <div
                        key={`${message.role}-${index}`}
                        className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                          message.role === "user"
                            ? "bg-brand-soft border border-brand-line text-foreground"
                            : "bg-surface border border-border text-secondary-foreground"
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
                <div className="border-t border-border pt-5 space-y-4">
                  <p className="text-foreground text-sm font-medium">تایید و تعیین مبلغ</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-muted-foreground text-xs mb-2">قیمت نهایی (ریال)</label>
                      <input type="number" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)}
                        placeholder="مثال: 18000000"
                        className="field" />
                    </div>
                    <div>
                      <label className="block text-muted-foreground text-xs mb-2">درصد پیش‌پرداخت</label>
                      <input type="number" min={10} max={100} value={payPercent} onChange={(e) => setPayPercent(e.target.value)}
                        className="field" />
                    </div>
                  </div>
                  {payAmount && (
                    <div className="bg-brand-soft border border-brand-line rounded-xl px-4 py-3 flex justify-between items-center">
                      <p className="text-muted-foreground text-xs">مبلغ قابل پرداخت توسط مشتری</p>
                      <p className="text-brand font-bold">{payAmount.toLocaleString("fa-IR")} ریال</p>
                    </div>
                  )}
                  <div>
                    <label className="block text-muted-foreground text-xs mb-2">یادداشت برای مشتری (اختیاری)</label>
                    <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={2}
                      className="field resize-none" />
                  </div>
                  {error && <p className="text-danger text-sm">{error}</p>}
                  <button onClick={handleApprove} disabled={approving || !finalPrice}
                    className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-foreground font-bold rounded-xl py-3 text-sm transition-colors">
                    {approving ? "در حال ثبت..." : selected.status === "awaiting_payment" ? "به‌روزرسانی" : "تایید و ارسال به مشتری"}
                  </button>
                </div>
              )}

              {/* Upload Proposal */}
              <div className="border-t border-border pt-5">
                <p className="text-foreground text-sm font-medium mb-3">آپلود پروپوزال PDF</p>
                {selected.proposal_file && (
                  <p className="mb-2 flex items-center gap-1 text-xs text-brand"><IconCheck size={14} aria-hidden="true" /> فایل آپلود شده: {selected.proposal_file.split("/").pop()}</p>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" onChange={handleUpload}
                  className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="w-full border border-border hover:border-brand-line text-muted-foreground hover:text-foreground rounded-xl py-3 text-sm transition-colors disabled:opacity-60">
                  {uploading ? "در حال آپلود..." : selected.proposal_file ? "جایگزینی فایل" : "انتخاب و آپلود فایل"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <p className="flex items-center gap-2 text-[13px] font-bold text-muted-foreground">
        <span aria-hidden="true" className={`h-2 w-2 rounded-full ${accent ? "bg-success" : warn ? "bg-warning" : "bg-foreground/25"}`} />
        {label}
      </p>
      <p className="mt-3 text-[1.75rem] font-black leading-none tracking-tight text-foreground">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
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
    <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-foreground font-semibold">{title}</h3>
        <button onClick={onAdd} className="border border-border hover:border-brand-line text-foreground rounded-xl px-4 py-2 text-xs transition-colors">
          افزودن
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">{renderItem(item, index)}</div>
              <button onClick={() => onRemove(index)} className="text-danger hover:text-danger text-xs px-2 py-2">
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
    <section className="bg-surface border border-border rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-foreground font-semibold">{title}</h3>
        <p className="text-muted-foreground text-xs mt-1">هر خط یک مورد جداگانه است.</p>
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} className="admin-textarea min-h-[180px]" />
    </section>
  );
}


function PublishedSites({ orders }: { orders: Order[] }) {
  const [sites, setSites] = useState<AdminSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hours, setHours] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState<AdminSite | null>(null);
  const [now, setNow] = useState(Date.now());
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await manageAdminSites(localStorage.getItem("admin_token") || "");
      setSites(data.sites);
    } catch (e) { setError(e instanceof Error ? e.message : "دریافت سایت‌ها ناموفق بود"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    load();
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  async function act(site: AdminSite, remove: boolean) {
    const key = `${site.kind}:${site.slug}`;
    const extension = Number(hours[key] || "24");
    if (!remove && (!Number.isInteger(extension) || extension < 1 || extension > 8760)) {
      setError("زمان تمدید باید بین ۱ تا ۸۷۶۰ ساعت باشد"); return;
    }
    setBusy(key); setError(""); setNotice("");
    try {
      const data = await manageAdminSites(localStorage.getItem("admin_token") || "", site.kind, site.slug, remove ? undefined : extension, remove);
      setSites((previous) => remove ? previous.filter((item) => `${item.kind}:${item.slug}` !== key) : previous.map((item) => `${item.kind}:${item.slug}` === key ? { ...item, expires_at: data.expires_at } : item));
      setDeleting(null);
      setNotice(remove ? "سایت حذف شد." : "زمان فعال‌بودن سایت تمدید شد.");
    } catch (e) { setError(e instanceof Error ? e.message : "عملیات انجام نشد"); }
    finally { setBusy(""); }
  }
  const states: Record<string, string> = { READY: "فعال", BUILDING: "در حال ساخت", PREPARING: "آماده‌سازی", UPLOADING: "در حال بارگذاری", FAILED: "ناموفق", EXPIRED: "منقضی‌شده", UNKNOWN: "وضعیت در دسترس نیست", UNHEALTHY: "ناسالم", CANCELED: "لغوشده", TIMEDOUT: "پایان مهلت ساخت" };
  return <section className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="text-xl font-bold">سایت‌های منتشرشده</h2><p className="mt-2 text-sm text-muted-foreground">تمدید به زمان باقی‌مانده اضافه می‌شود. سایت‌های لیارا پس از انقضا به‌صورت خودکار پاک می‌شوند؛ تمدید زمان، هزینه میزبانی را ادامه می‌دهد.</p></div>
      <button disabled={loading || !!busy} onClick={load} className="rounded-xl border border-brand-line px-4 py-2 text-brand disabled:opacity-50">به‌روزرسانی</button>
    </div>
    {error && <p role="alert" className="text-danger">{error === "UNAUTHORIZED" ? "نشست ادمین منقضی شده؛ دوباره وارد شوید." : error}</p>}
    {notice && <p role="status" className="text-brand">{notice}</p>}
    {loading ? <p role="status">در حال دریافت سایت‌ها…</p> : sites.length === 0 ? <p>هنوز سایتی منتشر نشده است.</p> : <div className="grid gap-4 md:grid-cols-2">{sites.map((site) => {
      const key = `${site.kind}:${site.slug}`;
      const order = orders.find((item) => item.id === site.order_id);
      const remaining = Math.max(0, Math.ceil((site.expires_at * 1000 - now) / 60000));
      return <article key={key} className="space-y-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="flex items-start justify-between gap-3"><h3 className="font-bold">{order?.project_name || site.slug}</h3><span className="text-sm text-brand">{remaining === 0 ? "منقضی‌شده" : states[site.state] || site.state}</span></div>
        <a href={site.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="block break-all text-sm text-brand underline">{site.url}</a>
        <dl className="space-y-2 text-sm text-muted-foreground">
          <div>میزبان: {site.kind === "dynamic" ? `لیارا · ${site.platform}` : "فایل‌سرور استاتیک"}</div>
          {site.app && <div dir="ltr">{site.app}</div>}
          <div>انقضا: {new Date(site.expires_at * 1000).toLocaleString("fa-IR", { timeZone: "Asia/Tehran" })} (تهران)</div>
          <div>باقی‌مانده: {Math.floor(remaining / 60).toLocaleString("fa-IR")} ساعت و {(remaining % 60).toLocaleString("fa-IR")} دقیقه</div>
        </dl>
        {site.order_id && <a className="block text-sm text-brand underline" href={`/admin/orders/${site.order_id}`}>مشاهده پروژه</a>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">افزایش زمان (ساعت)<input aria-label={`ساعت تمدید ${site.slug}`} type="number" min="1" max="8760" step="1" value={hours[key] || "24"} onChange={(e) => setHours((old) => ({ ...old, [key]: e.target.value }))} className="mt-2 block w-28 rounded-xl border border-border bg-background p-2" /></label>
          <button disabled={!!busy} onClick={() => act(site, false)} className="rounded-xl bg-violet-600 px-4 py-2 disabled:opacity-50">{busy === key ? "در حال انجام…" : "تمدید"}</button>
          <button disabled={!!busy} onClick={() => { setDeleting(site); setError(""); }} className="rounded-xl border border-danger/30 px-4 py-2 text-danger disabled:opacity-50">{site.kind === "dynamic" ? "حذف از لیارا" : "حذف سایت"}</button>
        </div>
      </article>;
    })}</div>}
    {deleting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4"><div role="dialog" aria-modal="true" aria-labelledby="delete-site-title" className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h3 id="delete-site-title" className="font-bold">حذف دائمی سایت</h3>
      <p className="break-all" dir="ltr">{deleting.url}</p>
      <p>{deleting.kind === "dynamic" ? `اپلیکیشن${deleting.has_database ? " و دیتابیس وابسته" : ""} از لیارا پاک می‌شود و سایت از دسترس خارج می‌شود.` : "فایل‌های سایت پاک می‌شوند و سایت از دسترس خارج می‌شود."} این عملیات قابل بازگشت نیست؛ اطلاعات سفارش حفظ می‌شود.</p>
      <div className="flex gap-3"><button disabled={!!busy} onClick={() => act(deleting, true)} className="rounded-xl bg-danger px-4 py-2 font-bold text-primary-foreground disabled:opacity-50">{busy ? "در حال حذف…" : "حذف دائمی"}</button><button disabled={!!busy} onClick={() => setDeleting(null)} className="rounded-xl border border-border px-4 py-2">انصراف</button></div>
    </div></div>}
  </section>;
}
