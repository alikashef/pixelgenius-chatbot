"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProjectWorkspace from "@/components/ProjectWorkspace";
import { IconCheck, IconCircleCheck, IconClock, IconFileDescription, IconLock, IconMessage, IconPaperclip, IconStack2, IconUpload } from "@tabler/icons-react";
import { fetchMyOrder, requestPayment, Order, uploadCustomerOrderFile } from "@/lib/api";
import AppShell, { NewProjectLink, ShellLoading, useAccountNav } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { customerSummary, OrderStatusPill, OrderSteps, toman } from "@/components/SalesOrders";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

// Internal scoring lines the sales assistant adds for the team, not for the customer.
const INTERNAL_FEATURE = /^(احتمال موفقیت|سطح ریسک|این پروژه نیاز به بررسی)/;

const card = "rounded-xl border border-border bg-surface";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const nav = useAccountNav({ active: "orders" });

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

  if (loading) return <ShellLoading />;

  if (!order) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">{error || "سفارش یافت نشد"}</p>
      </div>
    );
  }

  if (isDesigner) return <ProjectWorkspace key={order.id} order={order} />;

  const features = order.features.filter((f) => !INTERNAL_FEATURE.test(f));
  const milestones = order.milestones || [];
  const milestoneTotal = milestones.reduce((sum, m) => sum + (m.amount || 0), 0);
  const files = order.order_files || [];
  const chat = order.chat_history || [];
  const due = order.status === "awaiting_payment" && order.payment_amount;

  return (
    <AppShell
      nav={nav}
      backHref="/account?tab=orders"
      primaryAction={<NewProjectLink />}
      width="wide"
      title={order.project_name}
      description={`ثبت‌شده در ${new Date(order.created_at).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" })}`}
      actions={<OrderStatusPill status={order.status} />}
    >
      <OrderSteps status={order.status} />

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          <section aria-labelledby="request-title" className={`${card} p-5`}>
            <h2 id="request-title" className="eyebrow mb-2">درخواست تو</h2>
            <p className="whitespace-pre-line text-sm leading-7 text-foreground">{customerSummary(order.summary)}</p>
            {features.length > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-6 text-secondary-foreground">
                    <IconCheck size={16} stroke={2.4} className="mt-1 shrink-0 text-brand" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {milestones.length > 0 && (
            <section aria-labelledby="milestones-title" className={`${card} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <h2 id="milestones-title" className="text-sm font-bold text-foreground">مراحل و پرداخت‌ها</h2>
                <span className="text-xs text-muted-foreground">{milestones.filter((m) => m.status === "paid").length.toLocaleString("fa-IR")} از {milestones.length.toLocaleString("fa-IR")} پرداخت شده</span>
              </div>
              <ol className="divide-y divide-border">
                {milestones.map((m, i) => (
                  <li key={m.id || i} className="flex items-center gap-3 px-5 py-3.5">
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${m.status === "paid" ? "bg-success/10 text-success" : "bg-surface-2 text-muted-foreground"}`}>
                      {m.status === "paid" ? <IconCheck size={14} stroke={2.6} aria-hidden="true" /> : (i + 1).toLocaleString("fa-IR")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{m.title}</span>
                    <span className="shrink-0 text-sm font-bold text-foreground">{toman(m.amount)}</span>
                    <span className={`hidden shrink-0 rounded-full px-2 text-[11px] font-bold leading-5 sm:inline ${m.status === "paid" ? "bg-success/10 text-success" : "bg-foreground/[0.06] text-muted-foreground"}`}>
                      {m.status === "paid" ? "پرداخت شده" : "در انتظار"}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between border-t border-border bg-surface-2/60 px-5 py-3 text-sm">
                <span className="text-muted-foreground">جمع کل</span>
                <span className="font-bold text-foreground">{toman(milestoneTotal)}</span>
              </div>
            </section>
          )}

          <section aria-labelledby="files-title" className={`${card} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <h2 id="files-title" className="text-sm font-bold text-foreground">فایل‌ها و مستندات</h2>
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                <IconUpload size={15} aria-hidden="true" />
                {uploading ? "در حال آپلود…" : "افزودن فایل"}
              </Button>
              <input ref={fileRef} type="file" className="hidden" aria-label="انتخاب فایل" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
            </div>
            {files.length === 0 && !order.proposal_file ? (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">فایل‌هایی مثل لوگو، محتوا یا نمونه‌ی سایت‌های دلخواهت رو این‌جا بذار.</p>
            ) : (
              <ul className="divide-y divide-border">
                {order.proposal_file && (
                  <li>
                    <a href={`${API_URL}${order.proposal_file}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-3 text-sm outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/5">
                      <IconFileDescription size={18} className="shrink-0 text-brand" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate font-bold text-foreground">پروپوزال رسمی پروژه</span>
                      <span className="text-xs text-muted-foreground">از تیم</span>
                    </a>
                  </li>
                )}
                {files.map((file) => (
                  <li key={file.id}>
                    <a href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-5 py-3 text-sm outline-none transition-colors hover:bg-foreground/[0.03] focus-visible:bg-foreground/5">
                      <IconPaperclip size={17} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-foreground" dir="auto">{file.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{file.uploaded_by === "admin" ? "از تیم" : "از تو"}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className={`group ${card}`}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3.5 outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                <IconMessage size={16} className="text-muted-foreground" aria-hidden="true" />
                گفتگوی ثبت درخواست
                <span className="text-xs font-normal text-muted-foreground">{chat.length.toLocaleString("fa-IR")} پیام</span>
              </span>
              <span className="text-xs text-muted-foreground group-open:hidden">نمایش</span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">بستن</span>
            </summary>
            <div className="max-h-96 space-y-3 overflow-y-auto border-t border-border px-5 py-4">
              {chat.length === 0 ? (
                <p className="text-sm text-muted-foreground">برای این سفارش گفتگویی ذخیره نشده.</p>
              ) : (
                chat.map((message, index) => (
                  <div key={index} className={message.role === "user" ? "mr-auto max-w-[85%] rounded-2xl rounded-tl-md bg-surface-2 px-4 py-2.5" : "max-w-[90%]"}>
                    <p className="mb-0.5 text-[11px] font-bold text-muted-foreground">{message.role === "user" ? "تو" : "مشاور هوشمند"}</p>
                    <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{message.content}</p>
                  </div>
                ))
              )}
            </div>
          </details>
        </div>

        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-6">
          <section aria-labelledby="pay-title" className={`${card} p-5`}>
            <h2 id="pay-title" className="eyebrow mb-3">پرداخت</h2>
            {order.status === "paid" ? (
              <div className="flex items-start gap-3">
                <IconCircleCheck size={22} className="shrink-0 text-success" aria-hidden="true" />
                <div>
                  <p className="font-bold text-foreground">پیش‌پرداخت انجام شد</p>
                  <p className="mt-0.5 text-sm text-secondary-foreground">{toman(order.payment_amount)}</p>
                  {order.paid_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(order.paid_at).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  )}
                </div>
              </div>
            ) : due ? (
              <>
                <p className="text-xs text-muted-foreground">مبلغ پیش‌پرداخت</p>
                <p className="mt-1 text-2xl font-black text-foreground">{toman(order.payment_amount)}</p>
                <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">قیمت نهایی پروژه</dt>
                    <dd className="font-bold text-foreground">{toman(order.final_price)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">سهم پیش‌پرداخت</dt>
                    <dd className="font-bold text-foreground">{(order.payment_percentage || 0).toLocaleString("fa-IR")}٪</dd>
                  </div>
                </dl>
                {order.admin_note && (
                  <p className="mt-4 rounded-lg bg-surface-2 px-3 py-2.5 text-xs leading-6 text-secondary-foreground">
                    <span className="font-bold text-foreground">پیام تیم: </span>
                    {order.admin_note}
                  </p>
                )}
                {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
                <Button type="button" onClick={handlePay} disabled={paying} className="mt-4 h-11 w-full">
                  {paying ? "در حال انتقال به درگاه…" : "پرداخت آنلاین"}
                </Button>
                <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <IconLock size={13} aria-hidden="true" />
                  پرداخت امن با درگاه زرین‌پال
                </p>
              </>
            ) : order.status === "cancelled" ? (
              <p className="text-sm text-muted-foreground">برای سفارش لغو شده پرداختی لازم نیست.</p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">{order.final_price ? "قیمت نهایی" : "برآورد اولیه"}</p>
                <p className="mt-1 text-xl font-black text-foreground">{toman(order.final_price) || order.price_label}</p>
                <p className="mt-3 text-xs leading-6 text-muted-foreground">بعد از بررسی تیم، قیمت نهایی و مبلغ پیش‌پرداخت همین‌جا نمایش داده می‌شه.</p>
              </>
            )}
          </section>

          <dl className={`${card} divide-y divide-border text-sm`}>
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="flex items-center gap-1.5 text-muted-foreground"><IconClock size={15} aria-hidden="true" />مدت تحویل</dt>
              <dd className="font-bold text-foreground">{order.delivery_days.toLocaleString("fa-IR")} روز</dd>
            </div>
            {order.tech_stack && (
              <div className="px-5 py-3">
                <dt className="flex items-center gap-1.5 text-muted-foreground"><IconStack2 size={15} aria-hidden="true" />تکنولوژی پیشنهادی</dt>
                <dd className="mt-1 text-[13px] leading-6 text-foreground" dir="auto">{order.tech_stack}</dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <dt className="text-muted-foreground">کد سفارش</dt>
              <dd className="font-mono text-xs text-secondary-foreground" dir="ltr">{order.id.slice(0, 8).toUpperCase()}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </AppShell>
  );
}
