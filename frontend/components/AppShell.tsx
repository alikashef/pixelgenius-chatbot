"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHelp, IconLogout, IconMenu2, IconX, type Icon } from "@tabler/icons-react";
import { BrandLogo } from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { PANELS, Role, signedInRoles } from "@/lib/api";
import { cn } from "@/lib/utils";

const ROLE_PREFIX: Record<Role, string> = { customer: "/panel", freelancer: "/freelancer", admin: "/admin" };

/** Lets an account with several roles hop between its panels; hidden when there is only one. */
function PanelSwitcher({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const [roles, setRoles] = useState<Role[]>([]);
  // The admin panel stays private and is never listed next to the others.
  useEffect(() => setRoles(signedInRoles().filter((role) => role !== "admin")), []);
  if (roles.length < 2) return null;
  return (
    <nav aria-label="پنل‌ها" className="px-3 pb-3">
      <div className="grid gap-1 rounded-lg bg-foreground/[0.05] p-1" style={{ gridTemplateColumns: `repeat(${roles.length}, minmax(0, 1fr))` }}>
        {roles.map((role) => {
          const active = pathname.startsWith(ROLE_PREFIX[role]);
          return (
            <Link
              key={role}
              href={PANELS[role].href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-8 items-center justify-center rounded-md px-1 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-surface text-foreground shadow-card" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {PANELS[role].label.replace("پنل ", "")}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export interface ShellNavItem {
  key: string;
  label: string;
  icon: Icon;
  href?: string;
  onSelect?: () => void;
  active?: boolean;
  count?: number;
  /** Items sharing a group are listed under that heading. */
  group?: string;
  /** Shown but not clickable, with a "coming soon" tag. */
  comingSoon?: boolean;
}

interface AppShellProps {
  nav: ShellNavItem[];
  /** Small caption under the logo, e.g. "پنل ادمین". */
  area?: string;
  /** Prominent action at the top of the sidebar (e.g. new project). */
  primaryAction?: ReactNode;
  user?: { name: string; detail?: string };
  onLogout?: () => void;
  /** Shows a help button that replays the onboarding tour. */
  onHelp?: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Controls placed beside the page title. */
  actions?: ReactNode;
  children: ReactNode;
  width?: "default" | "wide";
}

function NavLink({ item, onNavigate }: { item: ShellNavItem; onNavigate: () => void }) {
  if (item.comingSoon) {
    return (
      <span aria-disabled="true" className="flex min-h-10 w-full cursor-not-allowed select-none items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground/70">
        <item.icon size={19} stroke={1.8} aria-hidden="true" />
        <span className="flex-1 truncate text-right">{item.label}</span>
        <span className="rounded-full bg-brand-soft px-2 text-[11px] font-bold leading-5 text-brand">به‌زودی</span>
      </span>
    );
  }
  const className = cn(
    "flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    item.active
      ? "bg-foreground/[0.07] font-bold text-foreground"
      : "text-secondary-foreground hover:bg-foreground/5 hover:text-foreground"
  );
  const content = (
    <>
      <item.icon size={19} stroke={item.active ? 2.1 : 1.8} aria-hidden="true" className={item.active ? "text-brand" : "text-muted-foreground"} />
      <span className="flex-1 truncate text-right">{item.label}</span>
      {item.count ? (
        <span className="rounded-full bg-foreground/[0.07] px-2 text-[11px] font-bold leading-5 text-muted-foreground">
          {item.count.toLocaleString("fa-IR")}
        </span>
      ) : null}
    </>
  );
  if (item.href) {
    return (
      <Link href={item.href} onClick={onNavigate} aria-current={item.active ? "page" : undefined} data-tour={`nav-${item.key}`} className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        item.onSelect?.();
        onNavigate();
      }}
      aria-current={item.active ? "page" : undefined}
      data-tour={`nav-${item.key}`}
      className={className}
    >
      {content}
    </button>
  );
}

export default function AppShell({
  nav,
  area,
  primaryAction,
  user,
  onLogout,
  onHelp,
  title,
  description,
  actions,
  children,
  width = "default",
}: AppShellProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <BrandLogo size="sm" />
          {area && <span className="shrink-0 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{area}</span>}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="بستن منو"
          className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        >
          <IconX size={18} aria-hidden="true" />
        </button>
      </div>
      {primaryAction && <div className="px-3 pb-2" data-tour="new-project">{primaryAction}</div>}
      <nav aria-label="منوی اصلی" className="mt-3 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3">
        {nav.map((item, i) => (
          <div key={item.key}>
            {item.group && item.group !== nav[i - 1]?.group && (
              <p className={cn("eyebrow px-3 pb-1.5", i > 0 && "mt-5")}>{item.group}</p>
            )}
            <NavLink item={item} onNavigate={() => setOpen(false)} />
          </div>
        ))}
      </nav>
      <PanelSwitcher onNavigate={() => setOpen(false)} />
      <div className="border-t border-border p-3" data-tour="shell-footer">
        <div className="flex items-center gap-2">
          {user && (
            <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-black text-brand" aria-hidden="true">
                {user.name.trim().charAt(0) || "؟"}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-foreground">{user.name}</span>
                {user.detail && <span className="block truncate text-xs text-muted-foreground" dir="auto">{user.detail}</span>}
              </span>
            </div>
          )}
          {onHelp && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onHelp();
              }}
              aria-label="راهنمای پنل"
              title="راهنما"
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                !user && "ml-auto"
              )}
            >
              <IconHelp size={17} aria-hidden="true" />
            </button>
          )}
          <ThemeToggle className={user || onHelp ? "" : "ml-auto"} />
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="خروج از حساب"
              title="خروج"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:border-danger/40 hover:text-danger focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconLogout size={17} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-background lg:flex">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 border-l border-border bg-surface-2/60 lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="منو">
          <button type="button" aria-label="بستن منو" className="absolute inset-0 bg-overlay/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 right-0 w-[min(18rem,86vw)] border-l border-border bg-background shadow-elevated animate-in slide-in-from-right duration-200">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border px-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="باز کردن منو"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconMenu2 size={20} aria-hidden="true" />
          </button>
          <BrandLogo size="sm" />
          <ThemeToggle className="mr-auto" />
        </header>

        <main className={cn("mx-auto px-4 py-8 sm:px-8 lg:py-12", width === "wide" ? "max-w-6xl" : "max-w-4xl")}>
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-[1.75rem]">{title}</h1>
              {description && <p className="mt-2 max-w-xl text-sm leading-7 text-muted-foreground">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

/** Full-height centered spinner used while a shell page loads its data. */
export function ShellLoading() {
  return (
    <div role="status" aria-label="در حال بارگذاری" className="flex min-h-[100dvh] items-center justify-center bg-background">
      <span className="h-8 w-8 rounded-full border-[3px] border-foreground/15 border-t-brand-solid motion-safe:animate-spin" />
    </div>
  );
}
