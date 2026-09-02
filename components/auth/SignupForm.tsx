"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Info } from "lucide-react";

export function SignupForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

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

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: displayName.trim() || undefined,
          },
        },
      });

      if (authErr) throw authErr;

      if (data.user) {
        if (!data.session) {
          // Email confirmation is required by Supabase project settings
          setSuccess(
            "Account created successfully! If email confirmation is enabled, please verify your email before logging in. You can now proceed to Log In."
          );
          return;
        }

        // Active session established: update display_name if provided
        if (displayName.trim()) {
          try {
            await (
              supabase.from("users") as unknown as {
                update: (data: Record<string, unknown>) => {
                  eq: (col: string, val: string) => Promise<{ error: unknown }>;
                };
              }
            )
              .update({ display_name: displayName.trim() })
              .eq("id", data.user.id);
          } catch {
            // non-fatal
          }
          window.location.href = "/room";
        } else {
          window.location.href = "/onboarding";
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

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

        {success && (
          <div className="p-3.5 bg-violet-950/40 border border-violet-800/80 rounded-xl text-xs font-medium text-violet-200 space-y-1">
            <p className="font-bold text-violet-100">Notice</p>
            <p className="text-violet-300 leading-relaxed">{success}</p>
          </div>
        )}

        <Input
          label="Display Name"
          type="text"
          placeholder="e.g. Alex, Rahul S."
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          hint="Your public name visible to study room members"
        />

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
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
        />

        <Button type="submit" size="lg" isLoading={loading}>
          Sign Up & Join Room
        </Button>
      </form>

      <div className="text-center text-xs text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="text-zinc-100 font-semibold underline underline-offset-4 hover:text-white">
          Log in
        </Link>
      </div>
    </div>
  );
}
