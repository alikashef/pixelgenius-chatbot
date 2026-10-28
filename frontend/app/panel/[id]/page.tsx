"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ProjectWorkspace from "@/components/ProjectWorkspace";
import { IconWand, IconCoin, IconCheck, IconDownload, IconChevronRight, IconCalendar, IconClock, IconStack2, IconMessage } from "@tabler/icons-react";
import { fetchMyOrder, requestPayment, Order, uploadCustomerOrderFile } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی ادمین",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت شما",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-warning/10 text-warning border-warning/20",
  approved: "bg-info/10 text-info border-info/20",
  awaiting_payment: "bg-pending/10 text-pending border-pending/20",
  paid: "bg-brand-soft text-brand border-brand-line",
  cancelled: "bg-danger/10 text-danger border-danger/20",
};

const SALES_ONLY_FEATURE = /^(بودجه|تناسب بودجه|احتمال موفقیت|سطح ریسک|این پروژه نیاز به بررسی)/;

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem("customer_token");
    if (!token) { router.replace("/login?redirect=/account"); return; }
    fetchMyOrder(token, id)
      .then(setOrder)
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("customer_token");
          router.replace("/login?redirect=/account");
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handlePay() {
    if (!order) return;
    setPaying(true);
    setError("");
    try {
      const token = localStorage.getItem("customer_token")!;
      const callbackUrl = `${window.location.origin}/payment/verify`;
      const { payment_url } = await requestPayment(token, order.id, callbackUrl);
      window.location.href = payment_url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در پرداخت");
      setPaying(false);
    }
  }

  async function handleFileUpload(file?: File) {
    if (!order || !file) return;
    setUploading(true);
    setError("");
    try {
      const token = localStorage.getItem("customer_token")!;
      setOrder(await uploadCustomerOrderFile(token, order.id, file));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در آپلود فایل");
    } finally {
      setUploading(false);
    }
  }

  const isDesigner = order?.mode === "designer";

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{error || "سفارش یافت نشد"}</p>
      </div>
    );
  }

  if (isDesigner) return <ProjectWorkspace key={order.id} order={order} />;

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 px-4 sm:px-6">
        <Link
          href="/account?tab=orders"
          className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconChevronRight size={16} stroke={2.5} aria-hidden="true" />
          سفارش‌ها
        </Link>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <p className="min-w-0 truncate text-sm font-bold text-foreground">{order.project_name}</p>
        <ThemeToggle className="mr-auto" />
      </header>

      <main className="mx-auto max-w-3xl space-y-5 px-4 py-8">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand">
              {isDesigner ? <IconWand size={13} stroke={2.2} /> : <IconCoin size={13} stroke={2.2} />}
              {isDesigner ? "طراحی محصول" : "مشاوره فروش"}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <IconCalendar size={13} stroke={2} />
              {new Date(order.created_at).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" })}
            </span>
          </div>
          <h1 className="mt-3 text-xl font-extrabold leading-9 text-foreground sm:text-2xl">{order.project_name}</h1>
        </section>

        {isDesigner ? (
          <section className="rounded-2xl border border-brand-line bg-surface p-5 shadow-glow">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <IconCheck size={20} stroke={2.5} />
              </span>
              <div className="min-w-0">
                <h2 className="font-bold text-foreground">کانفیگ پروژه آماده‌ست</h2>
                <p className="mt-1 text-sm leading-7 text-muted-foreground">
                  فایل کانفیگ همه‌ی تصمیم‌های طراحی، صفحه‌ها، مدل داده و استک رو داره. دانلودش کن و با آموزش گام‌به‌گام به هوش مصنوعی بده تا بسازه و منتشر کنه.
                </p>
              </div>
            </div>
            <Link
              href={`/chat?brief=${order.id}`}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconDownload size={18} stroke={2.2} />
              دریافت کانفیگ و آموزش ساخت
            </Link>
          </section>
        ) : (
          <div className={`rounded-2xl border px-5 py-4 ${STATUS_CLASS[order.status]}`}>
            <p className="font-semibold">{STATUS_LABEL[order.status]}</p>
            {order.status === "pending_review" && (
              <p className="mt-1 text-sm opacity-80">تیم ما درخواست شما رو بررسی می‌کنه و به‌زودی باهاتون تماس می‌گیره</p>
            )}
            {order.status === "awaiting_payment" && order.admin_note && (
              <p className="mt-1 text-sm opacity-80">{order.admin_note}</p>
            )}
          </div>
        )}

        <section className="space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
          <div>
            <h2 className="mb-2 text-xs font-semibold text-muted-foreground">خلاصه پروژه</h2>
            <p className="whitespace-pre-line text-sm leading-7 text-secondary-foreground">
              {isDesigner ? order.summary.replace("خلاصه ادمین:", "جزئیات طراحی:") : order.summary}
            </p>
          </div>

          {(isDesigner ? order.features.filter((f) => !SALES_ONLY_FEATURE.test(f)) : order.features).length > 0 && (
            <div>
              <h2 className="mb-3 text-xs font-semibold text-muted-foreground">امکانات و نکات</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(isDesigner ? order.features.filter((f) => !SALES_ONLY_FEATURE.test(f)) : order.features).map((f, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 text-secondary-foreground"
                  >
                    <CheckIcon />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconStack2 size={14} stroke={2} />
                استک پیشنهادی
              </dt>
              <dd className="mt-1.5 text-sm leading-6 text-foreground" dir="auto">{order.tech_stack}</dd>
            </div>
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconClock size={14} stroke={2} />
                {isDesigner ? "زمان تقریبی ساخت" : "مدت تحویل"}
              </dt>
              <dd className="mt-1.5 text-sm text-foreground">{order.delivery_days.toLocaleString("fa-IR")} روز</dd>
            </div>
            {!isDesigner && (
              <div className="rounded-xl border border-border bg-background px-4 py-3 sm:col-span-2">
                <dt className="text-xs text-muted-foreground">تخمین اولیه قیمت</dt>
                <dd className="mt-1.5 text-sm text-foreground">{order.price_label}</dd>
              </div>
            )}
          </dl>
        </section>

        {(order.milestones || []).length > 0 && (
          <section className="space-y-3 rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card">
            <h2 className="font-semibold text-foreground">مراحل پروژه</h2>
            <ul className="space-y-2">
              {order.milestones.map((m, i) => (
                <li
                  key={m.id || i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${m.status === "paid" ? "bg-success" : "bg-pending"}`} />
                    <span className="truncate text-sm text-foreground">{m.title}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm text-muted-foreground">{m.amount.toLocaleString("fa-IR")} ریال</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${m.status === "paid" ? "bg-success/10 text-success" : "bg-pending/10 text-pending"}`}>
                      {m.status === "paid" ? "پرداخت شده" : "در انتظار"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="group rounded-2xl border border-border bg-surface shadow-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <IconMessage size={16} stroke={2} className="text-brand" />
              تاریخچه گفتگو
              <span className="text-xs font-normal text-muted-foreground">
                ({(order.chat_history || []).length.toLocaleString("fa-IR")} پیام)
              </span>
            </span>
            <span className="text-xs text-muted-foreground group-open:hidden">نمایش</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">بستن</span>
          </summary>
          <div className="space-y-3 border-t border-border px-5 py-4">
            {(order.chat_history || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                برای این پروژه هنوز تاریخچه‌ای ثبت نشده (احتمالاً قبل از فعال شدن این قابلیت ساخته شده).
              </p>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {(order.chat_history || []).map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-xl px-4 py-3 text-sm leading-7 ${
                      message.role === "user"
                        ? "border border-brand-line bg-brand-soft text-foreground"
                        : "border border-border bg-background text-secondary-foreground"
                    }`}
                  >
                    <p className="mb-1 text-xs opacity-70">{message.role === "user" ? "شما" : isDesigner ? "طراح محصول" : "مشاور هوشمند"}</p>
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>

        <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-foreground">فایل‌های پروژه</p>
            <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
              {uploading ? "در حال آپلود..." : "افزودن فایل"}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
          </div>
          {(order.order_files || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">هنوز فایلی برای این پروژه ثبت نشده.</p>
          ) : (
            <div className="space-y-2">
              {(order.order_files || []).map((file) => (
                <a key={file.id} href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-colors hover:border-brand-line">
                  <span className="truncate">{file.name}</span>
                  <span className="mr-3 shrink-0 text-xs text-muted-foreground">{file.uploaded_by === "admin" ? "ادمین" : "شما"}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Proposal PDF */}
        {order.proposal_file && (
          <a
            href={`${API_URL}${order.proposal_file}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-surface border border-border hover:border-brand-line rounded-xl p-4 transition-colors"
          >
            <div className="w-10 h-10 bg-brand-soft rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-foreground text-sm font-medium">پروپوزال کامل پروژه</p>
              <p className="text-muted-foreground text-xs">کلیک کنید برای دانلود / مشاهده</p>
            </div>
          </a>
        )}

        {/* Payment Section */}
        {order.status === "awaiting_payment" && order.payment_amount && (
          <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
            <p className="text-muted-foreground text-xs">جزئیات پرداخت</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background border border-border rounded-xl p-4 text-center">
                <p className="text-muted-foreground text-xs mb-1">قیمت نهایی پروژه</p>
                <p className="text-foreground font-bold">{order.final_price?.toLocaleString("fa-IR")} ریال</p>
              </div>
              <div className="bg-background border border-border rounded-xl p-4 text-center">
                <p className="text-muted-foreground text-xs mb-1">درصد پیش‌پرداخت</p>
                <p className="text-foreground font-bold">{order.payment_percentage}٪</p>
              </div>
            </div>
            <div className="bg-brand-soft border border-brand-line rounded-xl p-4 flex items-center justify-between">
              <p className="text-secondary-foreground text-sm">مبلغ قابل پرداخت</p>
              <p className="text-brand font-bold text-lg">{order.payment_amount.toLocaleString("fa-IR")} ریال</p>
            </div>
            {error && <p className="text-danger text-sm text-center">{error}</p>}
            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full bg-primary hover:bg-primary-hover disabled:opacity-60 text-primary-foreground font-bold rounded-xl py-4 text-sm transition-colors"
            >
              {paying ? "در حال انتقال به درگاه..." : "پرداخت آنلاین"}
            </button>
            <p className="text-center text-muted-foreground text-xs">پرداخت از طریق درگاه امن زرین‌پال</p>
          </div>
        )}

        {order.status === "paid" && order.paid_at && (
          <div className="bg-brand-soft border border-brand-line rounded-xl p-5 text-center">
            <p className="text-brand font-semibold mb-1">پرداخت با موفقیت انجام شد</p>
            <p className="text-muted-foreground text-xs">
              {new Date(order.paid_at).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
