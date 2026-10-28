import Link from "next/link";
import { IconSparkles } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center gap-2.5 font-black text-foreground">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <IconSparkles size={19} stroke={2.2} />
          </span>
          <span>
            Freelio
            <span className="text-brand">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <Link href="#features" className="transition-colors hover:text-foreground">ویژگی‌ها</Link>
          <Link href="#how" className="transition-colors hover:text-foreground">نحوه کار</Link>
          <Link href="#pricing" className="transition-colors hover:text-foreground">قیمت‌گذاری</Link>
        </nav>

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">ورود</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">شروع رایگان</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
