"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, CheckCircle2, Copy, ArrowRight, Loader2, AlertCircle } from "lucide-react";

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
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState(6);

  useEffect(() => {
    let timer: any = null;
    if (submitted && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((c) => c - 1);
      }, 1000);
    } else if (submitted && countdown === 0) {
      router.push("/signup");
    }
    return () => clearInterval(timer);
  }, [submitted, countdown, router]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanName = name.trim();
    const cleanContact = contact.trim();
    const cleanUtr = utr.trim().replace(/\s+/g, "");

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

      // Copy verification reference to user clipboard where supported
      const receiptText = `Study Room ₹${priceInr} Payment Verification Request\nName: ${cleanName}\nContact: ${cleanContact}\nUTR: ${cleanUtr}\nDate: ${new Date().toLocaleString()}`;
      try {
        await navigator.clipboard.writeText(receiptText);
      } catch {}

      setSubmitted(true);
    } catch (err: any) {
      setErrorMsg(err.message || "An error occurred while submitting.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#071a3a]/75 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden border border-blue-100 max-h-[92vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Modal Header */}

        <div className="flex items-center justify-between border-b border-blue-50 px-5 sm:px-6 py-4 shrink-0">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-[#0b73e6]">
              Payment Verification
            </span>
            <h3 className="text-xl font-black text-[#071a3a]">
              {submitted ? "Verification Submitted" : `Submit Your ₹${priceInr} UTR`}
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
          {!submitted ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-2xl bg-blue-50/70 p-3.5 text-xs font-semibold leading-relaxed text-[#07458f] border border-blue-100">
                <b>Already completed the ₹{priceInr} UPI transfer?</b><br />
                Enter your transaction reference (UTR) from your Google Pay, PhonePe, or Paytm receipt.
                The admin will verify it against the bank record.
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
                Notice: Entering a transaction reference queues your account for verification. It does not automatically guarantee verification without genuine banking confirmation.
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
          ) : (
            /* Submission Success State */
            <div className="text-center py-4 space-y-4">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <CheckCircle2 className="h-10 w-10" />
              </div>

              <h4 className="text-2xl font-black text-[#071a3a]">UTR Details Submitted!</h4>

              <p className="text-xs sm:text-sm font-medium leading-relaxed text-slate-600 max-w-sm mx-auto">
                Your payment details have been recorded in the administration queue for manual verification.
                Please keep your UPI receipt until confirmed.
              </p>

              <div className="rounded-2xl bg-slate-50 p-3.5 text-left text-xs space-y-1 font-mono border border-slate-200">
                <div><b className="font-sans text-slate-500">Name:</b> {name}</div>
                <div><b className="font-sans text-slate-500">Contact:</b> {contact}</div>
                <div><b className="font-sans text-slate-500">UTR:</b> <span className="font-bold text-[#071a3a]">{utr}</span></div>
                <div><b className="font-sans text-slate-500">Amount:</b> ₹{priceInr}</div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="button"
                  onClick={() => router.push("/signup")}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b73e6] hover:bg-blue-600 py-3.5 text-sm font-black text-white shadow-lg transition-all active:scale-95"
                >
                  <span>Continue to Study Room Sign Up ({countdown}s)</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600"
                >
                  Stay on page
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
