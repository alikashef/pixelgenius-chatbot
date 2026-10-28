"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconPlus,
  IconClipboardList,
  IconLayoutGrid,
  IconPlugConnected,
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
import AppShell, { ShellLoading } from "@/components/AppShell";
import McpTour, { isMcpTourDone } from "@/components/McpTour";
import GuidedTour, { startTour } from "@/components/GuidedTour";
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

function StatusPill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold leading-6 ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

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

// Product-design projects (config briefs) and sales orders (priced, paid) are separate workflows.
const TABS = [
  { key: "design", group: "طراحی محصول", label: "پروژه‌های طراحی", icon: IconWand },
  { key: "connect", group: "طراحی محصول", label: "اتصال به هوش مصنوعی", icon: IconPlugConnected },
  { key: "orders", group: "فروش", label: "سفارش‌ها", icon: IconClipboardList },
  { key: "chats", group: "حساب کاربری", label: "گفتگوهای ناتمام", icon: IconMessage },
  { key: "account", group: "حساب کاربری", label: "تنظیمات حساب", icon: IconSettings },
] as const;

function isTabKey(value: string | null): value is TabKey {
  return TABS.some((t) => t.key === value);
}

const EMPTY_STATE: Record<"design" | "orders", { mode: "designer" | "sales"; icon: typeof IconWand; title: string; body: string; cta: string }> = {
  design: {
    mode: "designer",
    icon: IconWand,
    title: "اولین پروژه‌ات رو طراحی کن",
    body: "ایده‌ات رو به طراح محصول بگو، با چند سوال کوتاه ساختار پروژه مشخص می‌شه و یک کانفیگ آماده می‌گیری.",
    cta: "گفتگو با طراح محصول",
  },
  orders: {
    mode: "sales",
    icon: IconCoin,
    title: "هنوز سفارشی ثبت نکردی",
    body: "اگه می‌خوای تیم توسعه پروژه‌ات رو بسازه، با مشاور فروش صحبت کن تا برآورد قیمت و زمان بگیری.",
    cta: "گفتگو با مشاور فروش",
  },
};

function hasPrice(order: Order) {
  const label = (order.price_label || "").trim();
  return Boolean(order.final_price) || (label !== "" && label !== "-");
}

function ProjectCard({ order }: { order: Order }) {
  const isDesigner = order.mode === "designer";
  const Icon = isDesigner ? IconWand : IconCoin;
  return (
    <article className="relative rounded-xl border border-border bg-surface p-5 transition-colors hover:border-foreground/25">
      <div className="flex items-start gap-4">
        <span className="hidden h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-secondary-foreground sm:grid" aria-hidden="true">
          <Icon size={21} stroke={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h3 className="min-w-0 text-base font-bold leading-7 text-foreground">
              <Link
                href={`/panel/${order.id}`}
                className="rounded outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
              >
                {order.project_name}
              </Link>
            </h3>
            {isDesigner ? (
              <StatusPill className="bg-success/10 text-success">کانفیگ آماده</StatusPill>
            ) : (
              <StatusPill className={STATUS_CLASS[order.status]}>{STATUS_LABEL[order.status]}</StatusPill>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-7 text-muted-foreground">{order.summary}</p>

          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <dt className="sr-only">نوع</dt>
              <dd className="font-bold text-secondary-foreground">{isDesigner ? "طراحی محصول" : "مشاوره فروش"}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <IconCalendar size={14} stroke={1.8} aria-hidden="true" />
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
                <dd className="font-bold text-foreground">{formatMoney(order.final_price) || order.price_label}</dd>
              </div>
            )}
          </dl>

          {(isDesigner || order.status === "awaiting_payment") && (
            <div className="relative z-10 mt-4 flex flex-wrap items-center gap-2">
              {isDesigner ? (
                <Link
                  href={`/chat?brief=${order.id}`}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-primary px-3.5 text-[13px] font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <IconDownload size={16} stroke={2} aria-hidden="true" />
                  دریافت کانفیگ
                </Link>
              ) : (
                <Link
                  href={`/panel/${order.id}`}
                  className="inline-flex min-h-9 items-center rounded-lg bg-brand-solid px-3.5 text-[13px] font-bold text-brand-foreground outline-none transition-colors hover:bg-brand-solid/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  پرداخت پیش‌پرداخت
                </Link>
              )}
              <Link
                href={`/panel/${order.id}`}
                className="inline-flex min-h-9 items-center gap-0.5 rounded-lg px-3 text-[13px] font-bold text-secondary-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                {isDesigner ? "فضای پروژه" : "جزئیات"}
                <IconChevronLeft size={15} stroke={2.2} aria-hidden="true" />
              </Link>
            </div>
          )}
        </div>
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
  const [activeTab, setActiveTab] = useState<TabKey>("design");
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
        const requested = new URLSearchParams(window.location.search).get("tab");
        if (isTabKey(requested)) setActiveTab(requested);
        else if (!ordersData.some((o) => o.mode === "designer") && ordersData.length > 0) setActiveTab("orders");
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

  if (loading) return <ShellLoading />;

  const designOrders = orders.filter((o) => o.mode === "designer");
  const tourDone = typeof window !== "undefined" && isMcpTourDone();
  const salesOrders = orders.filter((o) => o.mode !== "designer");
  const listed = activeTab === "design" ? designOrders : activeTab === "orders" ? salesOrders : [];

  function selectTab(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", tab === "design" ? "/panel" : `/panel?tab=${tab}`);
  }

  function startChat(mode: "designer" | "sales") {
    localStorage.setItem("chat_mode", mode);
    router.push("/chat?new=1");
  }

  const SECTION_COPY: Record<TabKey, { title: string; description: string }> = {
    design: {
      title: "پروژه‌های طراحی محصول",
      description: "کانفیگ‌هایی که با طراح محصول ساختی؛ دانلودشون کن یا فضای پروژه رو باز کن.",
    },
    connect: {
      title: "اتصال به هوش مصنوعی",
      description: "یک‌بار Claude، ChatGPT یا Cursor رو به PixelGenius وصل کن تا پروژه‌هات رو خودش بسازه و منتشر کنه.",
    },
    orders: {
      title: "سفارش‌های فروش",
      description: "درخواست‌هایی که برای ساخت توسط تیم توسعه ثبت کردی؛ وضعیت، قیمت و پرداخت‌ها.",
    },
    chats: { title: "گفتگوهای ناتمام", description: "گفتگوهایی که هنوز به پروژه تبدیل نشده‌اند را ادامه بده." },
    account: { title: "تنظیمات حساب", description: "این اطلاعات برای شخصی‌سازی گفتگو استفاده می‌شه." },
  };
  const newProjectLink = (
    <Link
      href="/chat?new=1"
      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <IconPlus size={17} stroke={2.2} aria-hidden="true" />
      پروژه جدید
    </Link>
  );

  return (
    <AppShell
      nav={TABS.flatMap(({ key, group, label, icon }) => [{
        key,
        group,
        label,
        icon,
        active: activeTab === key,
        onSelect: () => selectTab(key),
        count: key === "design" ? designOrders.length : key === "orders" ? salesOrders.length : key === "chats" ? chatSessions.length : undefined,
      }, ...(key === "connect" ? [{ key: "templates", group, label: "سایت‌های آماده", icon: IconLayoutGrid, comingSoon: true }] : [])])}
      primaryAction={newProjectLink}
      user={{ name: [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "کاربر", detail: profile?.phone }}
      onLogout={logout}
      onHelp={() => startTour("panel")}
      title={SECTION_COPY[activeTab].title}
      description={SECTION_COPY[activeTab].description}
    >
      <GuidedTour tour="panel" />
      {error && (
        <p role="alert" className="mb-6 rounded-lg border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          {error}
        </p>
      )}

      {(activeTab === "design" || activeTab === "orders") && listed.length === 0 && (() => {
        const empty = EMPTY_STATE[activeTab];
        return (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-input px-6 py-16 text-center">
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand">
              <empty.icon size={24} stroke={1.8} aria-hidden="true" />
            </span>
            <h2 className="mb-1 text-base font-bold text-foreground">{empty.title}</h2>
            <p className="mb-6 max-w-sm text-sm leading-7 text-muted-foreground">{empty.body}</p>
            <Button onClick={() => startChat(empty.mode)} className="min-h-11">
              <IconPlus size={16} stroke={2.2} aria-hidden="true" />
              {empty.cta}
            </Button>
          </div>
        );
      })()}

      {activeTab === "connect" && <McpTour designOrders={designOrders} />}

      {activeTab === "design" && designOrders.length > 0 && !tourDone && (
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-brand-line bg-brand-soft p-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-solid text-brand-foreground" aria-hidden="true">
            <IconPlugConnected size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-foreground">پروژه‌ات رو خودکار بساز و منتشر کن</p>
            <p className="mt-0.5 text-xs leading-6 text-secondary-foreground">ابزار هوش مصنوعی‌ات رو با یک راهنمای ۳ دقیقه‌ای به PixelGenius وصل کن.</p>
          </div>
          <Button size="sm" onClick={() => selectTab("connect")}>شروع راهنما</Button>
        </div>
      )}

      {(activeTab === "design" || activeTab === "orders") && listed.length > 0 && (
        <div className="space-y-3">
          {listed.map((order) => (
            <ProjectCard key={order.id} order={order} />
          ))}
        </div>
      )}

      {activeTab === "chats" && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {chatSessions.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <IconMessage size={32} stroke={1.4} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">گفتگوی ناتمامی نداری.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {chatSessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/chat?session=${session.id}`}
                    className="flex items-center gap-4 px-5 py-4 outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/5"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground" aria-hidden="true">
                      <IconMessage size={18} stroke={1.8} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-foreground">{session.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">آخرین بروزرسانی: {formatDate(session.updated_at)}</p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-bold text-secondary-foreground">
                      ادامه
                      <IconChevronLeft size={15} stroke={2.2} aria-hidden="true" />
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
          className="max-w-xl space-y-5 rounded-xl border border-border bg-surface p-6"
        >
          {profile?.phone && (
            <div>
              <p className="field-label">شماره موبایل</p>
              <p dir="ltr" className="text-right text-sm font-bold text-foreground">{profile.phone}</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { id: "first-name", label: "نام", value: firstName, setter: setFirstName, placeholder: "مثلاً علی", autoComplete: "given-name" },
              { id: "last-name", label: "نام خانوادگی", value: lastName, setter: setLastName, placeholder: "مثلاً رضایی", autoComplete: "family-name" },
            ].map(({ id, label, value, setter, placeholder, autoComplete }) => (
              <div key={id}>
                <label htmlFor={id} className="field-label">{label}</label>
                <input
                  id={id}
                  value={value}
                  onChange={(e) => {
                    setter(e.target.value);
                    setSaved(false);
                  }}
                  placeholder={placeholder}
                  autoComplete={autoComplete}
                  className="field min-h-11"
                />
              </div>
            ))}

            <div className="sm:col-span-2">
              <label htmlFor="business-type" className="field-label">نوع فعالیت</label>
              <select
                id="business-type"
                value={businessType}
                onChange={(e) => {
                  setBusinessType(e.target.value);
                  setSaved(false);
                }}
                className="field min-h-11"
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

          <div className="flex items-center gap-3 border-t border-border pt-5">
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "در حال ذخیره..." : "ذخیره تغییرات"}
            </Button>
            {saved && (
              <span role="status" className="inline-flex items-center gap-1 text-sm font-bold text-success">
                <IconCheck size={16} stroke={2.5} aria-hidden="true" />
                ذخیره شد
              </span>
            )}
          </div>
        </form>
      )}
    </AppShell>
  );
}
