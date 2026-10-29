import Link from "next/link";
import { BrandLogo } from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";

export interface LegalSection {
  title: string;
  body: string[];
}

/** A plain document page (privacy policy, terms) with the brand header; server-rendered and public. */
export default function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4">
          <BrandLogo size="sm" />
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-black text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">آخرین به‌روزرسانی: {updated}</p>
        <p className="mt-6 text-[15px] leading-8 text-secondary-foreground">{intro}</p>
        <div className="mt-10 space-y-9">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-black text-foreground">{section.title}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-8 text-secondary-foreground">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <nav aria-label="صفحات حقوقی" className="mt-14 flex gap-5 border-t border-border pt-6 text-sm font-bold">
          <Link href="/privacy" className="text-secondary-foreground hover:text-foreground">حریم خصوصی</Link>
          <Link href="/terms" className="text-secondary-foreground hover:text-foreground">شرایط استفاده</Link>
          <Link href="/" className="mr-auto text-secondary-foreground hover:text-foreground">بازگشت به سایت</Link>
        </nav>
      </main>
    </div>
  );
}
