"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CheckCircle2, AlertCircle, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { AuthInstallOptions } from "@/components/auth/AuthInstallOptions";

export function ResetPasswordForm() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasValidSession, setHasValidSession] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      try {
        // 1. Client-side fallback: check if 'code' param is in URL (direct redirect without route handler)
        if (typeof window !== "undefined") {
          const searchParams = new URLSearchParams(window.location.search);
          const code = searchParams.get("code");
          if (code) {
            const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
            if (!exchangeErr && isMounted) {
              setHasValidSession(true);
              setCheckingSession(false);
              return;
            }
          }
        }

        // 2. Check active session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session && isMounted) {
          setHasValidSession(true);
          setCheckingSession(false);
          return;
        }

        // 3. Fallback: listen for auth events (e.g. PASSWORD_RECOVERY)
        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((event, currentSession) => {
          if (!isMounted) return;
          if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && currentSession)) {
            setHasValidSession(true);
            setCheckingSession(false);
          }
        });

        // Safety timeout of 1.2s before declaring no session found
        const timeout = setTimeout(() => {
          if (isMounted) {
            setCheckingSession(false);
          }
        }, 1200);

        return () => {
          subscription.unsubscribe();
          clearTimeout(timeout);
        };
      } catch {
        if (isMounted) {
          setCheckingSession(false);
        }
      }
    }

    initSession();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!password) {
      setError("Please enter a new password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateErr) {
        setError(updateErr.message || "Failed to update password. Your reset link may have expired.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      // Hard redirect to /room after short confirmation
      setTimeout(() => {
        window.location.href = "/room";
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred while updating your password.");
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="w-full max-w-md mx-auto p-8 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center justify-center space-y-3">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
        <p className="text-xs text-zinc-400">Verifying password recovery link...</p>
      </div>
    );
  }

  if (!hasValidSession) {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-800/80 flex items-center justify-center text-red-400 mx-auto mb-3">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100">
            Invalid or Expired Link
          </h1>
          <p className="text-xs text-zinc-400 leading-relaxed px-4">
            This password recovery link is either invalid, has expired, or has already been used. Please request a fresh reset link.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Link href="/forgot-password" className="block w-full">
            <Button type="button" variant="primary" size="lg" className="w-full text-xs">
              Request New Reset Link
            </Button>
          </Link>

          <Link href="/login" className="block w-full">
            <Button type="button" variant="outline" size="lg" className="w-full text-xs">
              Back to Log In
            </Button>
          </Link>
        </div>

        <AuthInstallOptions />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
      <div className="text-center space-y-1">
        <div className="w-10 h-10 rounded-full bg-violet-950/60 border border-violet-800/80 flex items-center justify-center text-violet-400 mx-auto mb-3">
          <KeyRound className="w-5 h-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Set New Password
        </h1>
        <p className="text-xs text-zinc-400">
          Enter a new secure password for your StudyRoom account
        </p>
      </div>

      {success ? (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800/70 rounded-xl space-y-2 text-center animate-in fade-in duration-200">
          <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto" />
          <h3 className="text-sm font-semibold text-emerald-200">
            Password Updated Successfully!
          </h3>
          <p className="text-xs text-zinc-400 flex items-center justify-center space-x-1 pt-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-zinc-400" />
            <span>Logging you into StudyRoom...</span>
          </p>
        </div>
      ) : (
        <form onSubmit={handleUpdatePassword} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs font-medium text-red-200 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="relative">
            <Input
              label="New Password"
              type={showPassword ? "text" : "password"}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-8 text-zinc-400 hover:text-zinc-200 p-1"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <Input
            label="Confirm New Password"
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />

          <Button type="submit" size="lg" isLoading={loading} className="w-full">
            Update Password & Log In
          </Button>

          <div className="text-center text-xs text-zinc-400 pt-1">
            Remembered your old password?{" "}
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
