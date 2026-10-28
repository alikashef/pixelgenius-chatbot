"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconLock, IconLogin2, IconShieldLock } from "@tabler/icons-react";
import { adminLogin } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

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
    <div className="relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden bg-background bg-aura px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <ThemeToggle className="absolute left-4 top-4 z-10" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-border bg-surface p-7 shadow-elevated">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl border border-primary-line bg-primary-soft text-brand shadow-md shadow-primary/25">
            <IconShieldLock size={24} />
          </div>
          <h1 className="text-xl font-black text-foreground">ورود به پنل ادمین</h1>
          <p className="mt-2 text-sm text-muted-foreground">دسترسی امن برای مدیریت سفارش‌ها و تنظیمات AI</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="field-label">نام کاربری</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="field px-4 py-3"
            />
          </div>
          <div>
            <label className="field-label">رمز عبور</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="field px-4 py-3"
            />
          </div>

          {error && <p className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-center text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary-hover disabled:opacity-60"
          >
            {loading ? <IconLock size={18} /> : <IconLogin2 size={18} />}
            {loading ? "در حال ورود..." : "ورود"}
          </button>
        </form>
      </div>
    </div>
  );
}
