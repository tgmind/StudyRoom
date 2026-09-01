"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { validateDisplayName } from "@/lib/validation/schemas";

export default function OnboardingPage() {
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (profile && profile.display_name && profile.display_name.trim() !== "") {
      router.push("/room");
    }
  }, [user, profile, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateDisplayName(displayName);
    if (!validation.isValid) {
      setError(validation.error || "Invalid display name");
      return;
    }

    if (!user) {
      setError("User session expired. Please log in again.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: upsertErr } = await (
        supabase.from("users") as unknown as {
          upsert: (data: Record<string, unknown>) => Promise<{ error: unknown }>;
        }
      ).upsert({
        id: user.id,
        display_name: validation.value,
        avatar_url: avatarUrl || null,
        current_status: "offline",
      });

      if (upsertErr) throw upsertErr;

      await refreshProfile();
      // Direct new user to interactive welcome guide first
      router.push("/guide?welcome=true");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 text-xs text-zinc-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 bg-zinc-950 border border-zinc-800 rounded-2xl shadow-xl space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
            Set Your Profile
          </h1>
          <p className="text-xs text-zinc-400">
            Choose your display name and profile picture to enter the live study room
          </p>
        </div>

        {/* Prominent Real Name Alert Banner */}
        <div className="p-3 bg-red-500/10 border border-red-500/35 rounded-xl flex items-start space-x-2.5 text-red-300 text-xs shadow-sm">
          <span className="font-bold leading-snug text-red-200">
            Use Your Real Name as far as possible.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="p-3 bg-red-950/50 border border-red-800 rounded-lg text-xs font-medium text-red-200">
              {error}
            </div>
          )}

          <Input
            label="Display Name *"
            placeholder="e.g. Alex, Sarah M."
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            maxLength={32}
            hint="Required. 2 to 32 characters."
            autoFocus
          />

          {user && (
            <AvatarUpload
              userId={user.id}
              displayName={displayName || "User"}
              currentAvatarUrl={avatarUrl}
              onAvatarUploaded={(url) => setAvatarUrl(url)}
            />
          )}

          <Button type="submit" size="lg" isLoading={saving}>
            Enter StudyRoom
          </Button>
        </form>
      </div>
    </div>
  );
}
