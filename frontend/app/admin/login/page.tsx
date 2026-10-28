"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconLogin2 } from "@tabler/icons-react";
import { adminLogin } from "@/lib/api";
import AuthLayout from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";

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
    <AuthLayout variant="admin" title="ورود به پنل ادمین" description="دسترسی امن برای مدیریت سفارش‌ها، تنظیمات AI و انتشارها.">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="admin-username" className="field-label">نام کاربری</label>
          <input id="admin-username" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required dir="ltr" className="field min-h-12 text-left" />
        </div>
        <div>
          <label htmlFor="admin-password" className="field-label">رمز عبور</label>
          <input id="admin-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" className="field min-h-12 text-left" />
        </div>
        {error && <p role="alert" className="rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <Button type="submit" disabled={loading} className="h-12 w-full">
          <IconLogin2 size={18} aria-hidden="true" />
          {loading ? "در حال ورود..." : "ورود"}
        </Button>
      </form>
    </AuthLayout>
  );
}
