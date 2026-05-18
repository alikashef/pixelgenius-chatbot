import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";

const LINKS = {
  محصول: [
    { label: "ویژگی‌ها", href: "#features" },
    { label: "قیمت‌گذاری", href: "#pricing" },
    { label: "نحوه کار", href: "#how" },
    { label: "دمو", href: "#demo" },
  ],
  شرکت: [
    { label: "درباره ما", href: "/about" },
    { label: "تماس", href: "/contact" },
    { label: "وبلاگ", href: "/blog" },
  ],
  حقوقی: [
    { label: "حریم خصوصی", href: "/privacy" },
    { label: "شرایط استفاده", href: "/terms" },
  ],
};

export default function Footer() {
  return (
    <footer className="border-t border-[hsl(var(--border))]">
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          {/* brand */}
          <div>
            <Link href="/" className="flex items-center gap-2.5 font-black text-white">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[--violet]">
                <IconSparkles size={18} stroke={2.2} />
              </span>
              <span>
                Freelio<span className="text-gradient">AI</span>
              </span>
            </Link>
            <p className="mt-4 max-w-xs text-sm leading-7 text-[hsl(var(--muted-foreground))]">
              دستیار هوشمند فریلنسرهای حرفه‌ای ایران.
              از intake تا تحویل، همه روی برند خودت.
            </p>
          </div>

          {/* link groups */}
          {Object.entries(LINKS).map(([group, links]) => (
            <div key={group}>
              <p className="mb-4 text-sm font-bold text-white">{group}</p>
              <ul className="space-y-3">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-[hsl(var(--border))] pt-8 text-xs text-[hsl(var(--muted-foreground))] md:flex-row">
          <p>© ۱۴۰۴ FreelioAI — تمام حقوق محفوظ است.</p>
          <p>ساخته شده با ❤️ در ایران</p>
        </div>
      </div>
    </footer>
  );
}
