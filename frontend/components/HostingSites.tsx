"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { IconCircleCheck, IconClockHour4, IconExternalLink, IconPlus, IconRefresh, IconTrash, IconWorld } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addSiteDomain, fetchHostedSites, HostedSite, HostingOverview, removeSiteDomain, renewSite, verifySiteDomain } from "@/lib/api";

function remaining(expiresAt: number) {
  const seconds = expiresAt - Date.now() / 1000;
  if (seconds <= 0) return "مهلت تمام شده";
  const days = Math.floor(seconds / 86400);
  const hours = Math.ceil((seconds % 86400) / 3600);
  return days > 0 ? `${days.toLocaleString("fa-IR")} روز مانده` : `${hours.toLocaleString("fa-IR")} ساعت مانده`;
}

const KIND_LABEL = { static: "استاتیک", dynamic: "داینامیک" } as const;

function DnsHelp({ site, ips, domain }: { site: HostedSite; ips: string[]; domain: string }) {
  const apex = domain.split(".").length === 2;
  return (
    <div className="mt-2 rounded-lg bg-surface-2 p-3 text-xs leading-6 text-secondary-foreground">
      <p>در پنل دامنه‌ات این رکورد رو بساز، بعد «بررسی» رو بزن:</p>
      <div dir="ltr" className="mt-1.5 overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 font-mono text-[12px] text-foreground">
        {apex
          ? ips.length
            ? ips.map((ip) => <div key={ip}>{domain}  A  {ip}</div>)
            : <div>{domain}  ALIAS/ANAME  {site.target}</div>
          : <div>{domain}  CNAME  {site.target}</div>}
      </div>
      <p className="mt-1.5 text-muted-foreground">تغییر DNS معمولاً چند دقیقه تا چند ساعت طول می‌کشه. SSL خودکار صادر می‌شه.</p>
    </div>
  );
}

function SiteCard({ site, ips, token, onChange, onUnauthorized }: { site: HostedSite; ips: string[]; token: string; onChange: () => void; onUnauthorized: () => void }) {
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError("");
    setNote("");
    try {
      await action();
      onChange();
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED") onUnauthorized();
      else setError(err instanceof Error ? err.message : "درخواست انجام نشد");
    } finally {
      setBusy("");
    }
  }

  function add(e: FormEvent) {
    e.preventDefault();
    if (!domain.trim()) return;
    void run("add", async () => {
      await addSiteDomain(token, site.order_id, domain.trim());
      setDomain("");
    });
  }

  const live = !site.expired;
  return (
    <article className="rounded-xl border border-border bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-foreground">{site.project_name}</h3>
          <a href={site.url} target="_blank" rel="noopener noreferrer" dir="ltr" className="mt-1 flex items-center gap-1 font-mono text-[11px] text-brand hover:underline">
            {site.url.replace(/^https?:\/\//, "")}
            <IconExternalLink size={13} aria-hidden="true" />
          </a>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold leading-5", live ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
              {live ? "روشن" : "خاموش"}
            </span>
            <span className="rounded-full bg-foreground/[0.06] px-2.5 py-0.5 leading-5 text-muted-foreground">
              {KIND_LABEL[site.kind]}{site.has_database ? " + دیتابیس" : ""}
            </span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <IconClockHour4 size={14} aria-hidden="true" />
              {remaining(site.expires_at)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!site.can_renew_free || !!busy}
            onClick={() => run("renew", () => renewSite(token, site.order_id))}
            title={site.can_renew_free ? undefined : "تمدید رایگان از دو روز آخر مهلت فعال می‌شه"}
          >
            <IconRefresh size={15} aria-hidden="true" />
            {busy === "renew" ? "در حال تمدید…" : "تمدید رایگان"}
          </Button>
          <Button type="button" size="sm" disabled title="پرداخت به‌زودی فعال می‌شه">
            پرداخت و تمدید ماهانه
            <span className="rounded-full bg-accent-soft px-1.5 text-[10px] leading-5 text-accent">به‌زودی</span>
          </Button>
        </div>
      </div>

      <div className="border-t border-border p-5">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-bold text-foreground">
          <IconWorld size={15} aria-hidden="true" />
          دامنه‌ی اختصاصی
        </p>
        {site.domains.length > 0 && (
          <ul className="mb-3 space-y-3">
            {site.domains.map((item) => (
              <li key={item.domain}>
                <div className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="text-sm font-bold text-foreground">{item.domain}</span>
                  {item.verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 text-[11px] font-bold leading-5 text-success">
                      <IconCircleCheck size={13} aria-hidden="true" /> وصل شد
                    </span>
                  ) : (
                    <span className="rounded-full bg-warning/10 px-2 text-[11px] font-bold leading-5 text-warning">منتظر DNS</span>
                  )}
                  <span className="mr-auto flex gap-1">
                    {!item.verified && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!!busy}
                        onClick={() =>
                          run(`verify-${item.domain}`, async () => {
                            const result = await verifySiteDomain(token, site.order_id, item.domain);
                            if (!result.verified) setNote(result.detail || "هنوز وصل نشده");
                          })
                        }
                      >
                        {busy === `verify-${item.domain}` ? "در حال بررسی…" : "بررسی"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => run(`remove-${item.domain}`, () => removeSiteDomain(token, site.order_id, item.domain))}
                      aria-label={`حذف ${item.domain}`}
                    >
                      <IconTrash size={15} aria-hidden="true" />
                    </Button>
                  </span>
                </div>
                {!item.verified && <DnsHelp site={site} ips={ips} domain={item.domain} />}
              </li>
            ))}
          </ul>
        )}
        {site.domains.length < 3 && (
          <form onSubmit={add} className="flex gap-2">
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              dir="ltr"
              aria-label="دامنه‌ی اختصاصی"
              className="field min-w-0 flex-1 py-2"
            />
            <Button type="submit" variant="outline" disabled={!!busy || !domain.trim()}>
              <IconPlus size={15} aria-hidden="true" />
              اتصال
            </Button>
          </form>
        )}
        {note && <p className="mt-2 text-xs text-warning">{note}</p>}
        {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      </div>
    </article>
  );
}

/** Customer panel: published sites, their trial and free renewal, and custom domains. */
export default function HostingSites({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [data, setData] = useState<HostingOverview | null>(null);
  const [error, setError] = useState("");
  // Kept in a ref so a new callback from the parent does not refetch.
  const unauthorized = useRef(onUnauthorized);
  unauthorized.current = onUnauthorized;

  const load = useCallback(() => {
    fetchHostedSites(token)
      .then(setData)
      .catch((err) => (err instanceof Error && err.message === "UNAUTHORIZED" ? unauthorized.current() : setError(err instanceof Error ? err.message : "دریافت سایت‌ها ناموفق بود")));
  }, [token]);

  useEffect(load, [load]);

  if (error) return <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>;
  if (!data) return <div className="h-40 animate-pulse rounded-xl bg-surface-2" aria-label="در حال بارگذاری" />;

  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-accent-line bg-accent-soft px-4 py-3 text-[13px] leading-6 text-secondary-foreground">
        هر سایت {data.trial_days.toLocaleString("fa-IR")} روز رایگان روشنه. پرداخت ماهانه به‌زودی فعال می‌شه؛ تا اون موقع در دو روز آخر مهلت، «تمدید رایگان» رو بزن.{" "}
        <Link href="/pricing#hosting" className="font-bold text-foreground underline-offset-4 hover:underline">تعرفه‌ها</Link>
      </p>
      {data.sites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
          <IconWorld size={30} stroke={1.4} className="mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-bold text-foreground">هنوز سایتی منتشر نکردی</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">ابزار هوش مصنوعی‌ات رو وصل کن تا پروژه رو بسازه و منتشر کنه؛ سایت‌ها این‌جا میان.</p>
        </div>
      ) : (
        data.sites.map((site) => <SiteCard key={site.order_id} site={site} ips={data.server_ips} token={token} onChange={load} onUnauthorized={onUnauthorized} />)
      )}
    </div>
  );
}
