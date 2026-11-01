"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { IconGift, IconPlus, IconSearch } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { AdminCustomer, fetchAdminCustomers, fetchCustomerCount, grantCredits, grantCreditsToAll } from "@/lib/api";

const fa = (n: number) => n.toLocaleString("fa-IR");

/** Admin: every customer with their wallet, and a form to add or remove credits. */
export default function UserCredits({ getToken, onUnauthorized }: { getToken: () => string; onUnauthorized: () => void }) {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<AdminCustomer | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftNote, setGiftNote] = useState("");
  const [giftCount, setGiftCount] = useState<number | null>(null);

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof Error && err.message === "UNAUTHORIZED") onUnauthorized();
      else setError(err instanceof Error ? err.message : "درخواست ناموفق بود");
    },
    [onUnauthorized]
  );

  const load = useCallback(
    (q: string) => {
      fetchAdminCustomers(getToken(), q).then(setCustomers).catch(handle);
    },
    [getToken, handle]
  );

  useEffect(() => {
    const timer = setTimeout(() => load(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query, load]);

  async function handleGrant(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    const credits = Number(amount.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));
    if (!Number.isInteger(credits) || credits === 0) { setError("مقدار کردیت را وارد کن (برای کم کردن منفی بنویس)"); return; }
    setBusy(true);
    setError("");
    setDone("");
    try {
      const res = await grantCredits(getToken(), target.phone, credits, note.trim());
      setDone(`${credits > 0 ? "اضافه شد" : "کم شد"}؛ موجودی جدید ${target.name || target.phone}: ${fa(res.credits)} کردیت`);
      setAmount("");
      setNote("");
      setTarget(null);
      load(query.trim());
    } catch (err) {
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  const parseCredits = (value: string) => Number(value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))));

  async function askGift(e: FormEvent) {
    e.preventDefault();
    const credits = parseCredits(giftAmount);
    if (!Number.isInteger(credits) || credits < 1) { setError("مقدار هدیه را به‌صورت عدد مثبت وارد کن"); return; }
    setError("");
    setDone("");
    try {
      setGiftCount((await fetchCustomerCount(getToken())).count);
    } catch (err) {
      handle(err);
    }
  }

  async function sendGift() {
    if (giftCount === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await grantCreditsToAll(getToken(), parseCredits(giftAmount), giftNote.trim(), giftCount);
      setDone(`${fa(parseCredits(giftAmount))} کردیت به ${fa(res.count)} کاربر هدیه داده شد`);
      setGiftAmount("");
      setGiftNote("");
      setGiftCount(null);
      load(query.trim());
    } catch (err) {
      setGiftCount(null);
      handle(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
      {done && <p role="status" className="rounded-lg border border-success/25 bg-success/10 px-4 py-2.5 text-sm text-success">{done}</p>}

      <form onSubmit={askGift} className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold text-foreground">هدیه به همه‌ی کاربران</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">همین مقدار کردیت به موجودی همه‌ی کاربران اضافه می‌شود و در ریز تراکنش هر کدام با دلیلی که می‌نویسی دیده می‌شود.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="gift-amount" className="field-label">کردیت برای هر نفر</label>
            <input id="gift-amount" dir="ltr" inputMode="numeric" className="field text-left" value={giftAmount} onChange={(e) => { setGiftAmount(e.target.value); setGiftCount(null); }} placeholder="100" />
          </div>
          <div>
            <label htmlFor="gift-note" className="field-label">دلیل (کاربر می‌بیند)</label>
            <input id="gift-note" className="field" maxLength={120} value={giftNote} onChange={(e) => setGiftNote(e.target.value)} placeholder="مثلاً هدیه‌ی راه‌اندازی" />
          </div>
          <Button type="submit" variant="outline" className="h-11" disabled={busy}>
            <IconGift size={16} aria-hidden="true" />
            ارسال هدیه
          </Button>
        </div>
        {giftCount !== null && (
          <div role="alertdialog" aria-label="تایید هدیه" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3">
            <p className="text-sm text-foreground">
              {fa(parseCredits(giftAmount))} کردیت ({fa(parseCredits(giftAmount) * 100)} تومان) به <span className="font-black">{fa(giftCount)} کاربر</span> داده می‌شود؛ مجموع {fa(parseCredits(giftAmount) * giftCount)} کردیت. این کار برگشت‌پذیر نیست.
            </p>
            <div className="flex gap-2">
              <Button type="button" disabled={busy} onClick={sendGift}>{busy ? "..." : "تایید و ارسال"}</Button>
              <Button type="button" variant="ghost" onClick={() => setGiftCount(null)}>انصراف</Button>
            </div>
          </div>
        )}
      </form>

      {target && (
        <form onSubmit={handleGrant} className="rounded-xl border border-border bg-surface p-5">
          <h2 className="font-bold text-foreground">کردیت برای {target.name || target.phone}</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">موجودی فعلی {fa(target.credits)} کردیت. عدد مثبت اضافه می‌کند و منفی (مثل ‎-۵۰) کم می‌کند.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-[8rem_1fr_auto_auto] sm:items-end">
            <div>
              <label htmlFor="grant-amount" className="field-label">کردیت</label>
              <input id="grant-amount" dir="ltr" inputMode="numeric" className="field text-left" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" autoFocus />
            </div>
            <div>
              <label htmlFor="grant-note" className="field-label">دلیل (در ریز تراکنش کاربر می‌آید)</label>
              <input id="grant-note" className="field" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً هدیه‌ی معرفی" />
            </div>
            <Button type="submit" disabled={busy} className="h-11">{busy ? "..." : "ثبت"}</Button>
            <Button type="button" variant="ghost" className="h-11" onClick={() => { setTarget(null); setError(""); }}>انصراف</Button>
          </div>
        </form>
      )}

      <section aria-labelledby="users-title" className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="users-title" className="font-bold text-foreground">کاربران</h2>
          <div className="relative w-full sm:w-72">
            <IconSearch size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input aria-label="جستجوی کاربر" className="field pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="شماره یا نام" />
          </div>
        </div>
        {customers.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">کاربری پیدا نشد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-2/70">
                  {["کاربر", "موجودی", "شارژ و هدیه", "مصرف", "عضویت", ""].map((h) => (
                    <th key={h} className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="px-5 py-3">
                      <span className="block text-sm font-bold text-foreground">{c.name || "بدون نام"}</span>
                      <span dir="ltr" className="block text-right text-xs text-muted-foreground">{c.phone}</span>
                    </td>
                    <td className="px-5 py-3 text-sm font-black text-foreground">{fa(c.credits)}</td>
                    <td className="px-5 py-3 text-sm text-secondary-foreground">{fa(c.added)}</td>
                    <td className="px-5 py-3 text-sm text-secondary-foreground">{fa(c.spent)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("fa-IR")}</td>
                    <td className="px-5 py-3 text-left">
                      <Button type="button" variant="outline" size="sm" onClick={() => { setTarget(c); setDone(""); setError(""); }}>
                        <IconPlus size={14} aria-hidden="true" />
                        کردیت
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
