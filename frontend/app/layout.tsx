import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const yekanBakh = localFont({
  src: [
    { path: "./fonts/YekanBakhFaNum-Light.ttf", weight: "300 500", style: "normal" },
    { path: "./fonts/YekanBakhFaNum-Bold.ttf", weight: "600 700", style: "normal" },
    { path: "./fonts/YekanBakhFaNum-ExtraBold.ttf", weight: "800", style: "normal" },
    { path: "./fonts/YekanBakhFaNum-Black.ttf", weight: "900", style: "normal" },
    { path: "./fonts/YekanBakhFaNum-ExtraBlack.ttf", weight: "950", style: "normal" },
  ],
  variable: "--font-yekan",
  display: "swap",
  fallback: ["Tahoma", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "FreelioAI — دستیار هوشمند فریلنسرهای حرفه‌ای",
  description: "ویجت AI فارسی برای فریلنسرها — از intake مشتری تا تحویل پروژه",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaff" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0b10" },
  ],
};

// Applies the saved theme before first paint so there is no light/dark flash.
const themeScript = `(function(){try{var m=localStorage.getItem("theme_mode");var d=m==="dark"||(m!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className={yekanBakh.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
