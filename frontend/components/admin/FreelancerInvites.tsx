"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { IconBan, IconCheck, IconCopy, IconPlus, IconTicket } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AdminFreelancer, createInvite, fetchAdminFreelancers, fetchInvites, InviteCode, revokeInvite } from "@/lib/api";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" });
}

function inviteStatus(invite: InviteCode) {
  if (invite.revoked) return { label: "لغو شده", tone: "bg-danger/10 text-danger" };
  if (invite.used_count >= invite.max_uses) return { label: "استفاده شده", tone: "bg-foreground/[0.06] text-muted-foreground" };
  if (!invite.active) return { label: "منقضی", tone: "bg-warning/10 text-warning" };
  return { label: "فعال", tone: "bg-success/10 text-success" };
}

/** Admin: issue invite codes (freelancer sign-up is invite-only) and see who joined with them. */
export default function FreelancerInvites({ getToken, onUnauthorized }: { getToken: () => string; onUnauthorized: () => void }) {
  const [invites, setInvites] = useState<InviteCode[]>([]);
  const [freelancers, setFreelancers] = useState<AdminFreelancer[]>([]);
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresDays, setExpiresDays] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");
  const [origin, setOrigin] = useState("");

  const handle = useCallback(
    (err: unknown) => {
      if (err instanceof Error && err.message === "UNAUTHORIZED") onUnauthorized();
      else setError(err instanceof Error ? err.message : "درخواست ناموفق بود");
    },
    [onUnauthorized]
  );

  useEffect(() => {
    setOrigin(window.location.origin);
    Promise.all([fetchInvites(getToken()), fetchAdminFreelancers(getToken())])
      .then(([i, f]) => {
        setInvites(i);
        setFreelancers(f);
      })
      .catch(handle);
  }, [getToken, handle]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const invite = await createInvite(getToken(), { note, max_uses: maxUses, expires_days: expiresDays ? Number(expiresDays) : null });
      setInvites((prev) => [invite, ...prev]);
      setNote("");
      setMaxUses(1);
      setExpiresDays("");
    } catch (err) {
      handle(err);
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(code: string) {
    setError("");
    try {
      const updated = await revokeInvite(getToken(), code);
      setInvites((prev) => prev.map((i) => (i.code === code ? updated : i)));
    } catch (err) {
      handle(err);
    }
  }

  async function copyLink(code: string) {
    try {
      await navigator.clipboard.writeText(`${origin}/freelancer/register?invite=${code}`);
      setCopied(code);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      // clipboard blocked: the code is visible to copy by hand
    }
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <form onSubmit={handleCreate} className="rounded-xl border border-border bg-surface p-5">
        <h2 className="font-bold text-foreground">ساخت کد دعوت</h2>
        <p className="mt-1 text-[13px] leading-6 text-muted-foreground">ثبت‌نام فریلنسر فقط با کد دعوت ممکنه. لینک دعوت رو برای فریلنسر بفرست؛ کد خودکار در فرم ثبت‌نام پر می‌شه.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
          <div>
            <label htmlFor="inv-note" className="field-label">یادداشت (برای چه کسی)</label>
            <input id="inv-note" className="field" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً سارا رضایی — موشن" />
          </div>
          <div>
            <label htmlFor="inv-uses" className="field-label">تعداد استفاده</label>
            <input id="inv-uses" type="number" min={1} max={500} className="field" value={maxUses} onChange={(e) => setMaxUses(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} />
          </div>
          <div>
            <label htmlFor="inv-days" className="field-label">اعتبار (روز)</label>
            <input id="inv-days" type="number" min={1} max={365} className="field" value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} placeholder="بدون انقضا" />
          </div>
          <Button type="submit" disabled={creating} className="h-11">
            <IconPlus size={16} aria-hidden="true" />
            {creating ? "در حال ساخت..." : "ساخت کد"}
          </Button>
        </div>
      </form>

      <section aria-labelledby="invites-title" className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 id="invites-title" className="font-bold text-foreground">کدهای دعوت</h2>
        </div>
        {invites.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <IconTicket size={30} stroke={1.4} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">هنوز کد دعوتی نساختی.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map((invite) => {
              const status = inviteStatus(invite);
              return (
                <li key={invite.code} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                  <code dir="ltr" className="font-mono text-sm font-bold text-foreground">{invite.code}</code>
                  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold leading-6", status.tone)}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                    {status.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {invite.used_count.toLocaleString("fa-IR")} از {invite.max_uses.toLocaleString("fa-IR")} استفاده
                    {invite.expires_at ? ` · تا ${formatDate(invite.expires_at)}` : ""}
                  </span>
                  {invite.note && <span className="min-w-0 truncate text-xs text-secondary-foreground">{invite.note}</span>}
                  <div className="mr-auto flex gap-2">
                    {invite.active && (
                      <>
                        <Button type="button" variant="outline" size="sm" onClick={() => copyLink(invite.code)}>
                          {copied === invite.code ? <IconCheck size={15} className="text-success" aria-hidden="true" /> : <IconCopy size={15} aria-hidden="true" />}
                          {copied === invite.code ? "کپی شد" : "کپی لینک دعوت"}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRevoke(invite.code)} aria-label={`لغو کد ${invite.code}`}>
                          <IconBan size={15} aria-hidden="true" />
                          لغو
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="freelancers-title" className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 id="freelancers-title" className="font-bold text-foreground">فریلنسرها</h2>
        </div>
        {freelancers.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">هنوز فریلنسری ثبت‌نام نکرده.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-surface-2/70">
                  {["فریلنسر", "ایمیل", "کد دعوت", "وضعیت", "درخواست‌ها", "عضویت"].map((h) => (
                    <th key={h} className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {freelancers.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3.5 text-sm">
                      <p className="font-bold text-foreground">{f.name || "—"}</p>
                      {f.position && <p className="text-xs text-muted-foreground">{f.position}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-secondary-foreground" dir="ltr">{f.email}</td>
                    <td className="px-5 py-3.5 font-mono text-xs text-muted-foreground" dir="ltr">{f.invite_code || "—"}</td>
                    <td className="px-5 py-3.5 text-xs">
                      {f.onboarding_completed ? <span className="font-bold text-success">فعال</span> : <span className="text-warning">راه‌اندازی ناقص</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-foreground">{f.order_count.toLocaleString("fa-IR")}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-muted-foreground">{formatDate(f.created_at)}</td>
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
