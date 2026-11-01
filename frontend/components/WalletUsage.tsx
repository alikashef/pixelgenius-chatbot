"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconCoin, IconPlus, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { fetchWallet, quoteTopup, startTopup, WalletReport } from "@/lib/api";
import { cn } from "@/lib/utils";

const fa = (n: number) => Math.round(n).toLocaleString("fa-IR");
const PRESETS = [50_000, 100_000, 200_000, 500_000];
const REFRESH_EVENT = "wallet:refresh";

function useWallet(token: string, days: number, onUnauthorized?: () => void) {
  const [report, setReport] = useState<WalletReport | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    if (!token) return;
    fetchWallet(token, days)
      .then((r) => { setReport(r); setError(""); })
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") onUnauthorized?.();
        else setError(err instanceof Error ? err.message : "خطا در دریافت کیف پول");
      });
  }, [token, days, onUnauthorized]);
  useEffect(() => {
    load();
    window.addEventListener(REFRESH_EVENT, load);
    window.addEventListener("focus", load);
    return () => { window.removeEventListener(REFRESH_EVENT, load); window.removeEventListener("focus", load); };
  }, [load]);
  return { report, error, reload: load };
}

/** Top-up dialog: suggested amounts, a custom amount, an optional discount code, then the payment gateway. */
export function TopupModal({ token, ratePerCredit, minToman, onClose }: { token: string; ratePerCredit: number; minToman: number; onClose: () => void }) {
  const [amount, setAmount] = useState(100_000);
  const [custom, setCustom] = useState("");
  const [code, setCode] = useState("");
  const [quote, setQuote] = useState<{ credits: number; bonus: number; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toman = custom ? Number(custom.replace(/\D/g, "")) || 0 : amount;

  useEffect(() => {
    setError("");
    if (toman < minToman) { setQuote(null); return; }
    const timer = setTimeout(() => {
      quoteTopup(token, toman, code.trim()).then(setQuote).catch((err) => { setQuote(null); setError(err instanceof Error ? err.message : ""); });
    }, 250);
    return () => clearTimeout(timer);
  }, [toman, code, token, minToman]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const { payment_url } = await startTopup(token, toman, code.trim(), `${window.location.origin}/payment/verify?kind=wallet`);
      window.location.href = payment_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد پرداخت");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="topup-title" className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-elevated">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="topup-title" className="text-base font-black text-foreground">شارژ کیف پول</h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">هر {fa(ratePerCredit)} تومان = ۱ کردیت. پرداخت با درگاه امن انجام می‌شه.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن" className="rounded-md p-1 text-muted-foreground outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring">
            <IconX size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="مبلغ شارژ">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={!custom && amount === p}
              onClick={() => { setAmount(p); setCustom(""); }}
              className={cn(
                "rounded-xl border bg-surface px-3 py-3 text-right outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                !custom && amount === p ? "border-foreground bg-surface-2" : "border-border hover:border-foreground/40"
              )}
            >
              <span className="block text-sm font-black text-foreground">{fa(p)} تومان</span>
              <span className="block text-xs text-muted-foreground">{fa(p / ratePerCredit)} کردیت</span>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label htmlFor="topup-custom" className="field-label">مبلغ دلخواه (تومان)</label>
          <input id="topup-custom" inputMode="numeric" dir="ltr" value={custom ? fa(toman) : ""} onChange={(e) => setCustom(e.target.value.replace(/[^\d۰-۹]/g, "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))))} placeholder={`حداقل ${fa(minToman)}`} className="field min-h-11 text-left" />
        </div>
        <div className="mt-3">
          <label htmlFor="topup-code" className="field-label">کد تخفیف (اختیاری)</label>
          <input id="topup-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" spellCheck={false} className="field min-h-11 text-left font-mono tracking-wider" />
        </div>

        {error && <p role="alert" className="mt-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-secondary-foreground">
            {quote ? (
              <>دریافتی: <span className="font-black text-foreground">{fa(quote.total)} کردیت</span>{quote.bonus > 0 && <span className="text-success"> (+{fa(quote.bonus)} هدیه)</span>}</>
            ) : toman < minToman ? `حداقل شارژ ${fa(minToman)} تومان` : "..."}
          </p>
          <Button type="button" className="h-11 min-w-32" disabled={busy || toman < minToman} onClick={pay}>
            {busy ? "در حال انتقال..." : `پرداخت ${fa(toman)} تومان`}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Sidebar chip: the balance (0 when empty) and a top-up button. Renders nothing for signed-out visitors. */
export function SidebarWallet() {
  const [token, setToken] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => setToken(localStorage.getItem("customer_token") || ""), []);
  const { report } = useWallet(token, 1);
  useEffect(() => {
    const openModal = () => setOpen(true);
    window.addEventListener("wallet:topup", openModal);
    return () => window.removeEventListener("wallet:topup", openModal);
  }, []);
  if (!token) return null;
  return (
    <>
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2" data-tour="wallet">
        <IconCoin size={18} className="shrink-0 text-accent" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] text-muted-foreground">موجودی کیف پول</span>
          <span className="block text-sm font-black text-foreground">{fa(report?.credits ?? 0)} کردیت</span>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <IconPlus size={14} aria-hidden="true" />
          شارژ
        </Button>
      </div>
      {open && createPortal(<TopupModal token={token} ratePerCredit={report?.toman_per_credit ?? 100} minToman={report?.min_topup_toman ?? 50_000} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Account tab: balance, usage chart (per service and per day), payments made and the full ledger. */
export default function WalletUsage({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [days, setDays] = useState(30);
  const [open, setOpen] = useState(false);
  const { report, error } = useWallet(token, days, onUnauthorized);

  if (error) return <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>;
  if (!report) return <p className="text-sm text-muted-foreground">در حال دریافت...</p>;

  const maxDay = Math.max(1, ...report.daily.map((d) => d.credits));
  const payments = report.ledger.filter((l) => l.kind === "topup");
  const paidToman = payments.reduce((sum, p) => sum + p.delta * report.toman_per_credit, 0);

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-5">
        <div>
          <p className="text-xs text-muted-foreground">موجودی فعلی</p>
          <p className="mt-1 text-3xl font-black text-foreground">{fa(report.credits)} <span className="text-sm font-bold text-muted-foreground">کردیت</span></p>
          <p className="mt-1 text-xs text-muted-foreground">معادل {fa(report.credits * report.toman_per_credit)} تومان</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)} className="h-11">
          <IconPlus size={16} aria-hidden="true" />
          شارژ کیف پول
        </Button>
      </section>

      <section aria-labelledby="usage-title" className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="usage-title" className="font-bold text-foreground">نمودار مصارف</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">در {fa(report.days)} روز گذشته {fa(report.spent)} کردیت ({fa(report.spent * report.toman_per_credit)} تومان) مصرف شده.</p>
          </div>
          <div role="radiogroup" aria-label="بازه" className="flex rounded-lg bg-surface-2 p-0.5">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)} className={cn("rounded-md px-3 py-1 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring", days === d ? "bg-surface text-foreground shadow-card" : "text-muted-foreground")}>
                {fa(d)} روز
              </button>
            ))}
          </div>
        </div>

        {report.spent === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">در این بازه هنوز کردیتی مصرف نشده.</p>
        ) : (
          <>
            <div className="mt-5 flex h-36 items-end gap-[3px]" role="img" aria-label="مصرف روزانه کردیت">
              {report.daily.map((d) => (
                <div key={d.date} className="group relative flex h-full min-w-0 flex-1 items-end" title={`${new Date(d.date).toLocaleDateString("fa-IR")}: ${fa(d.credits)} کردیت`}>
                  <div className={cn("w-full rounded-t-sm", d.credits ? "bg-brand-solid" : "bg-foreground/[0.06]")} style={{ height: `${d.credits ? Math.max(4, (d.credits / maxDay) * 100) : 3}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
              <span>{new Date(report.daily[0].date).toLocaleDateString("fa-IR", { month: "short", day: "numeric" })}</span>
              <span>امروز</span>
            </div>

            <h3 className="mt-6 text-sm font-bold text-foreground">مصرف به تفکیک بخش</h3>
            <ul className="mt-3 space-y-3">
              {report.by_kind.map((k) => (
                <li key={k.kind}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-bold text-foreground">{k.label}</span>
                    <span className="text-xs text-muted-foreground">{fa(k.credits)} کردیت · {fa(k.count)} بار · {Math.round((k.credits / report.spent) * 100).toLocaleString("fa-IR")}٪</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-foreground/[0.06]">
                    <div className="h-full rounded-full bg-brand-solid" style={{ width: `${(k.credits / report.spent) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="pay-title" className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-baseline justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="pay-title" className="font-bold text-foreground">پرداخت‌های من</h2>
          <span className="text-xs text-muted-foreground">جمع {fa(report.days)} روز گذشته: {fa(paidToman)} تومان</span>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">هنوز پرداختی انجام نشده.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="font-bold text-foreground">{fa(p.delta * report.toman_per_credit)} تومان</span>
                <span className="text-xs text-muted-foreground">{fa(p.delta)} کردیت</span>
                <span className="text-xs text-muted-foreground">{formatDate(p.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ledger-title" className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4"><h2 id="ledger-title" className="font-bold text-foreground">ریز تراکنش‌ها</h2></div>
        {report.ledger.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">تراکنشی ثبت نشده.</p>
        ) : (
          <ul className="divide-y divide-border">
            {report.ledger.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
                <span className={cn("w-20 shrink-0 text-sm font-black", l.delta > 0 ? "text-success" : "text-foreground")} dir="ltr">{l.delta > 0 ? "+" : "−"}{fa(Math.abs(l.delta))}</span>
                <span className="min-w-0 flex-1 text-sm text-secondary-foreground">
                  <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{l.label}</span>
                  {l.reason}
                </span>
                <span className="text-xs text-muted-foreground">{formatDate(l.created_at)} · مانده {fa(l.balance_after)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && <TopupModal token={token} ratePerCredit={report.toman_per_credit} minToman={report.min_topup_toman} onClose={() => setOpen(false)} />}
    </div>
  );
}
