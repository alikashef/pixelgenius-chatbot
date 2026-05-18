import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FreelioAI — دستیار هوشمند فریلنسرهای حرفه‌ای",
  description: "ویجت AI فارسی برای فریلنسرها — از intake مشتری تا تحویل پروژه",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
