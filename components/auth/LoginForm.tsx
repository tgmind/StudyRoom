"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { isAdminEmail, isAdminUserId } from "@/hooks/useAdmin";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const trimmedEmail = email.trim();
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (authErr) throw authErr;

      const loggedInUser = authData?.user;
      const isAdmin =
        isAdminEmail(trimmedEmail) ||
        (loggedInUser?.email ? isAdminEmail(loggedInUser.email) : false) ||
        isAdminUserId(loggedInUser?.id);

      if (isAdmin) {
        if (loggedInUser?.id) {
          try {
            localStorage.setItem("studyroom_admin_uid", loggedInUser.id);
          } catch {
            // ignore storage error
          }
        }
        window.location.href = "/admin";
        return;
      }

      window.location.href = "/room";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Welcome to StudyRoom
        </h1>
        <p className="text-xs text-zinc-400">
          Minimalist live group study for serious accountability
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        {error && (
          <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs font-medium text-red-200">
            {error}
          </div>
        )}

        <Input
          label="Email Address"
          type="email"
          placeholder="your.email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />

        <Button type="submit" size="lg" isLoading={loading}>
          Log In
        </Button>
      </form>

      <div className="text-center text-xs text-zinc-400">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-zinc-100 font-semibold underline underline-offset-4 hover:text-white">
          Sign up
        </Link>
      </div>
    </div>
  );
}
