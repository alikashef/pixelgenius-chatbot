"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { IconBrandGithub, IconCheck, IconLock, IconRefresh, IconSearch } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { disconnectGithub, fetchGithubRepos, fetchGithubStatus, GithubRepo, GithubStatus, startGithubConnect } from "@/lib/api";

const RESULT_NOTES: Record<string, string> = {
  denied: "اتصال به GitHub لغو شد.",
  error: "اتصال به GitHub انجام نشد؛ دوباره امتحان کن.",
};

function repoName(url: string) {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).slice(0, 2).join("/");
  } catch {
    return url;
  }
}

/** Source step for existing projects: connect GitHub once, then pick a repository instead of pasting a link. */
export default function GithubRepoPicker({
  token,
  value,
  onChange,
  returnTo = "/chat",
}: {
  token: string;
  value: string;
  onChange: (url: string) => void;
  returnTo?: string;
}) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [repos, setRepos] = useState<GithubRepo[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(!value);

  const loadRepos = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setRepos(await fetchGithubRepos(token));
    } catch (err) {
      // A revoked token comes back as "not connected"; refresh the status so the connect button returns.
      setError(err instanceof Error ? err.message : "دریافت مخزن‌ها ناموفق بود");
      setStatus(await fetchGithubStatus(token).catch(() => null));
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const result = params.get("github");
    if (result) {
      if (RESULT_NOTES[result]) setError(RESULT_NOTES[result]);
      params.delete("github");
      const rest = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
    }
    fetchGithubStatus(token)
      .then((next) => {
        setStatus(next);
        if (next.connected) void loadRepos();
      })
      .catch(() => setStatus({ configured: false, connected: false, login: null }));
  }, [token, loadRepos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (repos || []).filter((repo) => !q || repo.full_name.toLowerCase().includes(q) || (repo.description || "").toLowerCase().includes(q));
  }, [repos, query]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      const { url } = await startGithubConnect(token, returnTo);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "اتصال به GitHub انجام نشد");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectGithub(token);
      setStatus((s) => (s ? { ...s, connected: false, login: null } : s));
      setRepos(null);
      onChange("");
      setPicking(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "قطع اتصال انجام نشد");
    } finally {
      setBusy(false);
    }
  }

  const note = error && <p role="alert" className="mb-3 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>;

  if (!token) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input bg-surface-2 p-5 text-center">
        <IconBrandGithub size={26} className="text-foreground" aria-hidden="true" />
        <p className="text-xs leading-6 text-muted-foreground">برای انتخاب مخزن از حساب GitHubت، اول وارد شو. گفتگوت سر جاش می‌مونه.</p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/login?redirect=${encodeURIComponent(returnTo)}`}>ورود با شماره موبایل</Link>
        </Button>
      </div>
    );
  }

  if (!status) return <div className="h-28 animate-pulse rounded-lg bg-surface-2" aria-label="در حال بررسی اتصال GitHub" />;

  // The server has no OAuth app yet: keep the old paste-a-link input so the path still works.
  if (!status.configured) {
    return (
      <label className="block">
        <span className="field-label">لینک مخزن GitHub</span>
        <input type="url" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} maxLength={2000} className="field py-3" placeholder="https://github.com/owner/repo" />
      </label>
    );
  }

  if (!status.connected) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-input bg-surface-2 p-5 text-center">
        {note}
        <IconBrandGithub size={28} className="text-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-bold text-foreground">حساب GitHubت رو وصل کن</p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">بعد از تایید در GitHub، مخزن‌هات (حتی خصوصی‌ها) اینجا لیست می‌شن و فقط انتخاب می‌کنی.</p>
        </div>
        <Button type="button" onClick={connect} disabled={busy}>
          <IconBrandGithub size={18} aria-hidden="true" />
          {busy ? "در حال انتقال به GitHub…" : "اتصال به GitHub"}
        </Button>
      </div>
    );
  }

  const header = (
    <div className="mb-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <IconBrandGithub size={15} aria-hidden="true" />
        متصل به <b dir="ltr" className="text-foreground">@{status.login}</b>
      </span>
      <button type="button" onClick={disconnect} disabled={busy} className="rounded font-bold outline-none hover:text-danger focus-visible:ring-2 focus-visible:ring-ring">
        قطع اتصال
      </button>
    </div>
  );

  if (value && !picking) {
    return (
      <div>
        {header}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-foreground bg-surface p-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <IconCheck size={18} className="shrink-0 text-success" aria-hidden="true" />
            <span dir="ltr" className="truncate text-sm font-bold text-foreground">{repoName(value)}</span>
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(true)}>تغییر</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {header}
      {note}
      <div className="relative mb-2">
        <IconSearch size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجوی مخزن…"
          aria-label="جستجوی مخزن"
          className="field py-2.5 pr-9"
        />
      </div>
      {busy && !repos ? (
        <div className="space-y-1.5" aria-label="در حال دریافت مخزن‌ها">
          {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-surface-2" />)}
        </div>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto" role="listbox" aria-label="مخزن‌های GitHub">
          {filtered.map((repo) => {
            const selected = repo.html_url === value;
            return (
              <li key={repo.full_name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { onChange(repo.html_url); setPicking(false); }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-right outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-foreground bg-surface" : "border-transparent hover:bg-surface-2"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span dir="ltr" className="flex items-center justify-end gap-1.5 text-sm font-bold text-foreground">
                      {repo.private && <IconLock size={13} className="text-muted-foreground" aria-label="خصوصی" />}
                      <span className="truncate">{repo.full_name}</span>
                    </span>
                    {repo.description && <span className="mt-0.5 block truncate text-xs text-muted-foreground" dir="auto">{repo.description}</span>}
                  </span>
                  {repo.language && <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 text-[11px] leading-5 text-muted-foreground" dir="ltr">{repo.language}</span>}
                </button>
              </li>
            );
          })}
          {repos && filtered.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">{repos.length ? "مخزنی با این اسم پیدا نشد." : "توی این حساب مخزنی پیدا نشد."}</li>
          )}
        </ul>
      )}
      <button
        type="button"
        onClick={() => void loadRepos()}
        disabled={busy}
        className="mt-2 flex items-center gap-1.5 rounded text-xs font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <IconRefresh size={14} aria-hidden="true" />
        به‌روزرسانی لیست
      </button>
    </div>
  );
}
