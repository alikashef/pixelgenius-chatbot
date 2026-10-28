"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconPlus,
  IconSparkles,
  IconLogout,
  IconClipboardList,
  IconMessage,
  IconSettings,
  IconWand,
  IconCoin,
  IconCheck,
  IconDownload,
  IconChevronLeft,
  IconCalendar,
} from "@tabler/icons-react";
import { fetchCustomerProfile, fetchMyOrders, updateCustomerProfile, CustomerProfile, Order } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "border border-warning/25 bg-warning/10 text-warning",
  approved: "border border-info/25 bg-info/10 text-info",
  awaiting_payment: "border border-pending/25 bg-pending/10 text-pending",
  paid: "border border-primary/25 bg-primary/10 text-brand",
  cancelled: "border border-danger/25 bg-danger/10 text-danger",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatMoney(value: number | null) {
  if (!value) return null;
  return `${value.toLocaleString("fa-IR")} تومان`;
}

interface ChatSessionListItem {
  id: string;
  title: string;
  updated_at: string;
}

function readChatSessions(customerId: string): ChatSessionListItem[] {
  try {
    const raw = localStorage.getItem(`chat_sessions_customer_${customerId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatSessionListItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.id && item?.title && item?.updated_at);
  } catch {
    return [];
  }
}

const TABS = [
  { key: "orders", label: "پروژه‌ها", icon: IconClipboardList },
  { key: "chats", label: "چت‌های ناتمام", icon: IconMessage },
  { key: "account", label: "حساب", icon: IconSettings },
] as const;

function hasPrice(order: Order) {
  const label = (order.price_label || "").trim();
  return Boolean(order.final_price) || (label !== "" && label !== "-");
}

function ProjectCard({ order }: { order: Order }) {
  const isDesigner = order.mode === "designer";
  const Icon = isDesigner ? IconWand : IconCoin;
  return (
    <article className="group flex flex-col rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-primary-line shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-semibold text-brand">
          <Icon size={13} stroke={2.2} />
          {isDesigner ? "طراحی محصول" : "مشاوره فروش"}
        </span>
        {isDesigner ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success/25 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <IconCheck size={12} stroke={3} />
            کانفیگ آماده
          </span>
        ) : (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        )}
      </div>

      <h3 className="mt-4 text-base font-bold leading-7 text-foreground">
        <Link
          href={`/panel/${order.id}`}
          className="rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {order.project_name}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-7 text-muted-foreground">{order.summary}</p>

      <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <IconCalendar size={13} stroke={2} />
          <dt className="sr-only">تاریخ ثبت</dt>
          <dd>{formatDate(order.created_at)}</dd>
        </div>
        {order.tech_stack && (
          <div className="min-w-0 max-w-full truncate">
            <dt className="sr-only">استک</dt>
            <dd className="truncate" dir="auto">{order.tech_stack}</dd>
          </div>
        )}
        {!isDesigner && hasPrice(order) && (
          <div>
            <dt className="sr-only">مبلغ</dt>
            <dd className="font-semibold text-foreground">{formatMoney(order.final_price) || order.price_label}</dd>
          </div>
        )}
      </dl>

      <div className="relative z-10 mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        {isDesigner ? (
          <Link
            href={`/chat?brief=${order.id}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconDownload size={16} stroke={2.2} />
            دریافت کانفیگ
          </Link>
        ) : order.status === "awaiting_payment" ? (
          <Link
            href={`/panel/${order.id}`}
            className="inline-flex min-h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
          >
            پرداخت
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">
            {order.status === "pending_review" ? "تیم ما در حال بررسی است" : ""}
          </span>
        )}
        <Link
          href={`/panel/${order.id}`}
          className="inline-flex items-center gap-0.5 rounded text-xs font-semibold text-brand outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {isDesigner ? "فضای پروژه" : "جزئیات"}
          <IconChevronLeft size={14} stroke={2.5} />
        </Link>
      </div>
    </article>
  );
}

type TabKey = (typeof TABS)[number]["key"];

export default function PanelPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("orders");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (!token) { router.replace("/login?redirect=/panel"); return; }
    Promise.all([fetchMyOrders(token), fetchCustomerProfile(token)])
      .then(([ordersData, profileData]) => {
        setOrders(ordersData);
        setChatSessions(readChatSessions(profileData.id));
        setProfile(profileData);
        setFirstName(profileData.first_name || "");
        setLastName(profileData.last_name || "");
        setBusinessType(profileData.business_type || "");
        if (profileData.first_name) localStorage.setItem("customer_first_name", profileData.first_name);
      })
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
    localStorage.removeItem("customer_first_name");
    router.push("/chat");
  }

  async function handleSaveProfile() {
    const token = localStorage.getItem("customer_token");
    if (!token) return;
    setSavingProfile(true);
    setSaved(false);
    setError("");
    try {
      const updated = await updateCustomerProfile(token, {
        first_name: firstName || null,
        last_name: lastName || null,
        business_type: businessType || null,
      });
      setProfile(updated);
      setSaved(true);
      if (updated.first_name) localStorage.setItem("customer_first_name", updated.first_name);
      else localStorage.removeItem("customer_first_name");
    } catch (err: unknown) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") {
        localStorage.removeItem("customer_token");
        router.replace("/login?redirect=/panel");
      } else {
        setError(err instanceof Error ? err.message : "خطا در ذخیره تنظیمات");
      }
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const greeting = profile?.first_name ? `سلام ${profile.first_name} جان` : "سلام";

  return (
    <div className="min-h-screen bg-background bg-aura">
      <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="FreelioAI، صفحه اصلی"
          className="flex items-center gap-2 rounded-lg font-black text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-primary-foreground shadow-md shadow-primary/30">
            <IconSparkles size={18} stroke={2.2} aria-hidden="true" />
          </span>
          <span className="hidden text-base tracking-tight sm:inline">Freelio<span className="text-gradient">AI</span></span>
        </Link>

        <div className="mr-auto flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/chat?new=1"
            className="flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm shadow-primary/25 outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <IconPlus size={14} stroke={2.5} />
            <span className="hidden sm:inline">پروژه جدید</span>
            <span className="sm:hidden">جدید</span>
          </Link>
          <button
            onClick={logout}
            aria-label="خروج از حساب"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-muted-foreground outline-none transition-colors hover:border-danger/40 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconLogout size={14} stroke={2} />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <section className="mb-6">
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{greeting}</h1>
          <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
            {orders.length > 0
              ? "پروژه‌هات اینجاست. کانفیگ هر پروژه رو بگیر یا ادامه‌ی چت‌های ناتمام رو باز کن."
              : "هنوز پروژه‌ای نداری. یه گفتگو با طراح محصول شروع کن تا پروژه‌ات ساخته بشه."}
          </p>
        </section>

        {error && (
          <p role="alert" className="mb-6 rounded-xl border border-danger/20 bg-danger/10 px-4 py-2.5 text-center text-sm text-danger">
            {error}
          </p>
        )}

        <div role="tablist" aria-label="بخش‌های پنل" className="mb-6 flex gap-1 rounded-2xl border border-border bg-surface p-1.5 shadow-card">
          {TABS.map(({ key, label, icon: Icon }) => {
            const count = key === "orders" ? orders.length : key === "chats" ? chatSessions.length : 0;
            const active = activeTab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(key)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:gap-2 sm:px-3 sm:text-sm ${
                  active
                    ? "bg-primary-soft text-brand"
                    : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                }`}
              >
                <Icon size={16} stroke={2} aria-hidden="true" />
                <span>{label}</span>
                {count > 0 && (
                  <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-primary text-primary-foreground" : "bg-foreground/5"}`}>
                    {count.toLocaleString("fa-IR")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "orders" && orders.length === 0 && (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-surface px-6 py-16 text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-brand">
              <IconWand size={26} stroke={1.8} />
            </span>
            <h2 className="mb-1 text-base font-bold text-foreground">اولین پروژه‌ات رو بساز</h2>
            <p className="mb-6 max-w-sm text-sm leading-7 text-muted-foreground">
              ایده‌ات رو به طراح محصول بگو، با چند سوال کوتاه ساختار پروژه مشخص می‌شه و یک کانفیگ آماده می‌گیری.
            </p>
            <Link
              href="/chat?new=1"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconPlus size={16} stroke={2.5} />
              شروع گفتگو
            </Link>
          </div>
        )}

        {activeTab === "orders" && orders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {orders.map((order) => (
              <div key={order.id} className="relative">
                <ProjectCard order={order} />
              </div>
            ))}
            <Link
              href="/chat?new=1"
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground outline-none transition-colors hover:border-primary-line hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-brand">
                <IconPlus size={18} stroke={2.5} />
              </span>
              پروژه جدید
            </Link>
          </div>
        )}

        {activeTab === "chats" && (
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="font-semibold text-foreground">چت‌های ناتمام</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">گفتگوهایی که به نتیجه نرسیده‌اند را ادامه بده.</p>
              </div>
              <Link
                href="/chat?new=1"
                className="flex min-h-9 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-md shadow-primary/25 outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
              >
                <IconPlus size={13} stroke={2.5} />
                چت جدید
              </Link>
            </div>
            {chatSessions.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <IconMessage size={36} stroke={1.2} className="mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">چت ناتمامی نداری.</p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {chatSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/chat?session=${session.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{session.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">آخرین بروزرسانی: {formatDate(session.updated_at)}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand">
                        ادامه
                        <IconChevronLeft size={14} stroke={2.5} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {activeTab === "account" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveProfile();
            }}
            className="space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-card"
          >
            <div>
              <h2 className="font-semibold text-foreground">تنظیمات حساب</h2>
              <p className="mt-1 text-sm text-muted-foreground">این اطلاعات برای شخصی‌سازی چت استفاده می‌شه.</p>
              {profile?.phone && (
                <p className="mt-3 text-xs text-muted-foreground">
                  شماره‌ی موبایل: <span dir="ltr" className="text-foreground">{profile.phone}</span>
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                { id: "first-name", label: "نام", value: firstName, setter: setFirstName, placeholder: "مثلاً علی", autoComplete: "given-name" },
                { id: "last-name", label: "نام خانوادگی", value: lastName, setter: setLastName, placeholder: "مثلاً رضایی", autoComplete: "family-name" },
              ].map(({ id, label, value, setter, placeholder, autoComplete }) => (
                <div key={id}>
                  <label htmlFor={id} className="mb-2 block text-xs text-muted-foreground">{label}</label>
                  <input
                    id={id}
                    value={value}
                    onChange={(e) => {
                      setter(e.target.value);
                      setSaved(false);
                    }}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    className="field min-h-11 px-4"
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label htmlFor="business-type" className="mb-2 block text-xs text-muted-foreground">نوع فعالیت</label>
                <select
                  id="business-type"
                  value={businessType}
                  onChange={(e) => {
                    setBusinessType(e.target.value);
                    setSaved(false);
                  }}
                  className="field min-h-11 px-4"
                >
                  <option value="">انتخاب کنید</option>
                  <option value="فروشگاه آنلاین">فروشگاه آنلاین</option>
                  <option value="خدماتی">خدماتی</option>
                  <option value="شرکتی/B2B">شرکتی/B2B</option>
                  <option value="آموزشی">آموزشی</option>
                  <option value="تولید محتوا/رسانه">تولید محتوا/رسانه</option>
                  <option value="استارتاپ/SaaS">استارتاپ/SaaS</option>
                  <option value="سایر">سایر</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingProfile}
                className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {savingProfile ? "در حال ذخیره..." : "ذخیره تنظیمات"}
              </button>
              {saved && (
                <span role="status" className="inline-flex items-center gap-1 text-sm text-success">
                  <IconCheck size={16} stroke={2.5} />
                  ذخیره شد
                </span>
              )}
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
