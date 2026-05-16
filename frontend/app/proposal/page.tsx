"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Proposal, requestPayment } from "@/lib/api";

function formatPrice(price: number) {
  return price.toLocaleString("fa-IR");
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export default function ProposalPage() {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem("proposal");
    if (!stored) {
      router.replace("/chat");
      return;
    }
    try {
      setProposal(JSON.parse(stored));
    } catch {
      router.replace("/chat");
    }
  }, [router]);

  async function handlePay() {
    if (!proposal) return;
    setLoading(true);
    setError("");
    try {
      const callbackUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/payment/verify`
          : "/payment/verify";

      const { payment_url } = await requestPayment(proposal, callbackUrl);
      window.location.href = payment_url;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "خطا در ایجاد پرداخت");
      setLoading(false);
    }
  }

  if (!proposal) return null;

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Card */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-accent px-6 py-5">
            <p className="text-black text-xs font-medium mb-1">پیشنهاد پروژه</p>
            <h1 className="text-black text-2xl font-bold">{proposal.projectName}</h1>
          </div>

          <div className="p-6 space-y-6">
            {/* Summary */}
            <div>
              <p className="text-muted text-xs mb-2">خلاصه پروژه</p>
              <p className="text-gray-200 text-sm leading-relaxed">{proposal.summary}</p>
            </div>

            {/* Features */}
            <div>
              <p className="text-muted text-xs mb-3">امکانات</p>
              <ul className="space-y-2">
                {proposal.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-200">
                    <CheckIcon />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tech */}
            <div>
              <p className="text-muted text-xs mb-2">تکنولوژی</p>
              <span className="inline-block bg-bg border border-border text-gray-300 text-xs px-3 py-1.5 rounded-lg">
                {proposal.tech}
              </span>
            </div>

            {/* Price & Days */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-bg border border-border rounded-xl p-4 text-center">
                <p className="text-muted text-xs mb-1">قیمت</p>
                <p className="text-accent font-bold text-lg">{proposal.priceLabel}</p>
                <p className="text-muted text-xs mt-1">{formatPrice(proposal.price)} ریال</p>
              </div>
              <div className="bg-bg border border-border rounded-xl p-4 text-center">
                <p className="text-muted text-xs mb-1">تحویل</p>
                <p className="text-gray-100 font-bold text-lg">
                  {proposal.days.toLocaleString("fa-IR")} روز
                </p>
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => router.push("/chat")}
                className="flex-1 border border-border text-muted hover:text-gray-200 hover:border-gray-500 rounded-xl py-3 text-sm transition-colors"
              >
                بازگشت به چت
              </button>
              <button
                onClick={handlePay}
                disabled={loading}
                className="flex-1 bg-accent hover:bg-accent-hover disabled:opacity-60 disabled:cursor-not-allowed text-black font-bold rounded-xl py-3 text-sm transition-colors"
              >
                {loading ? "در حال انتقال..." : "تایید و پرداخت"}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-muted text-xs mt-4">
          پرداخت از طریق درگاه امن زرین‌پال انجام می‌شود
        </p>
      </div>
    </div>
  );
}
