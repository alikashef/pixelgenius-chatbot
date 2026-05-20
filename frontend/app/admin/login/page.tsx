"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconLock, IconLogin2, IconShieldLock } from "@tabler/icons-react";
import { adminLogin } from "@/lib/api";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await adminLogin(username, password);
      localStorage.setItem("admin_token", data.access_token);
      router.push("/admin/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ورود");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[hsl(var(--background))] p-4">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-70" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,rgba(124,58,237,0.22),transparent)]" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[hsl(var(--border))] bg-[--surface] p-7 shadow-2xl shadow-black/40">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-[--violet-border] bg-[--violet-glow] text-violet-300 shadow-lg shadow-[--violet-glow]">
            <IconShieldLock size={24} />
          </div>
          <h1 className="text-xl font-black text-[hsl(var(--foreground))]">ورود به پنل ادمین</h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">دسترسی امن برای مدیریت سفارش‌ها و تنظیمات AI</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">نام کاربری</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-[--violet-border]"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold text-[hsl(var(--muted-foreground))]">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 text-sm text-[hsl(var(--foreground))] outline-none transition-colors focus:border-[--violet-border]"
            />
          </div>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[--violet] py-3 text-sm font-bold text-white shadow-lg shadow-[--violet-glow] transition-all hover:bg-violet-700 disabled:opacity-60"
          >
            {loading ? <IconLock size={18} /> : <IconLogin2 size={18} />}
            {loading ? "در حال ورود..." : "ورود"}
          </button>
        </form>
      </div>
    </div>
  );
}
