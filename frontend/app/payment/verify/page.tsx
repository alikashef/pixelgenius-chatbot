"use client";

import { useEffect, useState, Suspense, ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { IconCheck, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";
import { verifyPayment } from "@/lib/api";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <ThemeToggle className="absolute left-4 top-4" />
      {children}
    </div>
  );
}

function Spinner() {
  return <div className="mx-auto h-11 w-11 rounded-full border-4 border-primary border-t-transparent motion-safe:animate-spin" aria-hidden="true" />;
}

function VerifyContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "success" | "failure">("loading");
  const [refId, setRefId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const authority = params.get("Authority") || "";
    const status = params.get("Status") || "";

    verifyPayment(authority, status)
      .then((data) => {
        if (data.success) {
          setState("success");
          setRefId(data.ref_id || "");
          setOrderId(data.order_id || "");
          localStorage.removeItem("proposal");
        } else {
          setState("failure");
          setMessage(data.message || "پرداخت ناموفق بود");
        }
      })
      .catch((err) => {
        setState("failure");
        setMessage(err.message || "خطا در تایید پرداخت");
      });
  }, [params]);

  if (state === "loading") {
    return (
      <Shell>
        <div role="status" className="space-y-4 text-center">
          <Spinner />
          <p className="text-sm text-muted-foreground">در حال تایید پرداخت...</p>
        </div>
      </Shell>
    );
  }

  const success = state === "success";

  return (
    <Shell>
      <div className="w-full max-w-md animate-fade-up space-y-6 rounded-3xl border border-border bg-surface p-8 text-center shadow-elevated">
        <div
          className={`mx-auto grid h-16 w-16 place-items-center rounded-full ring-8 ${
            success ? "bg-success/15 text-success ring-success/5" : "bg-danger/15 text-danger ring-danger/5"
          }`}
        >
          {success ? <IconCheck size={30} stroke={2.5} aria-hidden="true" /> : <IconX size={30} stroke={2.5} aria-hidden="true" />}
        </div>
        <div>
          <h1 className="mb-2 text-xl font-black text-foreground">{success ? "پرداخت موفق!" : "پرداخت ناموفق"}</h1>
          <p className="text-sm text-muted-foreground">{success ? "سفارش شما با موفقیت ثبت شد" : message}</p>
        </div>

        {success ? (
          <>
            <dl className="space-y-3 text-right">
              {refId && (
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <dt className="mb-1 text-xs text-muted-foreground">کد پیگیری پرداخت</dt>
                  <dd className="font-mono text-lg font-bold text-success" dir="ltr">{refId}</dd>
                </div>
              )}
              {orderId && (
                <div className="rounded-xl border border-border bg-surface-2 p-4">
                  <dt className="mb-1 text-xs text-muted-foreground">شماره سفارش</dt>
                  <dd className="break-all font-mono text-sm text-secondary-foreground" dir="ltr">{orderId}</dd>
                </div>
              )}
            </dl>
            <p className="text-xs text-muted-foreground">تیم ما در اسرع وقت با شما تماس خواهد گرفت</p>
            <Button className="w-full" onClick={() => router.push("/chat")}>
              سفارش جدید
            </Button>
          </>
        ) : (
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => router.push("/proposal")}>
              تلاش مجدد
            </Button>
            <Button className="flex-1" onClick={() => router.push("/chat")}>
              شروع مجدد
            </Button>
          </div>
        )}
      </div>
    </Shell>
  );
}

export default function PaymentVerifyPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <Spinner />
        </Shell>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
