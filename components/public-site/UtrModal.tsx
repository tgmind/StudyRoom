"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, Copy, ArrowRight, Loader2, AlertCircle, Clock, ShieldCheck } from "lucide-react";

interface UtrModalProps {
  isOpen: boolean;
  onClose: () => void;
  priceInr: number;
}

export function UtrModal({ isOpen, onClose, priceInr }: UtrModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [utr, setUtr] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States: 'input' -> 'submitted_polling' -> 'verified' | 'rejected'
  const [modalState, setModalState] = useState<"input" | "polling" | "verified" | "rejected">("input");
  const [verifiedOtp, setVerifiedOtp] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(5);
  const [copied, setCopied] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll payment status every 3 seconds while in 'polling' state
  useEffect(() => {
    if (modalState !== "polling") {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await fetch("/api/public-website/check-payment-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });

        if (!res.ok) return;
        const data = await res.json();

        if (data.status === "verified" && data.otp) {
          setVerifiedOtp(data.otp);
          setModalState("verified");
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        } else if (data.status === "rejected") {
          setRejectionReason(data.message || "Payment verification was declined.");
          setModalState("rejected");
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        }
      } catch {
        // Continue polling on transient network error
      }
    };

    // Immediate check, then interval
    checkStatus();
    pollIntervalRef.current = setInterval(checkStatus, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [modalState]);

  // Countdown timer when payment is verified
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (modalState === "verified" && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (modalState === "verified" && countdown === 0) {
      router.push("/signup");
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [modalState, countdown, router]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = name.trim();
    const cleanContact = contact.trim();
    const cleanUtr = utr.trim().replace(/\s+/g, "").toUpperCase();

    if (!cleanName) {
      setErrorMsg("Please enter your full name.");
      return;
    }
    if (!cleanContact) {
      setErrorMsg("Please enter your email or mobile number.");
      return;
    }
    if (!/^[A-Za-z0-9]{8,22}$/.test(cleanUtr)) {
      setErrorMsg("Please enter a valid 8 to 22 character UPI Transaction Reference / UTR.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/public-website/submit-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          contact: cleanContact,
          utr: cleanUtr,
          amount: priceInr,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit payment details.");
      }

      setModalState("polling");
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while submitting.");
    } finally {
      setSubmitting(false);
    }
  };

  const copyOtpToClipboard = async () => {
    if (!verifiedOtp) return;
    try {
      await navigator.clipboard.writeText(verifiedOtp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && modalState !== "polling") onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071a3a]/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden border border-blue-100 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-blue-50 px-5 sm:px-6 py-4 shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#0b73e6]">
              {modalState === "verified" ? "Enrollment Authorized" : "Payment Verification"}
            </span>
            <h3 className="text-xl font-black text-[#071a3a]">
              {modalState === "input" && `Submit Your ₹${priceInr} UTR`}
              {modalState === "polling" && "Awaiting Verification"}
              {modalState === "verified" && "Payment Confirmed!"}
              {modalState === "rejected" && "Verification Notice"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto">
          {modalState === "input" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-2xl bg-blue-50/70 p-3.5 text-xs font-semibold leading-relaxed text-[#07458f] border border-blue-100">
                <b>Already completed the ₹{priceInr} UPI transfer?</b><br />
                Enter your transaction reference (UTR) from Google Pay, PhonePe, or Paytm.
                Once verified by the administrator, your 4-digit enrollment code will appear automatically.
              </div>

              {errorMsg && (
                <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600 border border-red-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ravi Kumar"
                  className="w-full rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-bold text-[#071a3a] outline-none focus:border-[#0b73e6] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  Email or Mobile Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="e.g. student@gmail.com or 9876543210"
                  className="w-full rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-bold text-[#071a3a] outline-none focus:border-[#0b73e6] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  UPI Transaction ID / UTR <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={utr}
                  maxLength={22}
                  onChange={(e) => setUtr(e.target.value.toUpperCase())}
                  placeholder="12-digit UPI reference number"
                  className="w-full rounded-xl border border-blue-200 px-4 py-2.5 text-sm font-mono font-black text-[#071a3a] tracking-wider outline-none focus:border-[#0b73e6] focus:ring-2 focus:ring-blue-100"
                />
                <span className="mt-1 block text-[10px] text-slate-400">
                  Located under &quot;UPI Ref ID&quot;, &quot;UTR&quot;, or &quot;Transaction ID&quot; in your payment app.
                </span>
              </div>

              <div className="rounded-xl bg-amber-50 p-3 text-[11px] font-semibold text-amber-900 border border-amber-200/60">
                Notice: Submissions are verified against live banking records. A valid enrollment grant and OTP are issued immediately upon verification.
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-green-600 hover:bg-green-700 py-3.5 text-sm font-black text-white shadow-lg shadow-green-600/20 transition-all active:scale-95 disabled:opacity-75"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Submitting UTR...</span>
                  </>
                ) : (
                  <span>Submit for Verification →</span>
                )}
              </button>
            </form>
          )}

          {modalState === "polling" && (
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 text-blue-600 animate-pulse">
                <Clock className="h-8 w-8" />
              </div>

              <h4 className="text-xl font-black text-[#071a3a]">Awaiting Administrative Verification</h4>

              <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-600 max-w-sm mx-auto">
                Your payment submission has been queued. Our admin is verifying your UTR against the banking ledger.
                This screen updates automatically once approved.
              </p>

              <div className="rounded-2xl bg-slate-50 p-3.5 text-left text-xs space-y-1 font-mono border border-slate-200">
                <div><b className="font-sans text-slate-500">Name:</b> {name}</div>
                <div><b className="font-sans text-slate-500">UTR:</b> <span className="font-bold text-[#071a3a]">{utr}</span></div>
                <div><b className="font-sans text-slate-500">Status:</b> <span className="text-amber-600 font-bold">Pending Confirmation</span></div>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-semibold text-blue-600 pt-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Checking payment status live...</span>
              </div>
            </div>
          )}

          {modalState === "verified" && (
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <ShieldCheck className="h-10 w-10" />
              </div>

              <h4 className="text-2xl font-black text-[#071a3a]">Enrollment Authorized!</h4>

              <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-600 max-w-sm mx-auto">
                Your ₹{priceInr} payment has been verified. Your enrollment authorization has been saved.
              </p>

              {/* 4-Digit OTP Display Box */}
              <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-200 p-4 space-y-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-800">
                  Your 4-Digit Enrollment OTP
                </span>
                <div className="flex items-center justify-center gap-3">
                  <span className="font-mono text-3xl font-black tracking-widest text-emerald-950">
                    {verifiedOtp}
                  </span>
                  <button
                    type="button"
                    onClick={copyOtpToClipboard}
                    className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm border border-emerald-200 hover:bg-emerald-100/50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copied ? "Copied!" : "Copy Code"}</span>
                  </button>
                </div>
                <p className="text-[11px] text-emerald-700 font-medium">
                  This code will be automatically prefilled on your registration form.
                </p>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => router.push("/signup")}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 py-3.5 text-sm font-black text-white shadow-lg transition-all active:scale-95"
                >
                  <span>Continue to Sign Up ({countdown}s)</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {modalState === "rejected" && (
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
                <AlertCircle className="h-10 w-10" />
              </div>

              <h4 className="text-xl font-black text-[#071a3a]">Verification Declined</h4>

              <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-600 max-w-sm mx-auto">
                {rejectionReason || "We could not match your UTR to a successful banking transaction."}
              </p>

              <button
                type="button"
                onClick={() => setModalState("input")}
                className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b73e6] hover:bg-blue-600 py-3 text-sm font-black text-white shadow-lg transition-all"
              >
                <span>Re-enter Transaction Details</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
