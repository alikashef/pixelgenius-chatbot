"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchCustomerProfile, fetchMyOrders, updateCustomerProfile, CustomerProfile, Order } from "@/lib/api";

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
  paid: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-red-500/10 text-red-400",
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

export default function PanelPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [activeTab, setActiveTab] = useState<"orders" | "chats" | "account">("orders");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (!token) {
      router.replace("/login?redirect=/panel");
      return;
    }
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

  function startNewChat() {
    router.push("/chat?new=1");
  }

  function continueChat(sessionId: string) {
    router.push(`/chat?session=${sessionId}`);
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
        setError(err instanceof Error ? err.message : "خطا در ذخیره تنظیمات حساب");
      }
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8fcfa_0%,#f1f7f4_100%)] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fcfa_0%,#f1f7f4_100%)]">
      <header className="border-b border-border bg-white/90 backdrop-blur px-6 py-4 flex items-center justify-between">
        <h1 className="font-bold text-slate-900">
          {profile?.first_name ? `${profile.first_name} جان` : "پنل کاربری"}
        </h1>
        <div className="flex items-center gap-4">
          <button
            onClick={startNewChat}
            className="text-emerald-700 text-sm hover:text-emerald-800 transition-colors"
          >
            + درخواست جدید
          </button>
          <button onClick={logout} className="text-slate-500 hover:text-slate-800 text-sm transition-colors">
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {error && <p className="text-red-400 text-center mb-6">{error}</p>}

        <div className="flex gap-2 border-b border-border">
          {[
            ["orders", "درخواست‌ها"],
            ["chats", "چت‌های ناتمام"],
            ["account", "تنظیمات حساب"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as "orders" | "chats" | "account")}
              className={`px-4 py-3 text-sm transition-colors ${
                activeTab === key ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "account" && (
          <div className="bg-white border border-border rounded-xl p-5 space-y-5">
            <div>
              <p className="text-slate-900 font-semibold">تنظیمات حساب کاربری</p>
              <p className="text-slate-500 text-sm mt-1">این اطلاعات برای شخصی‌سازی چت و شناخت بهتر نوع فعالیت شما استفاده می‌شود.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-slate-500 text-xs mb-2">نام</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="مثلاً علی"
                  className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-2">نام خانوادگی</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="مثلاً رضایی"
                  className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-600 transition-colors"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-500 text-xs mb-2">نوع فعالیت</label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-600 transition-colors"
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
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-xl px-6 py-3 text-sm transition-colors"
            >
              {savingProfile ? "در حال ذخیره..." : "ذخیره تنظیمات"}
            </button>
          </div>
        )}

        {activeTab === "chats" && (
          <div className="bg-white border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <p className="text-slate-900 font-semibold">چت‌های نیمه‌کاره</p>
              <button
                onClick={startNewChat}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-4 py-2 text-xs transition-colors"
              >
                چت جدید
              </button>
            </div>
            {chatSessions.length === 0 ? (
              <p className="text-slate-500 text-sm px-5 py-8">فعلاً چت ناتمامی ندارید.</p>
            ) : (
              <div className="divide-y divide-border">
                {chatSessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => continueChat(session.id)}
                    className="w-full text-right px-5 py-4 hover:bg-[#f7fbf9] transition-colors"
                  >
                    <p className="text-slate-900 font-medium truncate">{session.title}</p>
                    <p className="text-slate-500 text-xs mt-1">
                      آخرین بروزرسانی: {formatDate(session.updated_at)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "orders" && orders.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-500 mb-4">هنوز درخواستی ثبت نکردید</p>
            <button
              onClick={startNewChat}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-6 py-3 text-sm transition-colors"
            >
              شروع مشاوره
            </button>
          </div>
        ) : activeTab === "orders" ? (
          <>
            <div className="bg-white border border-border rounded-xl px-5 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-slate-900 font-semibold">درخواست‌های گذشته</p>
                <p className="text-slate-500 text-sm mt-1">
                  {orders.length.toLocaleString("fa-IR")} درخواست ثبت‌شده برای این حساب
                </p>
              </div>
              <button
                onClick={startNewChat}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl px-5 py-3 text-sm transition-colors"
              >
                ثبت درخواست جدید
              </button>
            </div>

            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-4 border-b border-border px-5 py-3 text-slate-500 text-xs">
                <span>پروژه</span>
                <span>تاریخ ثبت</span>
                <span>مبلغ</span>
                <span>وضعیت</span>
                <span />
              </div>

              <div className="divide-y divide-border">
                {orders.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => router.push(`/panel/${order.id}`)}
                    className="w-full grid gap-4 px-5 py-5 text-right transition-colors hover:bg-[#f7fbf9]/40 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] md:items-center"
                  >
                    <div className="min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{order.project_name}</h3>
                      <p className="text-slate-500 text-sm mt-1 line-clamp-2 md:hidden">{order.summary}</p>
                    </div>

                    <div>
                      <p className="text-slate-500 text-xs md:hidden">تاریخ ثبت</p>
                      <p className="text-slate-700 text-sm mt-1 md:mt-0">{formatDate(order.created_at)}</p>
                    </div>

                    <div>
                      <p className="text-slate-500 text-xs md:hidden">مبلغ</p>
                      <p className="text-slate-700 text-sm mt-1 md:mt-0">
                        {formatMoney(order.final_price) || order.price_label}
                      </p>
                      {order.payment_amount && (
                        <p className="text-emerald-700 text-xs mt-1">
                          پیش‌پرداخت: {formatMoney(order.payment_amount)}
                        </p>
                      )}
                    </div>

                    <div>
                      <p className="text-slate-500 text-xs mb-2 md:hidden">وضعیت</p>
                      <span className={`inline-flex text-xs px-3 py-1 rounded-full font-medium ${STATUS_CLASS[order.status]}`}>
                        {STATUS_LABEL[order.status]}
                      </span>
                    </div>

                    <span className="text-emerald-700 text-sm font-medium">جزئیات</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}
