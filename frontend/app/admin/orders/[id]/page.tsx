"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { approveOrder, fetchOrder, Order, uploadAdminOrderFile, uploadProposal } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

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

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024)).toLocaleString("fa-IR")} KB`;
  return `${(size / 1024 / 1024).toLocaleString("fa-IR", { maximumFractionDigits: 1 })} MB`;
}

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const proposalRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [finalPrice, setFinalPrice] = useState("");
  const [payPercent, setPayPercent] = useState("50");
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");

  function getToken() {
    return localStorage.getItem("admin_token") || "";
  }

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/admin/login"); return; }
    fetchOrder(token, id)
      .then((data) => {
        setOrder(data);
        setFinalPrice(data.final_price?.toString() || "");
        setPayPercent(data.payment_percentage?.toString() || "50");
        setAdminNote(data.admin_note || "");
      })
      .catch((err) => {
        if (err.message === "UNAUTHORIZED") {
          localStorage.removeItem("admin_token");
          router.replace("/admin/login");
        } else {
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleApprove() {
    if (!order || !finalPrice) return;
    setSaving(true);
    setError("");
    try {
      const updated = await approveOrder(getToken(), order.id, parseInt(finalPrice), parseInt(payPercent), adminNote || undefined);
      setOrder(updated);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ثبت");
    } finally {
      setSaving(false);
    }
  }

  async function handleProposalUpload(file?: File) {
    if (!order || !file) return;
    setUploading("proposal");
    setError("");
    try {
      setOrder(await uploadProposal(getToken(), order.id, file));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در آپلود پروپوزال");
    } finally {
      setUploading("");
    }
  }

  async function handleFileUpload(file?: File) {
    if (!order || !file) return;
    setUploading("file");
    setError("");
    try {
      setOrder(await uploadAdminOrderFile(getToken(), order.id, file));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در آپلود فایل");
    } finally {
      setUploading("");
    }
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))]"><span className="h-10 w-10 animate-spin rounded-full border-4 border-[--violet] border-t-transparent" /></div>;
  }

  if (!order) {
    return <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]">{error || "سفارش یافت نشد"}</div>;
  }

  const payAmount = finalPrice && payPercent ? Math.round(parseInt(finalPrice) * parseInt(payPercent) / 100) : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-5 py-4 backdrop-blur">
        <button onClick={() => router.push("/admin/dashboard")} className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-white">برگشت</button>
        <h1 className="truncate font-bold text-white">{order.project_name}</h1>
        <span className={`mr-auto rounded-full px-3 py-1 text-xs ${STATUS_CLASS[order.status]}`}>{STATUS_LABEL[order.status]}</span>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-7 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-5">
            <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">خلاصه پروژه</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-[hsl(var(--secondary-foreground))]">{order.summary}</p>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-5">
            <p className="mb-3 font-semibold text-white">تاریخچه چت</p>
            <div className="space-y-3">
              {(order.chat_history || []).map((message, index) => (
                <div key={`${message.role}-${index}`} className={`rounded-xl border px-4 py-3 text-sm leading-7 ${message.role === "user" ? "border-[--violet-border] bg-[--violet-glow] text-white" : "border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--secondary-foreground))]"}`}>
                  <p className="mb-1 text-xs opacity-70">{message.role === "user" ? "کاربر" : "دستیار"}</p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-white">فایل‌های پروژه</p>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-[--violet] px-4 py-2 text-xs font-bold text-white">{uploading === "file" ? "در حال آپلود..." : "افزودن فایل"}</button>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
            </div>
            {(order.order_files || []).length === 0 ? (
              <p className="text-sm text-[hsl(var(--muted-foreground))]">هنوز فایلی برای این پروژه ثبت نشده.</p>
            ) : (
              <div className="space-y-2">
                {order.order_files.map((file) => (
                  <a key={file.id} href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-white transition-colors hover:border-[--violet-border]">
                    <span className="truncate">{file.name}</span>
                    <span className="mr-3 shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{file.uploaded_by === "admin" ? "ادمین" : "مشتری"} · {formatFileSize(file.size)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-5">
            <p className="mb-4 font-semibold text-white">تایید و مبلغ</p>
            <div className="space-y-3">
              <input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} type="number" placeholder="قیمت نهایی (ریال)" className="admin-input" />
              <input value={payPercent} onChange={(e) => setPayPercent(e.target.value)} type="number" min={10} max={100} placeholder="درصد پیش‌پرداخت" className="admin-input" />
              {payAmount && <p className="rounded-xl border border-[--violet-border] bg-[--violet-glow] px-4 py-3 text-sm text-violet-200">مبلغ قابل پرداخت: {payAmount.toLocaleString("fa-IR")} ریال</p>}
              <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3} placeholder="یادداشت برای مشتری" className="admin-textarea" />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button onClick={handleApprove} disabled={saving || !finalPrice} className="w-full rounded-xl bg-[--violet] py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:opacity-50">{saving ? "در حال ثبت..." : "تایید و ارسال به مشتری"}</button>
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--border))] bg-[--surface] p-5">
            <p className="mb-3 font-semibold text-white">پروپوزال</p>
            {order.proposal_file && <a href={`${API_URL}${order.proposal_file}`} target="_blank" rel="noopener noreferrer" className="mb-3 block text-sm text-violet-300">مشاهده پروپوزال فعلی</a>}
            <button onClick={() => proposalRef.current?.click()} className="w-full rounded-xl border border-[hsl(var(--border))] py-3 text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:border-[--violet-border] hover:text-white">{uploading === "proposal" ? "در حال آپلود..." : "آپلود / جایگزینی پروپوزال"}</button>
            <input ref={proposalRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => handleProposalUpload(e.target.files?.[0])} />
          </div>
        </aside>
      </main>
    </div>
  );
}
