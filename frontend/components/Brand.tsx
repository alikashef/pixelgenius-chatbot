import Link from "next/link";
import { cn } from "@/lib/utils";

const MARK_SIZES = { sm: "h-8 w-8 rounded-[10px]", md: "h-9 w-9 rounded-[11px]", lg: "h-12 w-12 rounded-2xl" };

/** Saffron speech bubble holding an "F" — the FreelioAI monogram. */
export function BrandMark({ size = "md", className }: { size?: keyof typeof MARK_SIZES; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center bg-brand-solid text-brand-foreground", MARK_SIZES[size], className)}>
      <svg viewBox="0 0 24 24" className="h-[58%] w-[58%]" fill="none">
        <path
          d="M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7.2L7.4 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path d="M9.5 8.5h6M9.5 8.5v5M9.5 11h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span dir="ltr" className={cn("text-[17px] font-black tracking-tight text-foreground", className)}>
      Freelio<span className="text-brand">AI</span>
    </span>
  );
}

export function BrandLogo({
  href = "/",
  size = "md",
  hideWordmarkOnMobile = false,
  className,
}: {
  href?: string;
  size?: keyof typeof MARK_SIZES;
  hideWordmarkOnMobile?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="FreelioAI، صفحه اصلی"
      className={cn("flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
    >
      <BrandMark size={size} />
      <BrandWordmark className={hideWordmarkOnMobile ? "hidden sm:inline" : undefined} />
    </Link>
  );
}
