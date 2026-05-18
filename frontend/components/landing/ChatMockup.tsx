export default function ChatMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg">
      {/* glow behind the card */}
      <div className="absolute inset-0 rounded-3xl bg-[--violet-glow] blur-3xl animate-glow-pulse" />

      <div className="relative overflow-hidden rounded-3xl border border-[--violet-border] bg-[--surface] shadow-2xl shadow-black/40">
        {/* browser bar */}
        <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
          <span className="mr-auto rounded-full bg-white/5 px-3 py-1 text-xs text-[hsl(var(--muted-foreground))]">
            yoursite.ir
          </span>
        </div>

        {/* chat messages */}
        <div className="space-y-3 p-5">
          <div className="flex gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[--violet] text-xs font-bold text-white">
              AI
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[--surface-2] px-4 py-3 text-sm leading-7 text-[hsl(var(--foreground))]">
              سلام! من دستیار هوشمند شما هستم. پروژه‌تون رو برام توضیح بدید تا بهتر کمکتون کنم.
            </div>
          </div>

          <div className="flex justify-start pr-10">
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[--violet] px-4 py-3 text-sm leading-7 text-white">
              یه اپ فروشگاهی می‌خوام با پرداخت آنلاین و پنل مدیریت.
            </div>
          </div>

          <div className="flex gap-3">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[--violet] text-xs font-bold text-white">
              AI
            </span>
            <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[--surface-2] px-4 py-3 text-sm leading-7 text-[hsl(var(--foreground))]">
              عالیه! تعداد محصولات چقدره و نیاز به اپ موبایل هم دارید؟
            </div>
          </div>

          {/* typing indicator */}
          <div className="flex justify-start pr-10">
            <div className="rounded-2xl rounded-tl-sm bg-[--violet]/20 px-4 py-3">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        </div>

        {/* proposal preview */}
        <div className="border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">پیشنهاد اولیه</span>
            <span className="rounded-full bg-[--violet-glow] border border-[--violet-border] px-2.5 py-0.5 text-xs font-semibold text-violet-300">
              در حال آماده‌سازی...
            </span>
          </div>
          <div className="space-y-2">
            {[
              "فروشگاه آنلاین + پرداخت",
              "پنل مدیریت محصولات",
              "اپ موبایل (iOS & Android)",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-violet-400" />
                <span className="text-xs text-[hsl(var(--muted-foreground))]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
