import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata: Metadata = {
  title: "مشاور پروژه | سفارش وب‌سایت",
  description: "سفارش طراحی وب‌سایت با مشاور هوشمند",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>
        {children}
        <ThemeToggle />
      </body>
    </html>
  );
}
