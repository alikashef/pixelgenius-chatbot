"use client";

import { useCallback, useEffect, useState } from "react";
import { IconExternalLink, IconRefresh } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { fetchProviderBalances, ProviderBalances as Balances } from "@/lib/api";

const fa = (n: number) => n.toLocaleString("fa-IR");

/** Admin: what gapgpt and Kaya report for our API keys, with a link to top each one up. */
export default function ProviderBalances({ getToken, onUnauthorized }: { getToken: () => string; onUnauthorized: () => void }) {
  const [data, setData] = useState<Balances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    fetchProviderBalances(getToken())
      .then(setData)
      .catch((err) => {
        if (err instanceof Error && err.message === "UNAUTHORIZED") onUnauthorized();
        else setError(err instanceof Error ? err.message : "درخواست ناموفق بود");
      })
      .finally(() => setLoading(false));
  }, [getToken, onUnauthorized]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {data ? `نرخ دلار برای تبدیل: ${fa(data.rate)} تومان` : "در حال دریافت از سرویس‌ها…"}
        </p>
        <Button variant="outline" onClick={load} disabled={loading}>
          <IconRefresh className="size-4" aria-hidden="true" /> بروزرسانی
        </Button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.providers.map((p) => (
          <section key={p.name} className="rounded-xl border border-border bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-bold text-foreground">{p.title}</h3>
              <a href={p.topup_url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring">
                شارژ <IconExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            </div>
            {p.lines.length > 0 ? (
              <dl className="mt-4 space-y-3">
                {p.lines.map((line) => (
                  <div key={line.label} className="flex items-baseline justify-between gap-3 border-t border-border pt-3 first:border-0 first:pt-0">
                    <dt className="text-xs text-muted-foreground">{line.label}</dt>
                    <dd className="text-end">
                      <span className="block text-base font-black text-foreground">{fa(line.toman)} تومان</span>
                      <span className="block text-xs text-muted-foreground" dir="ltr">${line.usd.toLocaleString("en-US")}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {p.error && <p className="mt-4 text-xs text-warning">{p.error}</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
