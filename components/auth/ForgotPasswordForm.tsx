"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ArrowLeft, CheckCircle2, Mail, AlertCircle } from "lucide-react";
import { AuthInstallOptions } from "@/components/auth/AuthInstallOptions";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const supabase = createClient();

  // Handle countdown for resend button
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/reset-password`
          : "/reset-password";

      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: redirectUrl,
      });

      if (resetErr) {
        // Provide friendly message on Supabase rate-limiting
        if (resetErr.message?.toLowerCase().includes("rate limit") || resetErr.status === 429) {
          setError("Too many requests. Please wait a minute before requesting another reset link.");
        } else {
          setError(resetErr.message || "Failed to send reset email. Please check the email and try again.");
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
      {/* Back button */}
      <div>
        <Link
          href="/login"
          className="inline-flex items-center space-x-1.5 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Log In</span>
        </Link>
      </div>

      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Reset Password
        </h1>
        <p className="text-xs text-zinc-400">
          Enter your registered email address and we&apos;ll send you a recovery link
        </p>
      </div>

      {success ? (
        <div className="space-y-4 animate-in fade-in duration-200">
          <div className="p-4 bg-emerald-950/40 border border-emerald-800/70 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span className="text-sm font-semibold">Check your email</span>
            </div>
            <p className="text-xs text-emerald-200/90 leading-relaxed">
              We&apos;ve sent a password reset link to <strong className="text-white">{email.trim()}</strong>.
            </p>
            <p className="text-[11px] text-zinc-400 leading-relaxed pt-1">
              Click the link inside the email to set a new password. If you don&apos;t see it in a few moments, be sure to check your spam or junk folder.
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="w-full text-xs"
              onClick={handleResetRequest}
              disabled={loading || resendCooldown > 0}
              isLoading={loading}
            >
              {resendCooldown > 0
                ? `Resend Link in ${resendCooldown}s`
                : "Resend Reset Link"}
            </Button>

            <Link href="/login" className="block w-full">
              <Button type="button" variant="primary" size="lg" className="w-full text-xs">
                Return to Log In
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleResetRequest} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs font-medium text-red-200 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Input
            label="Account Email Address"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus
          />

          <Button type="submit" size="lg" isLoading={loading} className="w-full">
            <Mail className="w-4 h-4 mr-2" />
            Send Reset Link
          </Button>

          <div className="text-center text-xs text-zinc-400 pt-1">
            Remember your password?{" "}
            <Link href="/login" className="text-zinc-100 font-semibold underline underline-offset-4 hover:text-white">
              Log in
            </Link>
          </div>
        </form>
      )}

      <AuthInstallOptions />
    </div>
  );
}
