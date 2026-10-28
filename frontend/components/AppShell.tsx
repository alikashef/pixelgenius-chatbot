"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import {
  IconBrush, IconClipboardList, IconHelp, IconLayoutDashboard, IconLayoutGrid, IconLogout, IconMenu2, IconMessage, IconPlugConnected, IconReceipt, IconWorld,
  IconSchool, IconSettings, IconWand, IconX, type Icon,
  IconBriefcase, IconArrowRight,
} from "@tabler/icons-react";
import { BrandLogo } from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { Role, signedInRoles } from "@/lib/api";
import { cn } from "@/lib/utils";

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

type CustomerTab = "design" | "sites" | "connect" | "orders" | "chats" | "account";

// One sidebar for every signed-in account: its sections follow the account's permissions.
const CUSTOMER_NAV: (Omit<ShellNavItem, "key"> & { key: CustomerTab | "templates" })[] = [
  { key: "design", group: "طراحی محصول", label: "پروژه‌های طراحی", icon: IconWand },
  { key: "sites", group: "طراحی محصول", label: "سایت‌ها و دامنه", icon: IconWorld },
  { key: "connect", group: "طراحی محصول", label: "اتصال به هوش مصنوعی", icon: IconPlugConnected },
  { key: "templates", group: "طراحی محصول", label: "سایت‌های آماده", icon: IconLayoutGrid, comingSoon: true },
  { key: "orders", group: "فروش", label: "سفارش‌ها", icon: IconClipboardList },
];
const FREELANCER_NAV: ShellNavItem[] = [
  { key: "freelancer-dashboard", group: "فریلنسر", label: "درخواست‌های مشتری‌ها", icon: IconLayoutDashboard, href: "/freelancer/dashboard" },
  { key: "freelancer-widget", group: "فریلنسر", label: "ظاهر و نصب ویجت", icon: IconBrush, href: "/freelancer/widget" },
  { key: "freelancer-settings", group: "فریلنسر", label: "آموزش دستیار", icon: IconSchool, href: "/freelancer/settings" },
];
const ACCOUNT_NAV: (Omit<ShellNavItem, "key"> & { key: CustomerTab })[] = [
  { key: "chats", group: "حساب کاربری", label: "گفتگوهای ناتمام", icon: IconMessage },
  { key: "account", group: "حساب کاربری", label: "تنظیمات حساب", icon: IconSettings },
];
const PRICING_NAV: ShellNavItem = { key: "pricing", group: "حساب کاربری", label: "تعرفه‌ها", icon: IconReceipt, href: "/pricing" };

type Section = { id: string; label: string; icon: Icon; href: string; role: Role };

// The main page lists only these sections (the account opens from its footer); each section's page lists its own links.
const SECTIONS: Section[] = [
  { id: "طراحی محصول", label: "طراحی محصول", icon: IconWand, href: "/account?tab=design", role: "customer" },
  { id: "فروش", label: "فروش", icon: IconClipboardList, href: "/account?tab=orders", role: "customer" },
  { id: "فریلنسر", label: "فریلنسر", icon: IconBriefcase, href: "/freelancer/dashboard", role: "freelancer" },
];

function useRoles() {
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => setRoles(signedInRoles()), []);
  return roles;
}

/**
 * Sidebar links of the section the current page belongs to. Customer links switch /account tabs
 * (in place when onCustomerTab is given); the freelancer section exists only with that permission.
 */
export function useAccountNav({
  active,
  counts = {},
  onCustomerTab,
}: {
  active: string;
  counts?: Partial<Record<string, number>>;
  onCustomerTab?: (tab: CustomerTab) => void;
}): ShellNavItem[] {
  const roles = useRoles();
  const customerItem = ({ key, ...item }: Omit<ShellNavItem, "key"> & { key: CustomerTab | "templates" }): ShellNavItem => ({
    ...item,
    key,
    active: active === key,
    count: counts[key],
    ...(item.comingSoon || key === "templates"
      ? {}
      : onCustomerTab
        ? { onSelect: () => onCustomerTab(key) }
        : { href: `/account?tab=${key}` }),
  });
  const customer = roles.includes("customer");
  const all = [
    ...(customer ? CUSTOMER_NAV.map(customerItem) : []),
    ...(roles.includes("freelancer") ? FREELANCER_NAV.map((item) => ({ ...item, active: active === item.key, count: counts[item.key] })) : []),
    ...(customer ? ACCOUNT_NAV.map(customerItem) : []),
    ...(roles.length ? [{ ...PRICING_NAV, active: active === "pricing" }] : []),
  ];
  const section = all.find((item) => item.key === active)?.group;
  return section ? all.filter((item) => item.group === section) : [];
}

/** The main page's sidebar: one link per section the account may open. */
export function useSectionLinks(counts: Partial<Record<string, number>> = {}): ShellNavItem[] {
  const roles = useRoles();
  return SECTIONS.filter((section) => roles.includes(section.role)).map((section) => ({
    key: `section-${section.id}`,
    label: section.label,
    icon: section.icon,
    href: section.href,
    count: counts[section.id],
  }));
}

/** The primary button at the top of the panel sidebar: back to the chat. */
export function NewProjectLink() {
  return (
    <Link
      href="/chat"
      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <IconMessage size={17} stroke={2.2} aria-hidden="true" />
      گفتگو
    </Link>
  );
}

interface AppShellProps {
  nav: ShellNavItem[];
  /** Prominent action at the top of the sidebar (e.g. new project). */
  primaryAction?: ReactNode;
  /** Shows a "back" link at the top of the sidebar, e.g. to the main page from a section. */
  backHref?: string;
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

function NavLink({ item, onNavigate, dense }: { item: ShellNavItem; onNavigate: () => void; dense?: boolean }) {
  if (item.comingSoon) {
    return (
      <span aria-disabled="true" className={`flex w-full ${dense ? "min-h-9" : "min-h-10"} cursor-not-allowed select-none items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground/70`}>
        <item.icon size={19} stroke={1.8} aria-hidden="true" />
        <span className="flex-1 truncate text-right">{item.label}</span>
        <span className="rounded-full bg-accent-soft px-2 text-[11px] font-bold leading-5 text-accent">به‌زودی</span>
      </span>
    );
  }
  const className = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    dense ? "min-h-9" : "min-h-10",
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

/** Sidebar links under their group headings; shared by the panels and the chat sidebar. */
export function NavGroups({ nav, onNavigate, dense }: { nav: ShellNavItem[]; onNavigate: () => void; dense?: boolean }) {
  return (
    <div className="space-y-0.5">
      {nav.map((item, i) => (
        <div key={item.key}>
          {item.group && item.group !== nav[i - 1]?.group && (
            <p className={cn("eyebrow px-3 pb-1.5", i > 0 && (dense ? "mt-4" : "mt-5"))}>{item.group}</p>
          )}
          <NavLink item={item} onNavigate={onNavigate} dense={dense} />
        </div>
      ))}
    </div>
  );
}

export default function AppShell({
  nav,
  primaryAction,
  backHref,
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
      {backHref && (
        <div className="px-3 pb-2">
          <Link
            href={backHref}
            onClick={() => setOpen(false)}
            className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold text-secondary-foreground outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconArrowRight size={17} aria-hidden="true" />
            بازگشت
          </Link>
        </div>
      )}
      {primaryAction && <div className="px-3 pb-2" data-tour="new-project">{primaryAction}</div>}
      <nav aria-label="منوی اصلی" className="mt-3 min-h-0 flex-1 overflow-y-auto px-3">
        <NavGroups nav={nav} onNavigate={() => setOpen(false)} />
      </nav>
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
