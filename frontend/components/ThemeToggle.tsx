"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";

  const saved = window.localStorage.getItem("theme_mode");
  if (saved === "light" || saved === "dark") return saved;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem("theme_mode", nextTheme);
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle fixed bottom-5 left-5 z-[60] rounded-2xl px-4 py-2 text-xs font-bold shadow-lg backdrop-blur transition hover:-translate-y-0.5"
      aria-label={theme === "light" ? "فعال‌سازی دارک مود" : "فعال‌سازی لایت مود"}
    >
      {theme === "light" ? "🌙 دارک مود" : "☀️ لایت مود"}
    </button>
  );
}
