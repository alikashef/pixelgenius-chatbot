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

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "border border-yellow-500/25 bg-yellow-500/12 text-yellow-400",
  approved: "border border-blue-500/25 bg-blue-500/12 text-blue-400",
  awaiting_payment: "border border-orange-500/25 bg-orange-500/12 text-orange-400",
  paid: "border border-violet-500/25 bg-violet-500/12 text-violet-400",
  cancelled: "border border-red-500/25 bg-red-500/12 text-red-400",
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
    <article className="group flex flex-col rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-5 transition-all hover:-translate-y-0.5 hover:border-[--violet-border]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-[--violet-glow] px-2.5 py-1 text-xs font-semibold text-violet-300">
          <Icon size={13} stroke={2.2} />
          {isDesigner ? "طراحی محصول" : "مشاوره فروش"}
        </span>
        {isDesigner ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <IconCheck size={12} stroke={3} />
            کانفیگ آماده
          </span>
        ) : (
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
        )}
      </div>

      <h3 className="mt-4 text-base font-bold leading-7 text-white">
        <Link
          href={`/panel/${order.id}`}
          className="rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-[--violet-light]"
        >
          {order.project_name}
        </Link>
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-7 text-[hsl(var(--muted-foreground))]">{order.summary}</p>

      <dl className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[hsl(var(--muted-foreground))]">
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
            <dd className="font-semibold text-[hsl(var(--foreground))]">{formatMoney(order.final_price) || order.price_label}</dd>
          </div>
        )}
      </dl>

      <div className="relative z-10 mt-5 flex items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-4">
        {isDesigner ? (
          <Link
            href={`/chat?brief=${order.id}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[--violet] px-4 text-sm font-bold text-white shadow-md shadow-[--violet-glow] outline-none transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-[--violet-light]"
          >
            <IconDownload size={16} stroke={2.2} />
            دریافت کانفیگ
          </Link>
        ) : order.status === "awaiting_payment" ? (
          <Link
            href={`/panel/${order.id}`}
            className="inline-flex min-h-10 items-center rounded-xl bg-[--violet] px-4 text-sm font-bold text-white shadow-md shadow-[--violet-glow] outline-none transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-[--violet-light]"
          >
            پرداخت
          </Link>
        ) : (
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {order.status === "pending_review" ? "تیم ما در حال بررسی است" : ""}
          </span>
        )}
        <Link
          href={`/panel/${order.id}`}
          className="inline-flex items-center gap-0.5 rounded text-xs font-semibold text-violet-300 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[--violet-light]"
        >
          جزئیات
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
      <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-[--violet] border-t-transparent" />
      </div>
    );
  }

  const greeting = profile?.first_name ? `سلام ${profile.first_name} جان` : "سلام";

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/85 px-4 backdrop-blur-xl sm:px-5">
        <Link
          href="/"
          aria-label="FreelioAI، صفحه اصلی"
          className="flex items-center gap-2 rounded-lg font-black text-white outline-none focus-visible:ring-2 focus-visible:ring-[--violet-light]"
        >
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[--violet] shadow-md shadow-[--violet-glow]">
            <IconSparkles size={16} stroke={2.2} />
          </span>
          <span className="hidden text-sm sm:inline">FreelioAI</span>
        </Link>

        <div className="mr-auto flex items-center gap-2">
          <Link
            href="/chat?new=1"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[--violet-border] bg-[--violet-glow] px-3 text-xs font-semibold text-violet-300 outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[--violet-light]"
          >
            <IconPlus size={14} stroke={2.5} />
            <span className="hidden sm:inline">پروژه جدید</span>
            <span className="sm:hidden">جدید</span>
          </Link>
          <button
            onClick={logout}
            aria-label="خروج از حساب"
            className="flex h-9 items-center gap-1.5 rounded-xl border border-[hsl(var(--border))] bg-[--surface] px-3 text-xs text-[hsl(var(--muted-foreground))] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-[--violet-light]"
          >
            <IconLogout size={14} stroke={2} />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <section className="mb-6">
          <h1 className="text-xl font-extrabold text-white sm:text-2xl">{greeting} 👋</h1>
          <p className="mt-1.5 text-sm leading-7 text-[hsl(var(--muted-foreground))]">
            {orders.length > 0
              ? "پروژه‌هات اینجاست. کانفیگ هر پروژه رو بگیر یا ادامه‌ی چت‌های ناتمام رو باز کن."
              : "هنوز پروژه‌ای نداری. یه گفتگو با طراح محصول شروع کن تا پروژه‌ات ساخته بشه."}
          </p>
        </section>

        {error && (
          <p role="alert" className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        <div role="tablist" aria-label="بخش‌های پنل" className="mb-6 flex gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-1.5">
          {TABS.map(({ key, label, icon: Icon }) => {
            const count = key === "orders" ? orders.length : key === "chats" ? chatSessions.length : 0;
            const active = activeTab === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(key)}
                className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-[--violet-light] sm:gap-2 sm:px-3 sm:text-sm ${
                  active
                    ? "bg-[--violet] text-white shadow-md shadow-[--violet-glow]"
                    : "text-[hsl(var(--muted-foreground))] hover:text-white"
                }`}
              >
                <Icon size={16} stroke={2} />
                <span>{label}</span>
                {count > 0 && (
                  <span className={`rounded-full px-1.5 text-[11px] ${active ? "bg-white/20" : "bg-white/10"}`}>
                    {count.toLocaleString("fa-IR")}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === "orders" && orders.length === 0 && (
          <div className="flex flex-col items-center rounded-3xl border border-dashed border-[hsl(var(--border))] bg-[--surface] px-6 py-16 text-center">
            <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-[--violet-glow] text-violet-300">
              <IconWand size={26} stroke={1.8} />
            </span>
            <h2 className="mb-1 text-base font-bold text-white">اولین پروژه‌ات رو بساز</h2>
            <p className="mb-6 max-w-sm text-sm leading-7 text-[hsl(var(--muted-foreground))]">
              ایده‌ات رو به طراح محصول بگو، با چند سوال کوتاه ساختار پروژه مشخص می‌شه و یک کانفیگ آماده می‌گیری.
            </p>
            <Link
              href="/chat?new=1"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[--violet] px-5 text-sm font-bold text-white shadow-md shadow-[--violet-glow] outline-none transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-[--violet-light]"
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
              className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[hsl(var(--border))] text-sm font-semibold text-[hsl(var(--muted-foreground))] outline-none transition-colors hover:border-[--violet-border] hover:text-white focus-visible:ring-2 focus-visible:ring-[--violet-light]"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[--violet-glow] text-violet-300">
                <IconPlus size={18} stroke={2.5} />
              </span>
              پروژه جدید
            </Link>
          </div>
        )}

        {activeTab === "chats" && (
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[--surface]">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
              <div>
                <h2 className="font-semibold text-white">چت‌های ناتمام</h2>
                <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">گفتگوهایی که به نتیجه نرسیده‌اند را ادامه بده.</p>
              </div>
              <Link
                href="/chat?new=1"
                className="flex min-h-9 items-center gap-1.5 rounded-xl bg-[--violet] px-4 text-xs font-bold text-white shadow-md shadow-[--violet-glow] outline-none transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-[--violet-light]"
              >
                <IconPlus size={13} stroke={2.5} />
                چت جدید
              </Link>
            </div>
            {chatSessions.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <IconMessage size={36} stroke={1.2} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">چت ناتمامی نداری.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[hsl(var(--border))]">
                {chatSessions.map((session) => (
                  <li key={session.id}>
                    <Link
                      href={`/chat?session=${session.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-4 outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.05]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{session.title}</p>
                        <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">آخرین بروزرسانی: {formatDate(session.updated_at)}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-violet-300">
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
            className="space-y-5 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6"
          >
            <div>
              <h2 className="font-semibold text-white">تنظیمات حساب</h2>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">این اطلاعات برای شخصی‌سازی چت استفاده می‌شه.</p>
              {profile?.phone && (
                <p className="mt-3 text-xs text-[hsl(var(--muted-foreground))]">
                  شماره‌ی موبایل: <span dir="ltr" className="text-[hsl(var(--foreground))]">{profile.phone}</span>
                </p>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                { id: "first-name", label: "نام", value: firstName, setter: setFirstName, placeholder: "مثلاً علی", autoComplete: "given-name" },
                { id: "last-name", label: "نام خانوادگی", value: lastName, setter: setLastName, placeholder: "مثلاً رضایی", autoComplete: "family-name" },
              ].map(({ id, label, value, setter, placeholder, autoComplete }) => (
                <div key={id}>
                  <label htmlFor={id} className="mb-2 block text-xs text-[hsl(var(--muted-foreground))]">{label}</label>
                  <input
                    id={id}
                    value={value}
                    onChange={(e) => {
                      setter(e.target.value);
                      setSaved(false);
                    }}
                    placeholder={placeholder}
                    autoComplete={autoComplete}
                    className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm text-white outline-none placeholder-[hsl(var(--muted-foreground))] transition-colors focus:border-[--violet-border] focus-visible:ring-2 focus-visible:ring-[--violet-light]"
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label htmlFor="business-type" className="mb-2 block text-xs text-[hsl(var(--muted-foreground))]">نوع فعالیت</label>
                <select
                  id="business-type"
                  value={businessType}
                  onChange={(e) => {
                    setBusinessType(e.target.value);
                    setSaved(false);
                  }}
                  className="min-h-11 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm text-white outline-none transition-colors focus:border-[--violet-border] focus-visible:ring-2 focus-visible:ring-[--violet-light]"
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
                className="flex min-h-11 items-center gap-2 rounded-xl bg-[--violet] px-6 text-sm font-bold text-white shadow-md shadow-[--violet-glow] outline-none transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-[--violet-light] disabled:opacity-50"
              >
                {savingProfile ? "در حال ذخیره..." : "ذخیره تنظیمات"}
              </button>
              {saved && (
                <span role="status" className="inline-flex items-center gap-1 text-sm text-emerald-400">
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
