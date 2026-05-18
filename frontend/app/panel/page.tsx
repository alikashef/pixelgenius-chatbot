"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconPlus, IconSparkles, IconLogout, IconClipboardList, IconMessage, IconSettings } from "@tabler/icons-react";
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
  { key: "orders", label: "درخواست‌ها", icon: IconClipboardList },
  { key: "chats", label: "چت‌های ناتمام", icon: IconMessage },
  { key: "account", label: "تنظیمات حساب", icon: IconSettings },
] as const;

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
    setError("");
    try {
      const updated = await updateCustomerProfile(token, {
        first_name: firstName || null,
        last_name: lastName || null,
        business_type: businessType || null,
      });
      setProfile(updated);
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

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      {/* header */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/80 px-5 py-3.5 backdrop-blur-xl">
        <Link href="/" className="flex items-center gap-2 font-black text-white">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[--violet] shadow-md shadow-[--violet-glow]">
            <IconSparkles size={16} stroke={2.2} />
          </span>
          <span className="hidden text-sm sm:inline">FreelioAI</span>
        </Link>

        <div className="h-4 w-px bg-[hsl(var(--border))]" />

        <p className="text-sm font-semibold text-white">
          {profile?.first_name ? `${profile.first_name} جان` : "پنل کاربری"}
        </p>

        <div className="mr-auto flex items-center gap-2">
          <button
            onClick={() => router.push("/chat?new=1")}
            className="flex items-center gap-1.5 rounded-lg border border-[--violet-border] bg-[--violet-glow] px-3 py-1.5 text-xs font-semibold text-violet-300 transition-colors hover:text-white"
          >
            <IconPlus size={13} stroke={2.5} />
            درخواست جدید
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-1.5 rounded-lg border border-[hsl(var(--border))] bg-[--surface] px-3 py-1.5 text-xs text-[hsl(var(--muted-foreground))] transition-colors hover:text-white"
          >
            <IconLogout size={13} stroke={2} />
            خروج
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {error && (
          <p className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        {/* tabs */}
        <div className="mb-6 flex gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-1.5">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                activeTab === key
                  ? "bg-[--violet] text-white shadow-md shadow-[--violet-glow]"
                  : "text-[hsl(var(--muted-foreground))] hover:text-white"
              }`}
            >
              <Icon size={15} stroke={2} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* orders tab */}
        {activeTab === "orders" && orders.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-[hsl(var(--border))] bg-[--surface] py-20 text-center">
            <IconClipboardList size={40} stroke={1.2} className="mb-4 text-[hsl(var(--muted-foreground))]" />
            <p className="mb-1 font-semibold text-white">هنوز درخواستی ثبت نشده</p>
            <p className="mb-6 text-sm text-[hsl(var(--muted-foreground))]">یه مکالمه با AI شروع کن تا پروپوزال بگیری.</p>
            <button
              onClick={() => router.push("/chat?new=1")}
              className="flex items-center gap-2 rounded-xl bg-[--violet] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-[--violet-glow] transition-all hover:bg-violet-700"
            >
              <IconPlus size={16} stroke={2.5} />
              شروع مشاوره
            </button>
          </div>
        )}

        {activeTab === "orders" && orders.length > 0 && (
          <div className="space-y-4">
            {/* summary bar */}
            <div className="flex items-center justify-between rounded-2xl border border-[hsl(var(--border))] bg-[--surface] px-5 py-4">
              <div>
                <p className="font-semibold text-white">درخواست‌های ثبت‌شده</p>
                <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">
                  {orders.length.toLocaleString("fa-IR")} درخواست برای این حساب
                </p>
              </div>
              <button
                onClick={() => router.push("/chat?new=1")}
                className="flex items-center gap-2 rounded-xl bg-[--violet] px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-[--violet-glow] transition-all hover:bg-violet-700"
              >
                <IconPlus size={15} stroke={2.5} />
                درخواست جدید
              </button>
            </div>

            {/* orders list */}
            <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[--surface]">
              {/* table header */}
              <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-4 border-b border-[hsl(var(--border))] px-5 py-3 text-xs text-[hsl(var(--muted-foreground))] md:grid">
                <span>پروژه</span>
                <span>تاریخ ثبت</span>
                <span>مبلغ</span>
                <span>وضعیت</span>
                <span />
              </div>

              <div className="divide-y divide-[hsl(var(--border))]">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => router.push(`/panel/${order.id}`)}
                    className="grid w-full gap-4 px-5 py-5 text-right transition-colors hover:bg-white/3 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-white">{order.project_name}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))] md:hidden">
                        {order.summary}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] md:hidden">تاریخ ثبت</p>
                      <p className="mt-1 text-sm text-[hsl(var(--foreground))] md:mt-0">{formatDate(order.created_at)}</p>
                    </div>

                    <div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))] md:hidden">مبلغ</p>
                      <p className="mt-1 text-sm text-[hsl(var(--foreground))] md:mt-0">
                        {formatMoney(order.final_price) || order.price_label}
                      </p>
                      {order.payment_amount && (
                        <p className="mt-1 text-xs text-violet-400">
                          پیش‌پرداخت: {formatMoney(order.payment_amount)}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))] md:hidden">وضعیت</p>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[order.status]}`}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>

                    <span className="text-xs font-semibold text-violet-400">جزئیات ←</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* chats tab */}
        {activeTab === "chats" && (
          <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[--surface]">
            <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-5 py-4">
              <p className="font-semibold text-white">چت‌های نیمه‌کاره</p>
              <button
                onClick={() => router.push("/chat?new=1")}
                className="flex items-center gap-1.5 rounded-xl bg-[--violet] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[--violet-glow] transition-all hover:bg-violet-700"
              >
                <IconPlus size={13} stroke={2.5} />
                چت جدید
              </button>
            </div>
            {chatSessions.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <IconMessage size={36} stroke={1.2} className="mx-auto mb-3 text-[hsl(var(--muted-foreground))]" />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">چت ناتمامی وجود ندارد.</p>
              </div>
            ) : (
              <div className="divide-y divide-[hsl(var(--border))]">
                {chatSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => router.push(`/chat?session=${session.id}`)}
                    className="flex w-full items-center justify-between px-5 py-4 text-right transition-colors hover:bg-white/3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-white">{session.title}</p>
                      <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                        آخرین بروزرسانی: {formatDate(session.updated_at)}
                      </p>
                    </div>
                    <span className="mr-4 shrink-0 text-xs font-semibold text-violet-400">ادامه ←</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* account tab */}
        {activeTab === "account" && (
          <div className="space-y-5 rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-6">
            <div>
              <p className="font-semibold text-white">تنظیمات حساب کاربری</p>
              <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
                این اطلاعات برای شخصی‌سازی چت استفاده می‌شود.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {[
                { label: "نام", value: firstName, setter: setFirstName, placeholder: "مثلاً علی" },
                { label: "نام خانوادگی", value: lastName, setter: setLastName, placeholder: "مثلاً رضایی" },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <label className="mb-2 block text-xs text-[hsl(var(--muted-foreground))]">{label}</label>
                  <input
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    placeholder={placeholder}
                    className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-white outline-none placeholder-[hsl(var(--muted-foreground))] transition-colors focus:border-[--violet-border]"
                  />
                </div>
              ))}

              <div className="md:col-span-2">
                <label className="mb-2 block text-xs text-[hsl(var(--muted-foreground))]">نوع فعالیت</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-[--violet-border]"
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

            <button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="flex items-center gap-2 rounded-xl bg-[--violet] px-6 py-3 text-sm font-bold text-white shadow-md shadow-[--violet-glow] transition-all hover:bg-violet-700 disabled:opacity-50"
            >
              {savingProfile ? "در حال ذخیره..." : "ذخیره تنظیمات"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
