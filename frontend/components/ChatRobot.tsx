"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { RobotHeadShape, RobotHeadState } from "robot-heads";
import type { ChatProgressStage } from "@/lib/api";
import { IconVolume, IconVolumeOff } from "@tabler/icons-react";

export const ROBOT_INTRODUCTIONS = {
  designer: "سلام! برای اینکه بهتر کمکت کنم، بگو چی می‌خوای بسازی، برای چه کسانیه و چه مشکلی رو حل می‌کنه. امکانات مهم رو به ترتیب اولویت بگو؛ مثلاً کاربر چطور ثبت‌نام می‌کنه یا سفارش می‌ده. اگر طرح، نمونه‌سایت یا فایلی داری، پیوست کن. لازم نیست فنی حرف بزنی یا همه‌چیز رو از اول بدونی؛ من قدم‌به‌قدم سؤال می‌پرسم. حالا با ایده و هدف پروژه‌ات شروع کن.",
  source: "سلام! برای آماده‌کردن پروژه‌ات برای انتشار، لینک گیت‌هاب یا فایل زیپ سورس رو بفرست. بگو پروژه چه کاری انجام می‌ده، با چه ابزارهایی ساخته شده و چطور اجرا می‌شه. اگر دیتابیس داره یا الان با خطایی روبه‌رو می‌شی، توضیح بده. لازم نیست همه جزئیات رو بدونی؛ من قدم‌به‌قدم سؤال می‌پرسم. حالا با معرفی پروژه‌ات شروع کن.",
  sales: "سلام! برای اینکه بهتر راهنمایی‌ات کنم، بگو چه سایت یا اپلیکیشنی می‌خوای، برای چه کسانیه و چه مشکلی رو حل می‌کنه. امکانات ضروری رو به ترتیب اولویت بگو. اگر نمونه یا فایلی داری، پیوست کن؛ بودجه تقریبی و زمانی که می‌خوای پروژه آماده بشه رو هم بگو. لازم نیست فنی حرف بزنی؛ من جزئیات رو قدم‌به‌قدم ازت می‌پرسم. حالا با ایده و هدف پروژه‌ات شروع کن.",
};

function robotSpeechUrl(label: string) {
  const key = label.split("").reduce(
    (hash, character) => Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0,
    2166136261,
  );
  return `/audio/robot/${key.toString(16)}.mp3`;
}

const RobotHead = dynamic(
  () => import("robot-heads").then((module) => module.RobotHead),
  {
    ssr: false,
    loading: () => <span className="block h-[176px] w-[176px]" />,
  },
);

interface RobotActivity {
  busy: boolean;
  stage: ChatProgressStage | null;
  uploading: boolean;
  sendingOtp: boolean;
  preparingBrief: boolean;
  failed: boolean;
  typing: boolean;
  waitingForPhone: boolean;
  idleSeconds: number;
  requestSeconds: number;
  replySeconds: number | null;
  completionSeconds: number | null;
}

export function deriveRobotMood(activity: RobotActivity): {
  state: RobotHeadState;
  label: string;
} {
  if (activity.failed)
    return { state: "error", label: "مشکلی پیش آمد؛ می‌توانی دوباره تلاش کنی" };
  if (activity.uploading)
    return { state: "working", label: "در حال دریافت فایل تو" };
  if (activity.sendingOtp)
    return { state: "working", label: "در حال درخواست کد ورود" };
  if (activity.preparingBrief)
    return { state: "working", label: "دارم کانفیگ پروژه‌ات را آماده می‌کنم" };
  if (activity.busy) {
    if (activity.stage === "searching")
      return {
        state: "searching",
        label: "دارم در اطلاعات پروژه جست‌وجو می‌کنم",
      };
    if (activity.stage === "working")
      return {
        state: "working",
        label: "دارم فایل‌ها و اطلاعات را بررسی می‌کنم",
      };
    return {
      state: "thinking",
      label:
        activity.requestSeconds >= 20
          ? "پاسخ کمی طول کشیده؛ هنوز منتظر نتیجه‌ام"
          : "دارم به پیامت فکر می‌کنم",
    };
  }
  if (activity.typing && activity.idleSeconds < 12)
    return { state: "listening", label: "آماده‌ام؛ پیامت را بنویس" };
  if (activity.completionSeconds !== null && activity.completionSeconds < 6)
    return { state: "happy", label: "کانفیگ پروژه‌ات آماده شد!" };
  if (activity.replySeconds !== null && activity.replySeconds < 4)
    return { state: "speaking", label: "پاسخم آماده‌ست؛ پایین بخوان" };
  if (activity.replySeconds !== null && activity.replySeconds < 7)
    return { state: "happy", label: "خب، قدم بعدی را با هم جلو ببریم" };
  if (activity.idleSeconds >= 90)
    return {
      state: "sleeping",
      label: "کمی استراحت می‌کنم؛ هر وقت آماده‌ای برگرد",
    };
  if (activity.waitingForPhone)
    return { state: "listening", label: "منتظر شماره موبایلت هستم" };
  return {
    state: "idle",
    label:
      activity.idleSeconds >= 35
        ? "هر وقت آماده‌ای، من اینجام"
        : "من اینجام؛ ادامه بده",
  };
}

export default function ChatRobot({
  busy,
  stage,
  uploading,
  sendingOtp,
  briefState,
  failed,
  input,
  replyKey,
  waitingForPhone,
  introduction,
  shape = "rectangle",
  robotColors,
  voiceAvailable = true,
  plain = false,
}: {
  busy: boolean;
  stage: ChatProgressStage | null;
  uploading: boolean;
  sendingOtp: boolean;
  briefState: "idle" | "loading" | "ready" | "error";
  failed: boolean;
  input: string;
  replyKey: string;
  waitingForPhone: boolean;
  introduction?: string;
  shape?: RobotHeadShape;
  /** Hex colors for a freelancer-branded robot; defaults to the PixelGenius ink/saffron robot. */
  robotColors?: { color: string; trimColor: string; screenColor: string };
  /** False when the bot owner turned voice off: nothing plays and the voice button is hidden. */
  voiceAvailable?: boolean;
  /** Drop the sticky strip background, for a robot shown inline in the page. */
  plain?: boolean;
}) {
  const [clock, setClock] = useState(() => Date.now());
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceError, setVoiceError] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const voice = useRef<HTMLAudioElement | null>(null);
  const [colors, setColors] = useState<{
    color?: string;
    trimColor?: string;
    screenColor?: string;
  }>({});
  const activityAt = useRef(Date.now());
  const requestAt = useRef(Date.now());
  const replyAt = useRef<number | null>(null);
  const completedAt = useRef<number | null>(null);
  const previousReply = useRef(replyKey);
  const previousBrief = useRef(briefState);

  useEffect(() => {
    // robot-heads only accepts hex colors, so the ink body and saffron trim are passed directly.
    setColors({ color: "#36312b", trimColor: "#f28c28", screenColor: "#ffc48a" });
    const wake = () => {
      activityAt.current = Date.now();
      setClock(Date.now());
    };
    const tick = setInterval(() => setClock(Date.now()), 1000);
    document.addEventListener("pointerdown", wake, { passive: true });
    document.addEventListener("keydown", wake);
    document.addEventListener("focusin", wake);
    return () => {
      clearInterval(tick);
      document.removeEventListener("pointerdown", wake);
      document.removeEventListener("keydown", wake);
      document.removeEventListener("focusin", wake);
    };
  }, []);

  useEffect(() => {
    activityAt.current = Date.now();
    requestAt.current = Date.now();
    setClock(Date.now());
    if (busy) {
      replyAt.current = null;
      completedAt.current = null;
    }
  }, [busy]);
  useEffect(() => {
    activityAt.current = Date.now();
    setClock(Date.now());
  }, [input]);
  useEffect(() => {
    if (replyKey && replyKey !== previousReply.current) {
      replyAt.current = Date.now();
      activityAt.current = Date.now();
      setClock(Date.now());
    }
    previousReply.current = replyKey;
  }, [replyKey]);
  useEffect(() => {
    if (briefState === "ready" && previousBrief.current !== "ready") {
      completedAt.current = Date.now();
      activityAt.current = Date.now();
      setClock(Date.now());
    }
    previousBrief.current = briefState;
  }, [briefState]);

  const activityMood = deriveRobotMood({
    busy,
    stage,
    uploading,
    sendingOtp,
    preparingBrief: briefState === "loading",
    failed: failed || briefState === "error",
    typing: Boolean(input.trim()),
    waitingForPhone,
    idleSeconds: (clock - activityAt.current) / 1000,
    requestSeconds: (clock - requestAt.current) / 1000,
    replySeconds:
      replyAt.current === null ? null : (clock - replyAt.current) / 1000,
    completionSeconds:
      completedAt.current === null
        ? null
        : (clock - completedAt.current) / 1000,
  });
  const mood = introduction ? { state: "idle" as RobotHeadState, label: introduction } : activityMood;

  useEffect(() => {
    if (introduction) return;
    try {
      if (localStorage.getItem("robot-voice-muted")) setVoiceEnabled(false);
    } catch {}
  }, [introduction]);

  useEffect(() => {
    if (!voiceEnabled || !voiceAvailable) return;
    const url = robotSpeechUrl(mood.label);
    const timer = window.setTimeout(() => {
      if (document.hidden) {
        if (introduction) setVoiceEnabled(false);
        return;
      }
      if (voice.current?.src.endsWith(url)) return;
      const audio = new Audio(url);
      voice.current = audio;
      audio.volume = 0.75;
      audio.onplaying = () => setSpeaking(true);
      audio.onpause = () => setSpeaking(false);
      audio.onended = () => {
        setSpeaking(false);
        if (introduction) setVoiceEnabled(false);
      };
      audio.play().catch(() => {
        if (voice.current !== audio) return;
        const retry = () => {
          cleanup();
          if (voice.current === audio) audio.play().catch(() => {});
        };
        const cleanup = () => {
          window.removeEventListener("pointerdown", retry);
          window.removeEventListener("keydown", retry);
        };
        unlock = cleanup;
        window.addEventListener("pointerdown", retry, { once: true });
        window.addEventListener("keydown", retry, { once: true });
      });
    }, 500);
    let unlock = () => {};
    return () => {
      window.clearTimeout(timer);
      unlock();
      voice.current?.pause();
      voice.current = null;
    };
  }, [mood.label, voiceEnabled, introduction, voiceAvailable]);

  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) voice.current?.pause();
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      voice.current?.pause();
    };
  }, []);

  const toggleVoice = () => {
    if (voiceEnabled) {
      voice.current?.pause();
      setVoiceEnabled(false);
      if (!introduction) try { localStorage.setItem("robot-voice-muted", "1"); } catch {}
      return;
    }
    if (!introduction) try { localStorage.removeItem("robot-voice-muted"); } catch {}
    setVoiceError(false);
    const audio = new Audio(robotSpeechUrl(mood.label));
    voice.current = audio;
    audio.volume = 0.75;
    audio.onplaying = () => setSpeaking(true);
    audio.onpause = () => setSpeaking(false);
    audio.onended = () => {
      setSpeaking(false);
      if (introduction) setVoiceEnabled(false);
    };
    setVoiceEnabled(true);
    audio.play().catch(() => {
      if (voice.current !== audio) return;
      setVoiceError(true);
      setVoiceEnabled(false);
    });
  };

  return (
    <section
      aria-label="همراه گفتگو"
      data-robot-state={mood.state}
      className={`relative z-10 flex shrink-0 flex-col items-center px-4 pb-3 pt-2 sm:pt-3 ${introduction || plain ? "" : "glass"}`}
    >
      <div
        aria-hidden="true"
        className="relative grid h-[176px] w-[224px] place-items-center"
      >
        <span className="pointer-events-none absolute inset-x-6 bottom-4 h-10 rounded-full bg-brand-soft blur-2xl" />
        <RobotHead
          shape={shape}
          state={speaking && introduction ? "speaking" : mood.state}
          size={176}
          {...(robotColors || colors)}
          interactive
          antenna
          floorShadow
        />
      </div>
      {introduction && <h2 className="mb-3 text-base font-bold text-brand">چطور نیازمندی‌ات را توضیح بدهی؟</h2>}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={introduction ? "max-w-xl text-start text-sm leading-8 text-foreground" : "min-h-5 text-center text-xs leading-5 text-muted-foreground"}
      >
        {mood.label}
      </p>
      {voiceAvailable && (
        <>
      <button
        type="button"
        onClick={toggleVoice}
        aria-pressed={voiceEnabled}
        aria-label={introduction ? voiceEnabled ? "قطع صدای راهنمای شروع" : "پخش راهنمای شروع با صدای روبات" : voiceEnabled ? "خاموش کردن صدای روبات" : "روشن کردن صدای روبات"}
        className="mt-1 flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-brand transition-colors hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {voiceEnabled ? <IconVolume size={16} aria-hidden="true" /> : <IconVolumeOff size={16} aria-hidden="true" />}
        {introduction ? voiceEnabled ? "قطع صدای راهنما" : "پخش راهنمای شروع" : voiceEnabled ? "صدا روشن" : "صدای روبات"}
      </button>
      {voiceError && <p role="status" className="text-center text-xs text-muted-foreground">صدا پخش نشد؛ برای تلاش دوباره دکمه صدا را بزن.</p>}
        </>
      )}
      {!introduction && !plain && <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-full h-12 bg-gradient-to-b from-background/80 to-transparent"
      />}
    </section>
  );
}
