"use client";

import { useEffect, useState } from "react";
import { IconDeviceDesktop, IconMoon, IconSun } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "theme_mode";
const ORDER: ThemeMode[] = ["light", "dark", "system"];
const LABELS: Record<ThemeMode, string> = { light: "روشن", dark: "تیره", system: "سیستم" };
const ICONS = { light: IconSun, dark: IconMoon, system: IconDeviceDesktop };

function readMode(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // storage blocked
  }
  return "system";
}

function applyMode(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export default function ThemeToggle({ className, variant = "icon" }: { className?: string; variant?: "icon" | "segmented" }) {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMode(readMode());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyMode(mode);
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [mode, mounted]);

  function choose(next: ThemeMode) {
    setMode(next);
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage blocked: theme still applies for this visit
    }
  }

  if (variant === "segmented") {
    return (
      <div role="radiogroup" aria-label="حالت نمایش" className={cn("inline-flex rounded-xl border border-border bg-surface-2 p-1", className)}>
        {ORDER.map((item) => {
          const Icon = ICONS[item];
          const active = mounted && mode === item;
          return (
            <button
              key={item}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(item)}
              className={cn(
                "flex min-h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-surface text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={15} stroke={2} aria-hidden="true" />
              {LABELS[item]}
            </button>
          );
        })}
      </div>
    );
  }

  const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
  const Icon = ICONS[mounted ? mode : "system"];

  return (
    <button
      type="button"
      onClick={() => choose(next)}
      aria-label={`حالت نمایش: ${LABELS[mode]} — تغییر به ${LABELS[next]}`}
      title={`حالت نمایش: ${LABELS[mode]}`}
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border bg-surface text-muted-foreground outline-none transition-colors hover:border-primary-line hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Icon size={17} stroke={2} aria-hidden="true" />
    </button>
  );
}
