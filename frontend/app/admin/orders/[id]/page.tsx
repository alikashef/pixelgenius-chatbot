"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { approveOrder, fetchOrder, Order, summarizeOrder, uploadAdminOrderFile, uploadProposal } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";
import { IconChevronRight } from "@tabler/icons-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_review: "در انتظار بررسی",
  approved: "تایید شده",
  awaiting_payment: "منتظر پرداخت",
  paid: "پرداخت شده",
  cancelled: "لغو شده",
};

const STATUS_CLASS: Record<Order["status"], string> = {
  pending_review: "bg-warning/10 border border-warning/20 text-warning",
  approved: "bg-info/10 border border-info/20 text-info",
  awaiting_payment: "bg-pending/10 border border-pending/20 text-pending",
  paid: "bg-primary-soft text-brand",
  cancelled: "bg-danger/10 border border-danger/20 text-danger",
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
  const [milestones, setMilestones] = useState<{ title: string; amount: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
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
        if (data.milestones?.length) {
          setMilestones(data.milestones.map((m: { title: string; amount: number }) => ({ title: m.title, amount: m.amount.toString() })));
        }
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
      const parsedMilestones = milestones
        .filter((m) => m.title.trim() && m.amount)
        .map((m) => ({ title: m.title.trim(), amount: parseInt(m.amount) }));
      const updated = await approveOrder(
        getToken(), order.id, parseInt(finalPrice), parseInt(payPercent),
        adminNote || undefined, parsedMilestones
      );
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

  async function handleSummarize() {
    if (!order) return;
    setSummarizing(true);
    setError("");
    try {
      setOrder(await summarizeOrder(getToken(), order.id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در تولید خلاصه");
    } finally {
      setSummarizing(false);
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
    return <div className="flex min-h-screen items-center justify-center bg-background"><span className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  }

  if (!order) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">{error || "سفارش یافت نشد"}</div>;
  }

  const payAmount = finalPrice && payPercent ? Math.round(parseInt(finalPrice) * parseInt(payPercent) / 100) : null;

  return (
    <div className="min-h-screen bg-background bg-aura">
      <header className="glass sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/70 px-4 sm:px-6">
        <button onClick={() => router.push("/admin/dashboard")} className="flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
          <IconChevronRight size={16} stroke={2.5} aria-hidden="true" />
          برگشت
        </button>
        <span className="h-4 w-px bg-border" aria-hidden="true" />
        <h1 className="truncate font-bold text-foreground">{order.project_name}</h1>
        <span className={`mr-auto shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_CLASS[order.status]}`}>{STATUS_LABEL[order.status]}</span>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-7 lg:grid-cols-[1fr_360px]">
        <section className="space-y-5">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <p className="mb-2 text-xs text-muted-foreground">خلاصه پروژه</p>
            <p className="whitespace-pre-wrap text-sm leading-7 text-secondary-foreground">{order.summary}</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-foreground">تاریخچه چت</p>
              <button
                onClick={handleSummarize}
                disabled={summarizing}
                className="flex items-center gap-1.5 rounded-xl border border-primary-line bg-primary-soft px-3 py-1.5 text-xs font-semibold text-brand transition-colors hover:text-foreground disabled:opacity-50"
              >
                {summarizing ? "در حال تحلیل..." : "خلاصه AI"}
              </button>
            </div>
            {order.ai_summary && (
              <div className="mb-4 rounded-xl border border-primary-line bg-primary-soft px-4 py-3 text-sm leading-7 text-brand">
                <p className="mb-1 text-xs text-brand">خلاصه هوش مصنوعی</p>
                <p className="whitespace-pre-wrap">{order.ai_summary}</p>
              </div>
            )}
            <div className="space-y-3">
              {(order.chat_history || []).map((message, index) => (
                <div key={`${message.role}-${index}`} className={`rounded-xl border px-4 py-3 text-sm leading-7 ${message.role === "user" ? "border-primary-line bg-primary-soft text-foreground" : "border-border bg-background text-secondary-foreground"}`}>
                  <p className="mb-1 text-xs opacity-70">{message.role === "user" ? "کاربر" : "دستیار"}</p>
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-semibold text-foreground">فایل‌های پروژه</p>
              <button onClick={() => fileRef.current?.click()} className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">{uploading === "file" ? "در حال آپلود..." : "افزودن فایل"}</button>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0])} />
            </div>
            {(order.order_files || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">هنوز فایلی برای این پروژه ثبت نشده.</p>
            ) : (
              <div className="space-y-2">
                {order.order_files.map((file) => (
                  <a key={file.id} href={`${API_URL}${file.url}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground transition-colors hover:border-primary-line">
                    <span className="truncate">{file.name}</span>
                    <span className="mr-3 shrink-0 text-xs text-muted-foreground">{file.uploaded_by === "admin" ? "ادمین" : "مشتری"} · {formatFileSize(file.size)}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <p className="mb-4 font-semibold text-foreground">تایید و مبلغ</p>
            <div className="space-y-3">
              <input value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} type="number" placeholder="قیمت نهایی (ریال)" className="admin-input" />
              <input value={payPercent} onChange={(e) => setPayPercent(e.target.value)} type="number" min={10} max={100} placeholder="درصد پیش‌پرداخت" className="admin-input" />
              {payAmount && <p className="rounded-xl border border-primary-line bg-primary-soft px-4 py-3 text-sm text-brand">مبلغ قابل پرداخت: {payAmount.toLocaleString("fa-IR")} ریال</p>}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">مایلستون‌ها</p>
                  <button
                    type="button"
                    onClick={() => setMilestones((prev) => [...prev, { title: "", amount: "" }])}
                    className="text-xs text-brand hover:text-foreground"
                  >
                    + اضافه کردن
                  </button>
                </div>
                {milestones.length > 0 && (
                  <div className="space-y-2">
                    {milestones.map((m, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          value={m.title}
                          onChange={(e) => setMilestones((prev) => prev.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                          placeholder="عنوان مرحله"
                          className="admin-input flex-1"
                        />
                        <input
                          value={m.amount}
                          onChange={(e) => setMilestones((prev) => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                          type="number"
                          placeholder="مبلغ (ریال)"
                          className="admin-input w-32"
                        />
                        <button
                          type="button"
                          onClick={() => setMilestones((prev) => prev.filter((_, j) => j !== i))}
                          className="text-danger hover:text-danger text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {(() => {
                      const total = milestones.reduce((sum, m) => sum + (parseInt(m.amount) || 0), 0);
                      const fp = parseInt(finalPrice) || 0;
                      return total > 0 && (
                        <p className={`text-xs ${total === fp ? "text-success" : "text-pending"}`}>
                          جمع مایلستون‌ها: {total.toLocaleString("fa-IR")} ریال
                          {total !== fp && fp > 0 && ` (تفاوت: ${(fp - total).toLocaleString("fa-IR")} ریال)`}
                        </p>
                      );
                    })()}
                  </div>
                )}
              </div>

              <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3} placeholder="یادداشت برای مشتری" className="admin-textarea" />
              {error && <p className="text-sm text-danger">{error}</p>}
              <button onClick={handleApprove} disabled={saving || !finalPrice} className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50">{saving ? "در حال ثبت..." : "تایید و ارسال به مشتری"}</button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <p className="mb-3 font-semibold text-foreground">پروپوزال</p>
            {order.proposal_file && <a href={`${API_URL}${order.proposal_file}`} target="_blank" rel="noopener noreferrer" className="mb-3 block text-sm text-brand">مشاهده پروپوزال فعلی</a>}
            <button onClick={() => proposalRef.current?.click()} className="w-full rounded-xl border border-border py-3 text-sm text-muted-foreground transition-colors hover:border-primary-line hover:text-foreground">{uploading === "proposal" ? "در حال آپلود..." : "آپلود / جایگزینی پروپوزال"}</button>
            <input ref={proposalRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => handleProposalUpload(e.target.files?.[0])} />
          </div>
        </aside>
      </main>
    </div>
  );
}
