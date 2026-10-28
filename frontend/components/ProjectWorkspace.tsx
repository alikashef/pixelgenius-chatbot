"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconArrowUpRight,
  IconCheck,
  IconChevronRight,
  IconCloudUpload,
  IconCode,
  IconFileText,
  IconHistory,
  IconLayout,
  IconLoader2,
  IconLock,
  IconMessage,
  IconPlus,
  IconRefresh,
  IconWorld,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AdminCredentials,
  DeploymentStatus,
  fetchOrderBrief,
  Order,
  ProjectWorkspaceData,
  uploadCustomerOrderFile,
  workspaceRequest,
} from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";
import PreviewReview from "@/components/PreviewReview";

const PATHS = [
  {
    id: "design",
    title: "ساخت همراه طراحی",
    text: "اول ظاهر محصول را تأیید کن، بعد توسعه شروع می‌شود.",
    icon: IconLayout,
  },
  {
    id: "direct",
    title: "ساخت مستقیم",
    text: "از کانفیگ به نسخه اجرایی، بدون مرحله طراحی مستقل.",
    icon: IconCode,
  },
  {
    id: "source",
    title: "انتشار سورس آماده",
    text: "سورس موجود را بررسی کن و برای انتشار آماده شو.",
    icon: IconCloudUpload,
  },
] as const;
const TABS = [
  { id: "overview", label: "نمای کلی", icon: IconLayout },
  { id: "preview", label: "پیش‌نمایش و بازبینی", icon: IconCode },
  { id: "documents", label: "اسناد و فایل‌ها", icon: IconFileText },
  { id: "activity", label: "فعالیت ایجنت", icon: IconHistory },
  { id: "deployment", label: "انتشار و دسترسی", icon: IconWorld },
] as const;
type Tab = (typeof TABS)[number]["id"];
const STATES: Record<string, string> = {
  NOT_STARTED: "هنوز شروع نشده",
  PREPARING: "آماده‌سازی زیرساخت",
  UPLOADING: "ارسال سورس",
  QUEUED: "در صف انتشار",
  BUILDING: "در حال ساخت",
  DEPLOYING: "در حال انتشار",
  READY: "منتشر شده",
  FAILED: "ساخت ناموفق",
  UNHEALTHY: "نیاز به بررسی اجرا",
  EXPIRED: "منقضی شده",
  UNKNOWN: "در حال دریافت وضعیت",
};
const inputClass =
  "field";
const panelClass =
  "rounded-2xl border border-border bg-surface p-5 sm:p-6 shadow-card";
const date = (value: string | number) =>
  new Date(value).toLocaleString("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
const safeUrl = (value?: string) =>
  value && /^https?:\/\//i.test(value) ? value : undefined;

export default function ProjectWorkspace({
  order: initialOrder,
}: {
  order: Order;
}) {
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [data, setData] = useState<ProjectWorkspaceData | null>(null);
  const [deployment, setDeployment] = useState<DeploymentStatus | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState("");
  const [deploymentError, setDeploymentError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const [credentials, setCredentials] = useState<AdminCredentials | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const token = () => localStorage.getItem("customer_token") || "";
  const version =
    data?.versions.find((v) => v.id === selected) || data?.versions.at(-1);
  const state = deployment?.state || "NOT_STARTED";
  const deploying = [
    "PREPARING",
    "UPLOADING",
    "QUEUED",
    "BUILDING",
    "DEPLOYING",
  ].includes(state);

  function handleError(err: unknown) {
    const message =
      err instanceof Error ? err.message : "خطایی رخ داد؛ دوباره تلاش کنید";
    if (message === "UNAUTHORIZED") {
      localStorage.removeItem("customer_token");
      router.replace(`/login?redirect=/account/${order.id}`);
    } else setError(message);
  }
  async function refresh() {
    const next = await workspaceRequest<ProjectWorkspaceData>(
      token(),
      order.id,
    );
    setData(next);
    return next;
  }
  async function refreshDeployment() {
    try {
      const next = await workspaceRequest<DeploymentStatus>(
        token(),
        order.id,
        "/deployment",
      );
      setDeployment(next);
      setDeploymentError("");
    } catch (err) {
      if (err instanceof Error && err.message === "UNAUTHORIZED")
        handleError(err);
      else
        setDeploymentError(
          "وضعیت انتشار به‌روز نشد؛ اتصال را بررسی کن یا دوباره تلاش کن.",
        );
    }
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (stopped) return;
      try {
        const next = await workspaceRequest<ProjectWorkspaceData>(
          token(),
          order.id,
        );
        if (!stopped) setData(next);
      } catch (err) {
        if (!stopped) handleError(err);
      }
      if (!stopped) await refreshDeployment();
      if (!stopped) timer = setTimeout(poll, 12000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
    // Each project owns its polling cycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);
  useEffect(() => {
    if (tab !== "deployment") {
      setCredentials(null);
      setShowPassword(false);
    }
  }, [tab]);

  async function mutate(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await workspaceRequest(token(), order.id, path, body, method);
      await refresh();
      return true;
    } catch (err) {
      handleError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function downloadBrief() {
    setBusy(true);
    setError("");
    try {
      const brief = await fetchOrderBrief(token(), order.id);
      const blob = URL.createObjectURL(
        new Blob([JSON.stringify(brief, null, 2)], {
          type: "application/json",
        }),
      );
      const a = document.createElement("a");
      a.href = blob;
      a.download = "project-brief.json";
      a.click();
      URL.revokeObjectURL(blob);
      await refresh();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  }

  const deploymentCard = (
    <section
      className={cn(
        panelClass,
        "relative overflow-hidden border-brand-line",
      )}
      aria-labelledby="deployment-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand">
            <IconCloudUpload size={23} />
          </span>
          <div>
            <h2 id="deployment-heading" className="font-bold">
              پیشرفت دیپلوی
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              وضعیت واقعی انتشار پروژه
            </p>
          </div>
        </div>
        <span
          role="status"
          className="flex items-center gap-2 rounded-full border border-brand-line bg-brand-soft px-3 py-1.5 text-xs text-brand"
        >
          {deploying && <IconLoader2 size={14} className="animate-spin" />}
          {STATES[state] || state}
        </span>
      </div>
      <ol
        className="mt-6 grid grid-cols-4 gap-2 text-center"
        aria-label="مراحل انتشار"
      >
        {["در صف", "ساخت", "انتشار", "آماده"].map((label, index) => {
          const position = ["PREPARING", "UPLOADING"].includes(state)
            ? 0
            : ["QUEUED", "BUILDING", "DEPLOYING", "READY"].indexOf(state);
          const complete = position > index || state === "READY";
          const active = position === index && state !== "READY";
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className="space-y-2"
            >
              <div
                className={cn(
                  "h-1.5 rounded-full",
                  complete || active ? "bg-primary" : "bg-surface-2",
                  active && "animate-pulse",
                )}
              />
              <span
                className={cn(
                  "block text-xs",
                  complete || active
                    ? "text-brand"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      {state === "NOT_STARTED" && (
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          بعد از ثبت و تأیید نسخه توسعه، ایجنت می‌تواند انتشار را شروع کند.
          وضعیت اینجا خودکار به‌روز می‌شود.
        </p>
      )}
      {["FAILED", "UNHEALTHY", "EXPIRED"].includes(state) && (
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          {state === "EXPIRED"
            ? "مدت میزبانی این نسخه تمام شده است."
            : "انتشار نیاز به بررسی دارد؛ جزئیات خطا در گزارش ساخت آمده است."}
        </p>
      )}
      {safeUrl(deployment?.url) && (
        <a
          href={safeUrl(deployment?.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-brand-line bg-background px-4 py-3 text-sm text-brand"
        >
          <span dir="ltr" className="truncate">
            {deployment?.url}
          </span>
          <IconArrowUpRight size={18} className="shrink-0" />
        </a>
      )}
      {deployment?.expires_at && (
        <p className="mt-3 text-xs text-muted-foreground">
          پایان اعتبار میزبانی: {date(deployment.expires_at * 1000)}
        </p>
      )}
      {deploymentError && (
        <p role="alert" className="mt-4 text-sm text-brand">
          {deploymentError}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {tab !== "deployment" && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTab("deployment")}
          >
            دامنه، گزارش و اطلاعات ادمین
            <IconChevronRight size={14} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refreshDeployment()}
        >
          <IconRefresh size={14} />
          به‌روزرسانی
        </Button>
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="glass sticky top-0 z-20 border-b border-border/70">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link
            href="/account"
            className="flex min-h-9 items-center gap-1 rounded-lg px-1 text-sm text-muted-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring"
          >
            <IconChevronRight size={17} />
            پروژه‌ها
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="truncate text-sm font-semibold">
            {order.project_name}
          </span>
          <span className="mr-auto hidden rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand sm:block">
            فضای پروژه
          </span>
          <ThemeToggle className="max-sm:mr-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-brand">
              WORKSPACE
            </p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">
              {order.project_name}
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              از اولین تصمیم تا انتشار؛ خروجی‌ها، بازخوردها و دسترسی‌های پروژه
              یک‌جا.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void downloadBrief()}
          >
            <IconFileText size={17} />
            {busy ? "در حال انجام…" : "دریافت Configuration"}
          </Button>
        </div>
        <nav
          className="mb-6 flex gap-1 overflow-x-auto border-b border-border"
          aria-label="بخش‌های فضای پروژه"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              aria-current={tab === item.id ? "page" : undefined}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400",
                tab === item.id
                  ? "border-primary text-brand"
                  : "border-transparent text-muted-foreground hover:text-brand",
              )}
            >
              <item.icon size={17} />
              {item.label}
            </button>
          ))}
        </nav>
        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-brand-soft p-4 text-sm"
          >
            <p>{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError("");
                void refresh().catch(handleError);
              }}
            >
              تلاش دوباره
            </Button>
          </div>
        )}
        {notice && (
          <p role="status" className="mb-5 text-sm text-brand">
            {notice}
          </p>
        )}
        {!data ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground">
            <IconLoader2 className="animate-spin" size={22} />
            در حال دریافت فضای پروژه…
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
                <div className="space-y-5">
                  <section className={panelClass}>
                    <h2 className="mb-4 font-bold">مسیر پروژه</h2>
                    {PATHS.filter((path) => path.id === data.path).map(
                      (path) => (
                        <div
                          key={path.id}
                          className="flex items-start gap-3 rounded-xl border border-brand-line bg-brand-soft p-4"
                        >
                          <path.icon
                            size={24}
                            className="shrink-0 text-brand"
                          />
                          <div>
                            <h3 className="text-sm font-bold">{path.title}</h3>
                            <p className="mt-2 text-xs leading-6 text-muted-foreground">
                              {path.text}
                            </p>
                            <p className="mt-3 text-xs text-brand">
                              انتخاب‌شده پیش از شروع گفتگو
                            </p>
                          </div>
                        </div>
                      ),
                    )}
                    {!data.path && (
                      <p className="text-sm leading-7 text-muted-foreground">
                        برای این پروژه قدیمی مسیری ثبت نشده است. مسیر پروژه‌های
                        جدید پیش از شروع گفتگو انتخاب می‌شود.
                      </p>
                    )}
                    {data.source_url && (
                      <a
                        href={safeUrl(data.source_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        dir="ltr"
                        className="mt-4 block break-all text-sm text-brand"
                      >
                        {data.source_url}
                      </a>
                    )}
                    {data.source_file && <a href={`${process.env.NEXT_PUBLIC_API_URL || ""}${data.source_file.url}`} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center gap-2 break-all text-sm text-brand"><IconFileText size={17} />سورس ZIP: {data.source_file.name}<IconArrowUpRight size={15} /></a>}

                  </section>
                  <section className={panelClass}>
                    <h2 className="mb-5 font-bold">مراحل و تأییدها</h2>
                    <ol className="space-y-4">
                      {[
                        { title: "Configuration", done: !!data.configuration },
                        ...(data.path === "design"
                          ? [
                              {
                                title: "تأیید طراحی",
                                done: !!data.approvals.design,
                              },
                            ]
                          : []),
                        {
                          title:
                            data.path === "source"
                              ? "تأیید نسخه آماده انتشار"
                              : "تأیید توسعه",
                          done: !!data.approvals.development,
                        },
                        { title: "انتشار", done: state === "READY" },
                      ].map((step, i) => (
                        <li
                          key={step.title}
                          className="flex items-center gap-3"
                        >
                          <span
                            className={cn(
                              "grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs",
                              step.done
                                ? "bg-primary text-primary-foreground"
                                : "border border-border text-muted-foreground",
                            )}
                          >
                            {step.done ? (
                              <IconCheck size={16} />
                            ) : (
                              (i + 1).toLocaleString("fa-IR")
                            )}
                          </span>
                          <span className="text-sm">{step.title}</span>
                          <span className="mr-auto text-xs text-muted-foreground">
                            {step.done ? "تکمیل شده" : "در انتظار"}
                          </span>
                        </li>
                      ))}
                    </ol>
                    <Button
                      className="mt-5"
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("preview")}
                    >
                      بازبینی خروجی‌ها
                    </Button>
                  </section>
                </div>
                <div className="space-y-5">
                  {deploymentCard}
                  <section className={panelClass}>
                    <IconMessage size={23} className="mb-3 text-brand" />
                    <h2 className="font-bold">اقدام بعدی</h2>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {!data.path
                        ? "مسیر این پروژه قدیمی ثبت نشده؛ برای پروژه جدید، مسیر را پیش از گفتگو انتخاب کن."
                        : !data.versions.length
                          ? "کانفیگ را به ایجنت بده تا اولین خروجی را برای بازبینی ثبت کند."
                          : "آخرین نسخه و بازخوردها را در بخش «پیش‌نمایش و بازبینی» بررسی کن."}
                    </p>
                    <p className="mt-4 border-t border-border pt-4 text-xs leading-6 text-muted-foreground">
                      اجرای خودکار ایجنت هنوز متصل نیست. ایجنت بیرونی می‌تواند
                      با MCP خروجی و گزارش ثبت کند.
                    </p>
                  </section>
                </div>
              </div>
            )}
            {tab === "preview" && (
              <PreviewReview
                projectName={order.project_name}
                version={version}
                url={state === "READY" ? safeUrl(deployment?.url) : undefined}
                siteState={state}
                expiresAt={deployment?.expires_at}
                comments={version ? data.comments.filter((c) => c.version_id === version.id) : []}
                busy={busy}
                onAdd={(note) => (version ? mutate("/comments", { version_id: version.id, ...note }) : Promise.resolve(false))}
                onStatus={(id, status) => void mutate(`/comments/${id}`, { status }, "PATCH")}
                header={
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-bold">پیش‌نمایش و بازبینی</h2>
                      <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
                        سایت منتشرشده‌ی همین پروژه؛ روی هر المان تسک بگذار تا ایجنت اصلاحش کنه.
                      </p>
                    </div>
                    {version ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {data.versions.length > 1 ? (
                          <select
                            aria-label="نسخه"
                            className={cn(inputClass, "h-9 w-auto min-w-44 py-0 text-sm")}
                            value={version.id}
                            onChange={(e) => setSelected(e.target.value)}
                          >
                            {[...data.versions].reverse().map((v) => (
                              <option value={v.id} key={v.id}>
                                نسخه {v.number.toLocaleString("fa-IR")} · {v.stage === "design" ? "طراحی" : "توسعه"} · {v.title}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-secondary-foreground">
                            نسخه {version.number.toLocaleString("fa-IR")} · {version.title}
                          </span>
                        )}
                        {data.approvals[version.stage]?.version_id === version.id ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 text-xs font-bold leading-8 text-success">
                            <IconLock size={14} aria-hidden="true" />
                            تأییدشده · {date(data.approvals[version.stage]!.approved_at)}
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            className="h-9"
                            disabled={busy || data.versions.filter((v) => v.stage === version.stage).at(-1)?.id !== version.id}
                            onClick={() => void mutate("/approve", { version_id: version.id })}
                          >
                            <IconCheck size={16} aria-hidden="true" />
                            {version.stage === "design" ? "تأیید طراحی" : "تأیید توسعه"}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">ایجنت هنوز نسخه‌ای ثبت نکرده</span>
                    )}
                  </div>
                }
              />
            )}
            {tab === "documents" && (
              <div className="grid items-start gap-5 lg:grid-cols-2">
                <section className={panelClass}>
                  <h2 className="font-bold">اسناد پروژه</h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-8 text-muted-foreground">
                    {order.summary}
                  </p>
                  <Button
                    className="mt-5"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void downloadBrief()}
                  >
                    <IconFileText size={17} />
                    {data.configuration
                      ? "دانلود Configuration"
                      : "تولید Configuration"}
                  </Button>
                  {data.source_url && (
                    <a
                      className="mt-5 block break-all text-sm text-brand"
                      href={safeUrl(data.source_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      dir="ltr"
                    >
                      {data.source_url}
                    </a>
                  )}
                  <details className="mt-5">
                    <summary className="cursor-pointer text-sm text-brand">
                      نسخه‌های تأییدشده
                    </summary>
                    <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
                      {Object.entries(data.approvals).map(
                        ([stage, approval]) => (
                          <li key={stage}>
                            {stage === "design" ? "طراحی" : "توسعه"} ·{" "}
                            {
                              data.versions.find(
                                (v) => v.id === approval?.version_id,
                              )?.title
                            }{" "}
                            · {date(approval!.approved_at)}
                          </li>
                        ),
                      )}
                      {!Object.keys(data.approvals).length && (
                        <li>هنوز نسخه‌ای تأیید نشده است.</li>
                      )}
                    </ul>
                  </details>
                </section>
                <section className={panelClass}>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="font-bold">فایل‌ها و سورس</h2>
                    <label className="cursor-pointer rounded-lg border border-brand-line px-3 py-2 text-xs text-brand">
                      افزودن فایل
                      <input
                        className="sr-only"
                        type="file"
                        disabled={busy}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setBusy(true);
                          try {
                            setOrder(
                              await uploadCustomerOrderFile(
                                token(),
                                order.id,
                                file,
                              ),
                            );
                          } catch (err) {
                            handleError(err);
                          } finally {
                            setBusy(false);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    {order.order_files.map((file) => (
                      <a
                        key={file.id}
                        href={`${process.env.NEXT_PUBLIC_API_URL || ""}${file.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm hover:border-brand-line"
                      >
                        <span className="truncate">{file.name}</span>
                        <IconArrowUpRight
                          size={17}
                          className="shrink-0 text-brand"
                        />
                      </a>
                    ))}
                    {!order.order_files.length && (
                      <p className="py-8 text-sm text-muted-foreground">
                        هنوز فایلی ثبت نشده است.
                      </p>
                    )}
                  </div>
                </section>
              </div>
            )}
            {tab === "activity" && (
              <section className={panelClass}>
                <div className="mb-6 flex items-center gap-3">
                  <IconHistory className="text-brand" size={24} />
                  <div>
                    <h2 className="font-bold">فعالیت پروژه</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      گزارش‌های کوتاه ایجنت و تصمیم‌های ثبت‌شده
                    </p>
                  </div>
                </div>
                {!data.activity.length ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    هنوز گزارشی ثبت نشده. گزارش‌های MCP اینجا نمایش داده
                    می‌شوند.
                  </p>
                ) : (
                  <ul className="space-y-0">
                    {[...data.activity].reverse().map((item) => (
                      <li
                        key={item.id}
                        className="flex gap-4 border-b border-border py-4 last:border-0"
                      >
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        <div className="min-w-0">
                          <p className="whitespace-pre-wrap break-words text-sm leading-7">
                            {item.text}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {item.actor === "agent"
                              ? "ایجنت"
                              : item.actor === "system"
                                ? "سیستم"
                                : "شما"}{" "}
                            · {date(item.created_at)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {tab === "deployment" && (
              <div className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div className="space-y-5">
                  {deploymentCard}
                  <section className={panelClass}>
                    <h2 className="mb-4 font-bold">گزارش ساخت</h2>
                    {deployment?.fail_reason && (
                      <p
                        role="status"
                        className="mb-4 break-words text-sm text-brand"
                      >
                        {deployment.fail_reason}
                      </p>
                    )}
                    {deployment?.build_log_tail?.length ? (
                      <pre
                        dir="ltr"
                        className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-background p-4 text-left text-xs leading-6 text-muted-foreground"
                      >
                        {deployment.build_log_tail.join("\n")}
                      </pre>
                    ) : (
                      <p className="text-sm leading-7 text-muted-foreground">
                        هنوز گزارشی از ساخت دریافت نشده است.
                      </p>
                    )}
                    {deployment?.build_errors?.map((line, i) => (
                      <p
                        key={i}
                        dir="ltr"
                        className="mt-3 break-words text-xs text-brand"
                      >
                        {line}
                      </p>
                    ))}
                  </section>
                  <section className={panelClass}>
                    <h2 className="mb-4 font-bold">تاریخچه انتشار</h2>
                    {!(deployment?.history || data.deployments).length ? (
                      <p className="text-sm text-muted-foreground">
                        انتشاری ثبت نشده است.
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {[...(deployment?.history || data.deployments)]
                          .reverse()
                          .map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
                            >
                              <div>
                                <p className="text-sm">
                                  {STATES[item.state] || item.state}
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {date(item.created_at)}
                                </p>
                              </div>
                              {safeUrl(item.url) && (
                                <a
                                  href={safeUrl(item.url)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-brand"
                                >
                                  مشاهده سایت
                                  <IconArrowUpRight
                                    size={14}
                                    className="inline"
                                  />
                                </a>
                              )}
                            </li>
                          ))}
                      </ul>
                    )}
                  </section>
                </div>
                <section className={panelClass}>
                  <div className="mb-3 flex items-center gap-2">
                    <IconLock className="text-brand" size={21} />
                    <h2 className="font-bold">دسترسی ادمین پروژه</h2>
                  </div>
                  <p className="mb-5 text-xs leading-7 text-muted-foreground">
                    آدرس مدیریت و اطلاعات ورود همین پروژه. رمزها به‌صورت
                    رمزگذاری‌شده ذخیره می‌شوند و فقط برای حساب مالک قابل
                    مشاهده‌اند.
                  </p>
                  {!credentials ? (
                    <>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {data.has_credentials
                          ? "اطلاعات ورود ثبت شده است."
                          : "هنوز اطلاعات ورود ثبت نشده است. ایجنت یا خودت می‌توانید اطلاعات واقعی پروژه را اضافه کنید."}
                      </p>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            setCredentials(
                              await workspaceRequest<AdminCredentials>(
                                token(),
                                order.id,
                                "/credentials",
                              ),
                            );
                          } catch (err) {
                            handleError(err);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {data.has_credentials
                          ? "مشاهده اطلاعات ورود"
                          : "افزودن اطلاعات ورود"}
                      </Button>
                    </>
                  ) : (
                    <form
                      className="space-y-4"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await mutate("/credentials", credentials, "PUT")) {
                          setCredentials(null);
                          setShowPassword(false);
                          setNotice("اطلاعات ورود ذخیره شد");
                        }
                      }}
                    >
                      <label className="block space-y-2 text-xs">
                        آدرس پنل ادمین
                        <input
                          type="url"
                          className={inputClass}
                          dir="ltr"
                          value={credentials.admin_url}
                          onChange={(e) =>
                            setCredentials({
                              ...credentials,
                              admin_url: e.target.value,
                            })
                          }
                          maxLength={2000}
                        />
                      </label>
                      {safeUrl(credentials.admin_url) && (
                        <a
                          className="flex items-center gap-1 text-xs text-brand"
                          href={safeUrl(credentials.admin_url)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          باز کردن پنل ادمین
                          <IconArrowUpRight size={14} />
                        </a>
                      )}
                      <label className="block space-y-2 text-xs">
                        نام کاربری / ایمیل
                        <input
                          className={inputClass}
                          dir="ltr"
                          autoComplete="off"
                          value={credentials.username}
                          onChange={(e) =>
                            setCredentials({
                              ...credentials,
                              username: e.target.value,
                            })
                          }
                          maxLength={500}
                        />
                      </label>
                      <label className="block space-y-2 text-xs">
                        رمز عبور
                        <input
                          type={showPassword ? "text" : "password"}
                          className={inputClass}
                          dir="ltr"
                          autoComplete="new-password"
                          value={credentials.password}
                          onChange={(e) =>
                            setCredentials({
                              ...credentials,
                              password: e.target.value,
                            })
                          }
                          maxLength={2000}
                        />
                      </label>
                      <button
                        type="button"
                        className="text-xs text-brand"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                      </button>
                      <div className="flex gap-2">
                        <Button disabled={busy} size="sm">
                          ذخیره اطلاعات
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          size="sm"
                          onClick={() => {
                            setCredentials(null);
                            setShowPassword(false);
                          }}
                        >
                          بستن
                        </Button>
                      </div>
                    </form>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
