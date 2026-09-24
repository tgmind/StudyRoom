"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { PublicWebsiteMembership, PublicWebsiteBranding } from "@/lib/public-website/types";
import { getDriveImageUrls, getDriveDownloadUrl } from "@/lib/public-website/driveUtils";
import {
  Download,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  QrCode,
  Sparkles,
  Ticket,
  AlertCircle,
  Loader2,
  ShieldCheck,
  RotateCcw,
} from "lucide-react";

interface PaymentSectionProps {
  membership: PublicWebsiteMembership;
  branding: PublicWebsiteBranding;
  onOpenUtrModal: () => void;
}

export function PaymentSection({ membership, branding, onOpenUtrModal }: PaymentSectionProps) {
  const router = useRouter();
  const price = typeof membership.priceInr === "number" && !isNaN(membership.priceInr) ? membership.priceInr : 50;

  // QR Code Image State
  const qrDriveLink = branding.qrCodeDriveUrl || "";
  const sources = getDriveImageUrls(qrDriveLink);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const currentSrc = sources[currentSourceIndex] || "";

  const handleImageError = () => {
    if (currentSourceIndex + 1 < sources.length) {
      setCurrentSourceIndex((prev) => prev + 1);
    } else {
      setImageError(true);
    }
  };

  // UPI constants (for mobile direct-intent launch only)
  const upiIntentUri = `upi://pay?pa=studyaliveapp@okhdfcbank&pn=Study%20Room&am=50.00&cu=INR&tn=Study%20Room%20Lifetime%20Access`;

  // Coupon State
  const [couponInput, setCouponInput] = useState("");
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPercent: number;
    message: string;
  } | null>(null);

  // Referral Form State (when 100% coupon applied)
  const [refName, setRefName] = useState("");
  const [refReferredBy, setRefReferredBy] = useState("");
  const [refAgreement, setRefAgreement] = useState(false);
  const [submittingReferral, setSubmittingReferral] = useState(false);
  const [referralError, setReferralError] = useState<string | null>(null);
  const [referralSuccess, setReferralSuccess] = useState(false);

  // Apply Coupon Handler
  const handleApplyCoupon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setCouponError(null);
    const trimmed = couponInput.trim().toUpperCase();
    if (!trimmed) {
      setCouponError("Please enter a coupon code.");
      return;
    }

    setValidatingCoupon(true);
    try {
      const res = await fetch("/api/public-website/validate-coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed }),
      });

      const data = await res.json();
      if (!res.ok || !data.valid) {
        setCouponError(data.message || "Invalid or inactive coupon code.");
        return;
      }

      setAppliedCoupon({
        code: data.code,
        discountPercent: data.discountPercent ?? 100,
        message: data.message || "100% discount applied via referral.",
      });
      setCouponInput("");
      setCouponError(null);
    } catch {
      setCouponError("Invalid or inactive coupon code.");
    } finally {
      setValidatingCoupon(false);
    }
  };

  // Remove Coupon Handler
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    setReferralError(null);
    setRefAgreement(false);
  };

  // Submit 100% OFF Referral Form
  const handleSubmitReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    setReferralError(null);

    const cleanName = refName.trim();
    const cleanReferredBy = refReferredBy.trim();

    if (!cleanName || cleanName.length < 2) {
      setReferralError("Please enter your full name (minimum 2 characters).");
      return;
    }

    if (!cleanReferredBy || cleanReferredBy.length < 2) {
      setReferralError("Please enter the name of the person or platform that referred you.");
      return;
    }

    if (!refAgreement) {
      setReferralError("You must agree to the Referral Responsibility Agreement to continue.");
      return;
    }

    if (!appliedCoupon) {
      setReferralError("No valid coupon applied.");
      return;
    }

    setSubmittingReferral(true);
    try {
      const res = await fetch("/api/public-website/submit-referral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: appliedCoupon.code,
          name: cleanName,
          referredBy: cleanReferredBy,
          agreementAccepted: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to process referral enrollment.");
      }

      setReferralSuccess(true);
      setTimeout(() => {
        router.push(data.redirectUrl || "/signup");
      }, 1500);
    } catch (err: any) {
      setReferralError(err.message || "Failed to process referral enrollment.");
    } finally {
      setSubmittingReferral(false);
    }
  };

  const is100PercentOff = appliedCoupon && appliedCoupon.discountPercent === 100;

  return (
    <section id="membership" className="py-12 sm:py-16 md:py-20 lg:py-24 bg-gradient-to-b from-[#eff6ff] via-[#f8fbff] to-[#dbeafe]/50 border-b border-blue-200 scroll-mt-20">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf5ff] px-3.5 py-1 text-xs font-black uppercase tracking-wider text-[#07458f]">
            <span>{is100PercentOff ? "REFERRAL ENROLLMENT" : "12 — UPI QR PAYMENT"}</span>
          </div>
          <h2 className="mt-3.5 text-2xl xs:text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#071a3a]">
            {is100PercentOff ? (
              <>
                Referral Access — <span className="text-emerald-600">100% Off</span>
              </>
            ) : (
              <>
                Join Study Room for <span className="text-[#0b73e6]">₹{price}</span>
              </>
            )}
          </h2>
          <p className="mt-3.5 sm:mt-4 text-xs sm:text-sm md:text-base lg:text-lg font-medium leading-relaxed text-slate-600">
            {is100PercentOff
              ? "Your enrollment fee has been waived through a valid referral coupon. Complete your details below to activate your account."
              : "Scan the official UPI QR code with any UPI application (Google Pay, PhonePe, Paytm, BHIM, Cred) and submit your transaction UTR for verification."}
          </p>
        </div>

        {/* Payment Main Container */}
        <div className="mt-8 sm:mt-12 md:mt-14 max-w-5xl mx-auto rounded-3xl border border-blue-200/80 bg-white shadow-2xl shadow-blue-500/10 overflow-hidden min-w-0">
          <div className="grid lg:grid-cols-[0.9fr_1.1fr] min-w-0">
            {/* ========================================================================= */}
            {/* Left Column: QR Code Card with Direct 'I Have Paid' & Verification Info */}
            {/* ========================================================================= */}
            <div className="bg-gradient-to-b from-[#f4f9ff] via-[#eaf3fe] to-[#ddedfd] border-b lg:border-b-0 lg:border-r border-blue-200/90 p-4 sm:p-6 md:p-8 text-[#071a3a] flex flex-col justify-between min-w-0">
              {is100PercentOff ? (
                /* Referral Waiver Card */
                <div className="mx-auto w-full max-w-sm rounded-3xl bg-white p-5 sm:p-6 text-center text-[#071a3a] shadow-xl border border-emerald-200 animate-in fade-in duration-300 min-w-0">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-700">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Referral Access — 100% Off</span>
                  </div>

                  <div className="mt-5 flex items-center justify-center">
                    <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                      <ShieldCheck className="h-9 w-9 sm:h-11 sm:w-11 text-white" />
                    </div>
                  </div>

                  <h3 className="mt-4 text-xl sm:text-2xl font-black text-[#071a3a]">
                    Fee Waived
                  </h3>

                  <p className="mt-2 text-xs font-semibold text-slate-600 leading-relaxed">
                    Your enrollment fee has been waived through a valid referral coupon.
                  </p>

                  <div className="mt-4 rounded-xl bg-slate-50 border border-slate-200 p-2.5">
                    <span className="text-[10px] uppercase tracking-wider font-black text-slate-400 block">Applied Coupon</span>
                    <span className="font-mono text-sm sm:text-base font-black text-emerald-600 tracking-wider">
                      {appliedCoupon.code}
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline justify-center gap-2">
                    <span className="text-sm font-bold text-slate-400 line-through">₹{price}</span>
                    <span className="text-3xl sm:text-4xl font-black text-emerald-600">₹0</span>
                    <span className="text-xs font-bold text-emerald-700">Free Access</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                    <span>Change / Remove Coupon</span>
                  </button>
                </div>
              ) : (
                /* Normal QR Code Display Card */
                <div className="mx-auto w-full max-w-sm rounded-3xl bg-white p-4 sm:p-5 text-center text-[#071a3a] shadow-xl border border-blue-200/80 min-w-0">
                  {/* Card Title & Payee */}
                  <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-[#0b73e6]">
                    Scan &amp; Pay via UPI
                  </div>
                  <h3 className="mt-1 text-xl sm:text-2xl font-black">{membership.payeeName || "Study Room"}</h3>
                  <p className="text-[11px] sm:text-xs font-bold text-slate-500">Lifetime Group Access</p>

                  {/* QR Code Container */}
                  <div className="mt-3.5 rounded-2xl border-2 border-blue-100 bg-white p-2.5 sm:p-3 relative min-h-[190px] sm:min-h-[210px] flex items-center justify-center">
                    {!imageError && currentSrc ? (
                      <img
                        src={currentSrc}
                        alt={`Study Room ₹${price} UPI Payment QR Code`}
                        onError={handleImageError}
                        onLoad={() => setImageLoaded(true)}
                        className={`mx-auto aspect-square w-full max-w-[190px] sm:max-w-[220px] rounded-xl object-contain transition-opacity duration-300 ${
                          imageLoaded ? "opacity-100" : "opacity-40"
                        }`}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="rounded-xl bg-slate-50 p-4 text-center">
                        <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-blue-100 text-[#0b73e6]">
                          <QrCode className="h-7 w-7 sm:h-8 sm:w-8" />
                        </div>
                        <p className="mt-2.5 text-xs font-black text-[#071a3a]">₹{price} UPI Payment</p>
                        <p className="mt-1 text-[11px] font-mono text-slate-500">Scan via UPI App</p>
                      </div>
                    )}
                  </div>

                  {/* Supported UPI Apps Row (No Raw UPI ID Exposed to Prevent Misuse) */}
                  <div className="mt-3 flex items-center justify-center gap-1.5 flex-wrap rounded-xl bg-slate-50 border border-slate-200/80 py-1.5 px-2.5 text-[10px] sm:text-[11px] font-bold text-slate-600">
                    <span className="text-[9px] uppercase tracking-wider font-black text-slate-400">Accepts:</span>
                    <span className="text-slate-800 font-extrabold">GPay</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-800 font-extrabold">PhonePe</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-800 font-extrabold">Paytm</span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-800 font-extrabold">BHIM / Any UPI</span>
                  </div>


                  {/* Price Tag */}
                  <div className="mt-3 flex items-baseline justify-center gap-1.5">
                    <span className="text-3xl sm:text-4xl font-black text-[#071a3a]">
                      ₹{membership.priceInr || 50}
                    </span>
                    <span className="text-xs font-bold text-slate-400">one-time enrollment</span>
                  </div>

                  {/* ================================================================= */}
                  {/* PRIMARY ACTION: 'I Have Paid — Submit UTR' on the QR card */}
                  {/* ================================================================= */}
                  <button
                    type="button"
                    onClick={onOpenUtrModal}
                    className="mt-3.5 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0b73e6] hover:bg-[#07458f] py-3.5 px-4 text-sm font-black text-white shadow-lg shadow-blue-500/25 transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer ring-2 ring-blue-500/20"
                  >
                    <CheckCircle2 className="h-4 w-4 text-white shrink-0" />
                    <span>I Have Paid — Submit UTR →</span>
                  </button>

                  {/* Related verification info directly below the button */}
                  <p className="mt-2 text-[10px] sm:text-[11px] font-semibold text-slate-500 leading-normal px-1">
                    {membership.securityNote ||
                      `Scanning the QR and submitting your UTR initiates admin verification. The ₹${price} fee is one-time and non-refundable.`}
                  </p>

                  {/* Secondary Actions: Mobile Direct Pay & Download QR */}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={upiIntentUri}
                      className="inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 px-1.5 sm:px-2 text-[10px] sm:text-[11px] font-black text-white shadow transition-all active:scale-95 text-center truncate"
                      title="Open directly in UPI applications"
                    >
                      <ArrowRight className="h-3 w-3 shrink-0" />
                      <span className="truncate">Pay via App</span>
                    </a>

                    <a
                      href={getDriveDownloadUrl(qrDriveLink)}
                      download="Study-Room-UPI-QR.png"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 py-2.5 px-1.5 sm:px-2 text-[10px] sm:text-[11px] font-bold text-slate-700 shadow-2xs transition-all text-center truncate"
                    >
                      <Download className="h-3 w-3 shrink-0 text-slate-500" />
                      <span className="truncate">Download QR</span>
                    </a>
                  </div>
                </div>
              )}

              <div className="mt-5 text-center text-xs font-semibold text-slate-500">
                {is100PercentOff
                  ? "🛡️ Verified Referral Program • Zero Payment Required"
                  : "🔒 Safe UPI Transfer • Direct Bank Verification"}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* Right Column: Instructions, Referral Coupon Box, Policy & Steps */}
            {/* ========================================================================= */}
            <div className="p-4 sm:p-6 md:p-8 flex flex-col justify-between space-y-5 min-w-0">
              {is100PercentOff ? (
                /* 100% OFF Referral Form */
                <div className="space-y-4 animate-in fade-in duration-300 min-w-0">
                  <div className="inline-flex rounded-full bg-emerald-50 border border-emerald-200/80 px-3 py-1 text-xs font-black text-emerald-700">
                    REFERRAL ACCESS GRANTED
                  </div>

                  <div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-[#071a3a] break-words">
                      Referral Access — 100% Off
                    </h3>
                    <p className="mt-1.5 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 break-words">
                      Your enrollment fee has been waived through a valid referral coupon. Please enter your name, referral source, and accept the accountability agreement to continue.
                    </p>
                  </div>

                  {referralError && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-bold text-red-600 border border-red-200 min-w-0">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="break-words">{referralError}</span>
                    </div>
                  )}

                  {referralSuccess && (
                    <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-xs font-bold text-emerald-700 border border-emerald-200 min-w-0">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span className="break-words">Referral access verified! Redirecting to StudyRoom registration...</span>
                    </div>
                  )}

                  <form onSubmit={handleSubmitReferral} className="space-y-3.5 min-w-0">
                    {/* Field 1: Full Name */}
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={refName}
                        onChange={(e) => setRefName(e.target.value)}
                        placeholder="e.g. Aditya Sharma"
                        className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm font-bold text-[#071a3a] outline-none focus:border-[#0b73e6] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>

                    {/* Field 2: Referred By */}
                    <div>
                      <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1">
                        Referred By <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={refReferredBy}
                        onChange={(e) => setRefReferredBy(e.target.value)}
                        placeholder="e.g. Aditya / Telegram Group / Study Partner"
                        className="w-full rounded-xl border border-blue-200 bg-white px-3.5 py-2.5 text-sm font-bold text-[#071a3a] outline-none focus:border-[#0b73e6] focus:ring-2 focus:ring-blue-100"
                      />
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">
                        Enter the name of the person or platform that referred you.
                      </p>
                    </div>

                    {/* Field 3: Referral Responsibility Agreement Checkbox */}
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-3.5 sm:p-4 min-w-0">
                      <label className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={refAgreement}
                          onChange={(e) => setRefAgreement(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-amber-400 text-[#0b73e6] focus:ring-blue-200 cursor-pointer shrink-0"
                        />
                        <span className="text-xs font-bold leading-relaxed text-slate-800 break-words">
                          I understand that StudyRoom is not a free service and that I have received free access through a referral. I agree not to misuse, spam, disrupt, or unfairly exploit the platform.
                        </span>
                      </label>
                    </div>

                    {/* CTA Button */}
                    <button
                      type="submit"
                      disabled={submittingReferral || referralSuccess}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 py-3.5 px-4 text-sm sm:text-base font-black text-white shadow-xl shadow-emerald-700/20 transition-all hover:-translate-y-0.5 active:scale-95 cursor-pointer"
                    >
                      {submittingReferral ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          <span>Verifying Referral...</span>
                        </>
                      ) : (
                        <>
                          <span>Continue with Referral Access</span>
                          <ArrowRight className="h-4 w-4 shrink-0" />
                        </>
                      )}
                    </button>
                  </form>
                </div>
              ) : (
                /* Normal Flow Context & Steps */
                <div className="min-w-0 space-y-3.5">
                  <div className="inline-flex max-w-full flex-wrap items-center justify-center rounded-full bg-red-50 border border-red-200/80 px-3 py-1 text-[10px] sm:text-xs font-black text-red-600 text-center leading-tight">
                    <span>
                      {membership.badgeText
                        ? membership.badgeText.replace(/₹\s*50\b/g, `₹${price}`).replace(/₹\s*\d+/g, `₹${price}`)
                        : `ONE-TIME ₹${price} ENROLLMENT FEE • LIFETIME ACCESS`}
                    </span>
                  </div>

                  <h3 className="mt-2 text-xl sm:text-2xl md:text-3xl font-black text-[#071a3a] break-words">
                    {membership.title || "Join the Focused Study Community"}
                  </h3>

                  <p className="mt-1.5 text-xs sm:text-sm font-medium leading-relaxed text-slate-600 break-words">
                    The one-time <strong className="text-slate-800 font-bold">₹{price} enrollment fee</strong> helps us maintain a focused and responsible study community. It is intended to encourage <strong className="text-slate-800 font-bold">serious aspirants</strong>, discourage inactive or casual participation, and create a sense of responsibility toward regular daily study.
                  </p>

                  {/* Optional Referral Coupon Code Input Box */}
                  <div className="rounded-2xl bg-white border-2 border-blue-200/90 p-3.5 sm:p-4 shadow-sm min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
                      <span className="text-[11px] sm:text-xs font-black uppercase tracking-wider text-[#07458f] flex items-center gap-1.5">
                        <Ticket className="w-4 h-4 text-[#0b73e6] shrink-0" />
                        <span>Have a Referral Coupon Code?</span>
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">Optional</span>
                    </div>
                    <form onSubmit={handleApplyCoupon} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 min-w-0">
                      <input
                        type="text"
                        value={couponInput}
                        onChange={(e) => {
                          setCouponInput(e.target.value.toUpperCase());
                          setCouponError(null);
                        }}
                        placeholder="e.g. REFERRAL100"
                        className="w-full sm:flex-1 min-w-0 rounded-xl border border-blue-200 bg-slate-50/70 px-3.5 py-2.5 text-xs sm:text-sm font-bold uppercase tracking-wider text-[#071a3a] placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-[#0b73e6] focus:bg-white focus:ring-2 focus:ring-blue-100"
                      />
                      <button
                        type="submit"
                        disabled={validatingCoupon || !couponInput.trim()}
                        className="w-full sm:w-auto rounded-xl bg-[#0b73e6] hover:bg-[#07458f] disabled:opacity-50 px-4 py-2.5 text-xs font-black text-white shadow-sm transition-all shrink-0 cursor-pointer text-center"
                      >
                        {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Apply Code"}
                      </button>
                    </form>
                    {couponError && (
                      <p className="mt-2 text-[11px] font-bold text-red-600 flex items-center gap-1.5 bg-red-50 p-2 rounded-lg border border-red-200 break-words">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span className="break-words">{couponError}</span>
                      </p>
                    )}
                  </div>

                  {/* Box 1: Why is there a fee? */}
                  <div className="rounded-2xl bg-[#f8fcff] border border-blue-200/80 p-3.5 sm:p-4 min-w-0">
                    <div className="flex items-center gap-2 text-[#0b73e6] mb-2">
                      <Sparkles className="w-4 h-4 text-[#0b73e6] shrink-0" />
                      <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-[#071a3a]">
                        {membership.whyFeeTitle
                          ? membership.whyFeeTitle.replace(/₹\s*50\b/g, `₹${price}`).replace(/₹\s*\d+/g, `₹${price}`)
                          : `Why is there a ₹${price} fee?`}
                      </h4>
                    </div>
                    <ul className="space-y-2 text-xs sm:text-[13px] text-slate-700 font-medium">
                      <li className="flex items-start gap-2 min-w-0">
                        <span className="text-[#0b73e6] font-black shrink-0 mt-0.5">●</span>
                        <span className="min-w-0 break-words">
                          <strong className="text-slate-900 font-bold">Serious Aspirants:</strong> Encourages focused students and discourages inactive or casual participation.
                        </span>
                      </li>
                      <li className="flex items-start gap-2 min-w-0">
                        <span className="text-[#0b73e6] font-black shrink-0 mt-0.5">●</span>
                        <span className="min-w-0 break-words">
                          <strong className="text-slate-900 font-bold">Personal Responsibility:</strong> Creates accountability toward disciplined, regular daily study.
                        </span>
                      </li>
                      <li className="flex items-start gap-2 min-w-0">
                        <span className="text-[#0b73e6] font-black shrink-0 mt-0.5">●</span>
                        <span className="min-w-0 break-words">
                          <strong className="text-slate-900 font-bold">Platform Maintenance:</strong> Contributes directly toward the maintenance and operation of the StudyRoom platform.
                        </span>
                      </li>
                    </ul>
                    <div className="mt-2.5 pt-2 border-t border-blue-100 flex items-center gap-1.5 text-[10px] sm:text-xs font-black text-rose-700">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-600 shrink-0" />
                      <span>Important: The ₹{price} fee is one-time and non-refundable.</span>
                    </div>
                  </div>

                  {/* Box 2: Strict Community Policy */}
                  <div className="rounded-2xl bg-amber-50/70 border border-amber-300/70 p-3.5 sm:p-4 text-xs min-w-0">
                    <div className="flex items-center gap-1.5 text-amber-900 font-black mb-1.5 text-xs sm:text-sm">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Strict Community Policy</span>
                    </div>
                    <p className="text-slate-700 leading-relaxed font-medium text-[11px] sm:text-xs break-words">
                      Spamming, misuse of the platform, cheating, disruptive behavior, or other unfair activities may result in <strong className="text-slate-900 font-bold">account suspension or termination without refund</strong>. Such action may be taken to protect the study environment and other members, and the decision will be subject to StudyRoom&apos;s applicable community rules.
                    </p>
                  </div>

                  {/* 4 Steps Checklist */}
                  <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 sm:p-4 min-w-0">
                    <div className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                      Payment &amp; Verification Steps
                    </div>
                    <ol className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs min-w-0">
                      {membership.steps.map((st) => (
                        <li
                          key={st.number}
                          onClick={st.number === 3 ? onOpenUtrModal : undefined}
                          className={`flex items-start gap-2 bg-white p-2.5 rounded-xl border border-slate-100 shadow-2xs transition-all min-w-0 ${
                            st.number === 3 ? "cursor-pointer hover:border-blue-300 hover:bg-blue-50/30" : ""
                          }`}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#0b73e6] font-mono text-[9px] font-black text-white mt-0.5">
                            {st.number}
                          </span>
                          <div className="min-w-0">
                            <b className="text-slate-800 text-[11px] sm:text-xs flex items-center gap-1 flex-wrap">
                              <span>
                                {st.title ? st.title.replace(/₹\s*50\b/g, `₹${price}`).replace(/₹\s*\d+/g, `₹${price}`) : st.title}
                              </span>
                              {st.number === 3 && <span className="text-[9px] text-[#0b73e6] font-black uppercase">● Submit</span>}
                            </b>
                            <span className="text-slate-500 text-[10px] sm:text-[11px] leading-tight block mt-0.5 break-words">
                              {st.description ? st.description.replace(/₹\s*50\b/g, `₹${price}`).replace(/₹\s*\d+/g, `₹${price}`) : st.description}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Convenient Follow-up Bar in Right Column */}
                  <div className="rounded-2xl bg-gradient-to-r from-blue-50/80 via-slate-50 to-indigo-50/80 border border-blue-100 p-3 sm:p-3.5 flex flex-col xs:flex-row items-start xs:items-center justify-between gap-2.5 min-w-0">
                    <div className="min-w-0">
                      <span className="text-xs font-black text-[#071a3a] block">Paid via the QR code above?</span>
                      <span className="text-[11px] font-semibold text-slate-500 block truncate">
                        Submit your 12-digit UTR reference for verification.
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenUtrModal}
                      className="w-full xs:w-auto shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#071a3a] hover:bg-[#0b244d] py-2 px-3.5 text-xs font-black text-white shadow-sm transition-all active:scale-95 cursor-pointer text-center"
                    >
                      <span>Submit UTR →</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
