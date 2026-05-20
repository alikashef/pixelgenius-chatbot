"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchMyOrder, requestPayment, Order, uploadCustomerOrderFile } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی ادمین",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت شما",
  paid: "پرداخت شده ✓",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  approved: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  awaiting_payment: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  paid: "bg-[--violet-glow] text-violet-300 border-[--violet-border]",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/20",
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-violet-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
    if (!token) { router.replace("/login?redirect=/panel"); return; }
    fetchMyOrder(token, id)
      .then(setOrder)
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("customer_token");
          router.replace("/login?redirect=/panel");
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[--violet] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] flex items-center justify-center">
        <p className="text-[hsl(var(--muted-foreground))]">{error || "سفارش یافت نشد"}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 backdrop-blur px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push("/panel")}
          className="text-[hsl(var(--muted-foreground))] hover:text-white transition-colors"
        >
          ← برگشت
        </button>
        <h1 className="font-bold text-white">{order.project_name}</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Status */}
        <div className={`border rounded-xl px-5 py-4 ${STATUS_CLASS[order.status]}`}>
          <p className="font-semibold">{STATUS_LABEL[order.status]}</p>
          {order.status === "pending_review" && (
            <p className="text-sm mt-1 opacity-80">تیم ما درخواست شما رو بررسی می‌کنه و به‌زودی باهاتون تماس می‌گیره</p>
          )}
          {order.status === "awaiting_payment" && order.admin_note && (
            <p className="text-sm mt-1 opacity-80">{order.admin_note}</p>
          )}
        </div>

        {/* Proposal Details */}
        <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-5">
          <div>
            <p className="text-[hsl(var(--muted-foreground))] text-xs mb-2">خلاصه پروژه</p>
            <p className="text-[hsl(var(--secondary-foreground))] text-sm leading-relaxed">{order.summary}</p>
          </div>

          <div>
            <p className="text-[hsl(var(--muted-foreground))] text-xs mb-3">امکانات</p>
            <ul className="space-y-2">
              {order.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[hsl(var(--secondary-foreground))]">
                  <CheckIcon />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">تکنولوژی</p>
              <p className="text-[hsl(var(--secondary-foreground))] text-sm">{order.tech_stack}</p>
            </div>
            <div>
              <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">مدت تحویل</p>
              <p className="text-[hsl(var(--secondary-foreground))] text-sm">{order.delivery_days} روز</p>
            </div>
          </div>

          <div>
            <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">تخمین اولیه قیمت</p>
            <p className="text-[hsl(var(--secondary-foreground))] text-sm">{order.price_label}</p>
          </div>
        </div>

        <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4">
          <p className="text-[hsl(var(--muted-foreground))] text-xs">تاریخچه مکالمه همین پروژه</p>
          {(order.chat_history || []).length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              برای این پروژه هنوز تاریخچه‌ای ثبت نشده (احتمالاً قبل از فعال شدن این قابلیت ساخته شده).
            </p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {(order.chat_history || []).map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === "user"
                      ? "bg-[--violet-glow] border border-[--violet-border] text-white"
                      : "bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-[hsl(var(--secondary-foreground))]"
                  }`}
                >
                  <p className="text-xs mb-1 opacity-70">{message.role === "user" ? "شما" : "مشاور هوشمند"}</p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-white">فایل‌های پروژه</p>
            <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-[--violet] px-4 py-2 text-xs font-bold text-white">
              {uploading ? "در حال آپلود..." : "افزودن فایل"}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
          </div>
          {(order.order_files || []).length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">هنوز فایلی برای این پروژه ثبت نشده.</p>
          ) : (
            <div className="space-y-2">
              {(order.order_files || []).map((file) => (
                <a key={file.id} href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-white transition-colors hover:border-[--violet-border]">
                  <span className="truncate">{file.name}</span>
                  <span className="mr-3 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{file.uploaded_by === "admin" ? "ادمین" : "شما"}</span>
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
            className="flex items-center gap-3 bg-[--surface] border border-[hsl(var(--border))] hover:border-[--violet-border] rounded-xl p-4 transition-colors"
          >
            <div className="w-10 h-10 bg-[--violet-glow] rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-medium">پروپوزال کامل پروژه</p>
              <p className="text-[hsl(var(--muted-foreground))] text-xs">کلیک کنید برای دانلود / مشاهده</p>
            </div>
          </a>
        )}

        {/* Payment Section */}
        {order.status === "awaiting_payment" && order.payment_amount && (
          <div className="bg-[--surface] border border-[hsl(var(--border))] rounded-2xl p-6 space-y-4">
            <p className="text-[hsl(var(--muted-foreground))] text-xs">جزئیات پرداخت</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
                <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">قیمت نهایی پروژه</p>
                <p className="text-white font-bold">{order.final_price?.toLocaleString("fa-IR")} ریال</p>
              </div>
              <div className="bg-[hsl(var(--background))] border border-[hsl(var(--border))] rounded-xl p-4 text-center">
                <p className="text-[hsl(var(--muted-foreground))] text-xs mb-1">درصد پیش‌پرداخت</p>
                <p className="text-white font-bold">{order.payment_percentage}٪</p>
              </div>
            </div>
            <div className="bg-[--violet-glow] border border-[--violet-border] rounded-xl p-4 flex items-center justify-between">
              <p className="text-[hsl(var(--secondary-foreground))] text-sm">مبلغ قابل پرداخت</p>
              <p className="text-violet-300 font-bold text-lg">{order.payment_amount.toLocaleString("fa-IR")} ریال</p>
            </div>
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              onClick={handlePay}
              disabled={paying}
              className="w-full bg-[--violet] hover:bg-violet-700 disabled:opacity-60 text-white font-bold rounded-xl py-4 text-sm transition-colors"
            >
              {paying ? "در حال انتقال به درگاه..." : "پرداخت آنلاین"}
            </button>
            <p className="text-center text-[hsl(var(--muted-foreground))] text-xs">پرداخت از طریق درگاه امن زرین‌پال</p>
          </div>
        )}

        {order.status === "paid" && order.paid_at && (
          <div className="bg-[--violet-glow] border border-[--violet-border] rounded-xl p-5 text-center">
            <p className="text-violet-300 font-semibold mb-1">پرداخت با موفقیت انجام شد</p>
            <p className="text-[hsl(var(--muted-foreground))] text-xs">
              {new Date(order.paid_at).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
