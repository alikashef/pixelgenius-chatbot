"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { IconArrowLeft, IconArrowRight, IconPlayerPlay, IconVolume, IconVolumeOff, IconX } from "@tabler/icons-react";
import type { RobotHeadState } from "robot-heads";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import TOURS from "@/lib/tours.json";

export type TourId = keyof typeof TOURS;

interface TourStep {
  id: string;
  target?: string;
  title: string;
  text: string;
}

const RobotHead = dynamic(() => import("robot-heads").then((module) => module.RobotHead), {
  ssr: false,
  loading: () => <span className="block h-16 w-16" />,
});

// The guide is the chat robot's sibling: a round saffron head, so it reads as "the tour" rather than the chat.
const GUIDE_COLORS = { color: "#f28c28", trimColor: "#36312b", screenColor: "#fff1df" };

const DONE_KEY = (tour: TourId) => `tour_done_${tour}`;
const MUTE_KEY = "tour_voice_muted";
const START_EVENT = "pixelgenius:start-tour";
const PAD = 8;

/** Opens a tour from anywhere, e.g. a help button. */
export function startTour(tour: TourId) {
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail: tour }));
}

function findTarget(name?: string): HTMLElement | null {
  if (!name) return null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`));
  return nodes.find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility !== "hidden";
  }) || null;
}

let manifestPromise: Promise<Record<string, string>> | null = null;
function loadManifest() {
  manifestPromise ??= fetch("/audio/tour/manifest.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}));
  return manifestPromise;
}

export default function GuidedTour({ tour, autoStart = true }: { tour: TourId; autoStart?: boolean }) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioFiles, setAudioFiles] = useState<Record<string, string>>({});
  const audio = useRef<HTMLAudioElement | null>(null);
  const card = useRef<HTMLDivElement>(null);

  const begin = useCallback(() => {
    // Steps whose section is not on screen (e.g. the sidebar on mobile) are left out.
    const visible = (TOURS[tour] as TourStep[]).filter((step) => !step.target || findTarget(step.target));
    setSteps(visible);
    setIndex(0);
    setOpen(true);
  }, [tour]);

  const close = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setSpeaking(false);
    setOpen(false);
    try {
      localStorage.setItem(DONE_KEY(tour), "1");
    } catch {
      // storage blocked: the tour may show again next visit
    }
  }, [tour]);

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === "1");
    } catch {
      // storage blocked
    }
    loadManifest().then(setAudioFiles);
    const onStart = (e: Event) => (e as CustomEvent<TourId>).detail === tour && begin();
    window.addEventListener(START_EVENT, onStart);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (autoStart) {
      let done = false;
      try {
        done = localStorage.getItem(DONE_KEY(tour)) === "1";
      } catch {
        done = true;
      }
      if (!done) timer = setTimeout(begin, 900);
    }
    return () => {
      window.removeEventListener(START_EVENT, onStart);
      if (timer) clearTimeout(timer);
    };
  }, [tour, autoStart, begin]);

  const step = open ? steps[index] : undefined;

  // Track the highlighted section through scrolling and resizing.
  useLayoutEffect(() => {
    if (!step) return;
    const target = findTarget(step.target);
    if (!target) {
      setRect(null);
      return;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setRect(target.getBoundingClientRect()));
    };
    measure();
    const settle = setTimeout(measure, 400);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settle);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  const play = useCallback(() => {
    audio.current?.pause();
    audio.current = null;
    setSpeaking(false);
    if (!step) return;
    const file = audioFiles[`${tour}/${step.id}`];
    if (!file) return;
    const voice = new Audio(`/audio/tour/${file}`);
    audio.current = voice;
    voice.onplay = () => audio.current === voice && setSpeaking(true);
    voice.onended = voice.onpause = () => audio.current === voice && setSpeaking(false);
    voice.play().catch(() => setSpeaking(false));
  }, [step, audioFiles, tour]);

  useEffect(() => {
    if (!step || muted) return;
    play();
    return () => {
      audio.current?.pause();
    };
  }, [step, muted, play]);

  useEffect(() => {
    if (open) card.current?.focus();
  }, [open, index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      // RTL: the left arrow moves forward.
      if (e.key === "ArrowLeft") setIndex((i) => Math.min(i + 1, steps.length - 1));
      if (e.key === "ArrowRight") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, close]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (next) {
      audio.current?.pause();
      setSpeaking(false);
    }
    try {
      if (next) localStorage.setItem(MUTE_KEY, "1");
      else localStorage.removeItem(MUTE_KEY);
    } catch {
      // storage blocked
    }
  }

  if (!open || !step) return null;

  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const hasAudio = Boolean(audioFiles[`${tour}/${step.id}`]);
  const robotState: RobotHeadState = speaking ? "speaking" : isLast ? "happy" : "idle";

  // Card placement: below the section when there is room, otherwise above; centred when nothing is highlighted.
  const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
  const vh = typeof window !== "undefined" ? window.innerHeight : 768;
  const width = Math.min(380, vw - 32);
  const mobile = vw < 640;
  let style: React.CSSProperties = {};
  if (rect && !mobile) {
    // Narrow targets in the (right-hand) sidebar get the card beside them so the rest of the menu stays visible.
    const inSidebar = rect.width < 320 && rect.left > vw * 0.6 && rect.left - width - 24 > 16;
    if (inSidebar) {
      style = { top: Math.min(Math.max(rect.top - 16, 16), vh - 340), left: rect.left - width - PAD - 16, width };
    } else {
      const below = vh - rect.bottom > 300;
      const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 16), vw - width - 16);
      style = below ? { top: rect.bottom + PAD + 12, left, width } : { bottom: vh - rect.top + PAD + 12, left, width };
    }
  }

  return (
    <div className="fixed inset-0 z-[80]" role="presentation">
      {rect ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed rounded-xl transition-all duration-300 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 2px hsl(var(--brand-solid)), 0 0 0 9999px hsl(var(--overlay) / 0.6)",
          }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 bg-overlay/60" />
      )}
      {/* Blocks clicks on the page underneath while the tour is open. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div className={cn("pointer-events-none fixed inset-0", !rect && !mobile && "flex items-center justify-center p-4")}>
        <div
          ref={card}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          aria-describedby="tour-text"
          tabIndex={-1}
          style={style}
          className={cn(
            "pointer-events-auto rounded-2xl border border-border bg-surface p-5 shadow-elevated outline-none animate-fade-up",
            mobile
              ? "fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)]"
              : rect
                ? "fixed"
                : "w-full max-w-[400px]"
          )}
          key={step.id}
        >
          <div className="flex items-start gap-3">
            <div className="-mt-1 shrink-0" aria-hidden="true">
              <RobotHead shape="circle" state={robotState} size={64} antenna={false} floorShadow={false} interactive={false} {...GUIDE_COLORS} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-muted-foreground">
                {(index + 1).toLocaleString("fa-IR")} از {steps.length.toLocaleString("fa-IR")}
              </p>
              <h2 id="tour-title" className="mt-0.5 text-base font-black text-foreground">{step.title}</h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="بستن تور"
              className="-mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <IconX size={17} aria-hidden="true" />
            </button>
          </div>

          <p id="tour-text" className="mt-3 text-sm leading-7 text-secondary-foreground">{step.text}</p>

          <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.id} className={cn("h-1.5 rounded-full transition-all", i === index ? "w-5 bg-brand-solid" : "w-1.5 bg-foreground/15")} />
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 border-t border-border pt-4">
            {hasAudio && (
              <>
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-pressed={!muted}
                  aria-label={muted ? "روشن کردن صدای راهنما" : "خاموش کردن صدای راهنما"}
                  className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {muted ? <IconVolumeOff size={17} aria-hidden="true" /> : <IconVolume size={17} aria-hidden="true" />}
                </button>
                {!muted && !speaking && (
                  <button
                    type="button"
                    onClick={play}
                    aria-label="پخش دوباره"
                    className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <IconPlayerPlay size={16} aria-hidden="true" />
                  </button>
                )}
              </>
            )}
            <div className="mr-auto flex items-center gap-2">
              {isFirst ? (
                <Button variant="ghost" size="sm" onClick={close}>بعداً</Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => setIndex(index - 1)} aria-label="مرحله قبل">
                  <IconArrowRight size={16} aria-hidden="true" />
                  قبلی
                </Button>
              )}
              {isLast ? (
                <Button variant="brand" size="sm" onClick={close}>شروع کنیم</Button>
              ) : (
                <Button size="sm" onClick={() => setIndex(index + 1)}>
                  {isFirst ? "شروع تور" : "بعدی"}
                  <IconArrowLeft size={16} aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
