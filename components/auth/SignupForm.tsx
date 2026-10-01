"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Info, ShieldCheck, Lock, ArrowRight, Loader2 } from "lucide-react";
import { AuthInstallOptions } from "@/components/auth/AuthInstallOptions";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preverification state
  const [preverifying, setPreverifying] = useState(true);
  const [isPreverified, setIsPreverified] = useState(false);
  const [authTypeLabel, setAuthTypeLabel] = useState<string | null>(null);

  const router = useRouter();

  // Check enrollment token cookie on mount
  useEffect(() => {
    let isMounted = true;

    async function checkEnrollment() {
      try {
        const res = await fetch("/api/auth/preverify-enrollment");
        const data = await res.json();

        if (isMounted) {
          if (res.ok && data.preverified) {
            setIsPreverified(true);
            setOtp(data.otp || "");
            if (data.name) {
              setDisplayName((prev) => prev || data.name);
            }
            setAuthTypeLabel(
              data.authorizationType === "referral_coupon"
                ? "100% Scholarship Referral"
                : "Verified ₹20 Payment"
            );
          } else {
            setIsPreverified(false);
          }
        }
      } catch {
        if (isMounted) setIsPreverified(false);
      } finally {
        if (isMounted) setPreverifying(false);
      }
    }

    checkEnrollment();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (!otp || otp.length !== 4) {
      setError("A valid 4-digit enrollment code is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/enrollment-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim(),
          otp: otp.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to create account");
      }

      // Successful registration: redirect to room
      window.location.href = data.redirect || "/room";
    } catch (err: any) {
      setError(err?.message || "Failed to create account");
      setLoading(false);
    }
  };

  if (preverifying) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-sm font-medium text-zinc-300">Checking enrollment verification...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Create Account
        </h1>
        <p className="text-xs text-zinc-400">
          Join StudyRoom live accountability study group
        </p>
      </div>

      {/* State A: Pre-verified Enrollment Banner */}
      {isPreverified ? (
        <div className="p-3.5 bg-emerald-950/40 border border-emerald-700/60 rounded-xl space-y-1 text-xs">
          <div className="flex items-center gap-2 text-emerald-300 font-bold">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Enrollment Access Verified ({authTypeLabel})</span>
          </div>
          <div className="flex items-center justify-between text-emerald-400/90 font-mono pt-1 text-[11px]">
            <span>Authorization Code:</span>
            <span className="font-bold tracking-widest bg-emerald-900/50 px-2 py-0.5 rounded border border-emerald-700/50 text-emerald-200">
              {otp}
            </span>
          </div>
        </div>
      ) : (
        /* State B: Locked Banner (No valid enrollment cookie found) */
        <div className="p-4 bg-amber-950/30 border border-amber-700/50 rounded-2xl space-y-3 text-xs text-amber-200 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-sm text-amber-100">StudyRoom Membership Required</p>
            <p className="text-zinc-400 leading-relaxed text-[11px]">
              New registrations require a verified ₹20 UPI enrollment or an authorized 100% scholarship referral coupon.
            </p>
          </div>
          <Link
            href="/public#membership"
            className="inline-flex items-center justify-center gap-1.5 w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-white text-xs transition-all shadow-md shadow-blue-600/20 active:scale-98"
          >
            <span>Complete ₹20 Enrollment / Apply Coupon</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      {/* Prominent Real Name Alert Banner */}
      <div className="p-3 bg-red-500/10 border border-red-500/35 rounded-xl flex items-start space-x-2.5 text-red-300 text-xs shadow-sm">
        <Info className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <span className="font-bold leading-snug text-red-200">
          Use Your Real Name as far as possible.
        </span>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs font-medium text-red-200">
            {error}
          </div>
        )}

        <Input
          label="Display Name"
          type="text"
          placeholder="e.g. Alex, Rahul S."
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          disabled={!isPreverified || loading}
          hint="Your public name visible to study room members"
        />

        <Input
          label="Email Address"
          type="email"
          placeholder="your.email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={!isPreverified || loading}
          autoComplete="email"
        />

        <Input
          label="Password"
          type="password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={!isPreverified || loading}
          autoComplete="new-password"
        />

        <Button
          type="submit"
          size="lg"
          isLoading={loading}
          disabled={!isPreverified}
        >
          {isPreverified ? "Complete Registration & Enter Room" : "Enrollment Required to Register"}
        </Button>
      </form>

      <div className="text-center text-xs text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="text-zinc-100 font-semibold underline underline-offset-4 hover:text-white">
          Log in
        </Link>
      </div>

      <AuthInstallOptions />
    </div>
  );
}
