"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { verifyPayment } from "@/lib/api";

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
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400">در حال تایید پرداخت...</p>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-100 mb-2">پرداخت موفق!</h1>
            <p className="text-muted text-sm">سفارش شما با موفقیت ثبت شد</p>
          </div>
          <div className="space-y-3">
            {refId && (
              <div className="bg-bg border border-border rounded-xl p-4">
                <p className="text-muted text-xs mb-1">کد پیگیری پرداخت</p>
                <p className="text-accent font-mono font-bold text-lg">{refId}</p>
              </div>
            )}
            {orderId && (
              <div className="bg-bg border border-border rounded-xl p-4">
                <p className="text-muted text-xs mb-1">شماره سفارش</p>
                <p className="text-gray-300 font-mono text-sm break-all">{orderId}</p>
              </div>
            )}
          </div>
          <p className="text-muted text-xs">
            تیم ما در اسرع وقت با شما تماس خواهد گرفت
          </p>
          <button
            onClick={() => router.push("/chat")}
            className="w-full bg-accent hover:bg-accent-hover text-black font-bold rounded-xl py-3 text-sm transition-colors"
          >
            سفارش جدید
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface border border-border rounded-2xl p-8 max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-100 mb-2">پرداخت ناموفق</h1>
          <p className="text-muted text-sm">{message}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/proposal")}
            className="flex-1 border border-border text-muted hover:text-gray-200 rounded-xl py-3 text-sm transition-colors"
          >
            تلاش مجدد
          </button>
          <button
            onClick={() => router.push("/chat")}
            className="flex-1 bg-accent hover:bg-accent-hover text-black font-bold rounded-xl py-3 text-sm transition-colors"
          >
            شروع مجدد
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PaymentVerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VerifyContent />
    </Suspense>
  );
}
