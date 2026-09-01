"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { validateDisplayName } from "@/lib/validation/schemas";
import {
  Settings,
  LogOut,
  User,
  Star,
  BookOpen,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Crown,
} from "lucide-react";

export default function SettingsPage() {
  const { user, profile, loading: authLoading, signOut, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setAvatarUrl(profile.avatar_url || null);
    }
  }, [profile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateDisplayName(displayName);
    if (!validation.isValid) {
      setError(validation.error || "Invalid display name");
      setSuccess(null);
      return;
    }

    if (!user) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { error: updateErr } = await (
        supabase.from("users") as unknown as {
          update: (data: Record<string, unknown>) => {
            eq: (col: string, val: string) => Promise<{ error: unknown }>;
          };
        }
      )
        .update({
          display_name: validation.value,
          avatar_url: avatarUrl || null,
        })
        .eq("id", user.id);

      if (updateErr) throw updateErr;

      await refreshProfile();
      setSuccess("Profile updated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const isAchiever = profile?.has_achiever_badge === true;

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      {/* Fluid Screen Container */}
      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-5">
        {/* Main Hero Header Card */}
        <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-2 backdrop-blur-md">
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <div className="p-2 sm:p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0">
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight leading-snug">
                Account & Settings
              </h1>
              <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug">
                Manage your public profile identity and account preferences
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Achiever Status Banner (Soft Faded Amber Accent) */}
        {isAchiever && (
          <div className="p-4 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-center space-x-3.5 shadow-sm">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
              <Crown className="w-5 h-5 fill-amber-400 text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-1.5">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-amber-200">
                  Weekly Achiever Badge Active
                </h3>
              </div>
              <p className="text-[11px] text-amber-200/80 mt-0.5 leading-snug">
                You are currently holding the Weekly Achiever rank for top group performance!
              </p>
            </div>
          </div>
        )}

        {/* App Guide & Feature Handbook Tile */}
        <button
          type="button"
          onClick={() => router.push("/guide")}
          className="w-full flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-zinc-900/70 hover:bg-zinc-900 border border-zinc-800/90 hover:border-zinc-700 transition-all text-left shadow-sm touch-manipulation group"
        >
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 shrink-0">
              <BookOpen className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs sm:text-sm font-extrabold text-zinc-100 group-hover:text-emerald-300 transition-colors leading-snug">
                App Guide & Feature Handbook
              </h2>
              <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug">
                Learn feature mechanics, 50/30/20 scoring rules, and time badges
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
        </button>

        {/* Profile Editor Card */}
        <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-violet-400" />
              <h2 className="text-xs sm:text-sm font-extrabold text-zinc-100 uppercase tracking-wider">
                Public Profile
              </h2>
            </div>
            <span className="text-[10px] sm:text-xs text-zinc-400">
              Visible to room peers
            </span>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-3 bg-emerald-950/40 border border-emerald-800/80 rounded-xl text-xs font-medium text-emerald-200 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{success}</span>
              </div>
            )}

            {/* Display Name Input */}
            <div className="space-y-1.5">
              <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-zinc-300">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={32}
                required
                placeholder="Enter your name"
                className="w-full px-3.5 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-medium"
              />
              <p className="text-[10px] text-zinc-500">
                Max 32 characters. Visible on Leaderboards and Member cards.
              </p>
            </div>

            {/* Avatar Upload Component */}
            {user && (
              <div className="pt-2 border-t border-zinc-800/60">
                <AvatarUpload
                  userId={user.id}
                  displayName={displayName || "User"}
                  currentAvatarUrl={avatarUrl}
                  onAvatarUploaded={(url) => setAvatarUrl(url)}
                />
              </div>
            )}

            {/* Save Button */}
            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                isLoading={saving}
                disabled={authLoading}
                className="w-full font-extrabold text-xs sm:text-sm space-x-1.5 shadow-md"
              >
                <Sparkles className="w-4 h-4" />
                <span>Save Profile Changes</span>
              </Button>
            </div>
          </form>
        </div>

        {/* Sign Out Card */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setIsSignOutModalOpen(true)}
            disabled={authLoading}
            className="w-full flex items-center justify-center space-x-2 p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 hover:text-rose-200 font-extrabold text-xs sm:text-sm transition-all shadow-sm touch-manipulation"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out of Account</span>
          </button>
        </div>
      </main>

      {/* Sign Out Confirmation Modal */}
      <Modal
        isOpen={isSignOutModalOpen}
        onClose={() => setIsSignOutModalOpen(false)}
        title="Sign Out"
        subtitle="Are you sure you want to sign out of your StudyRoom account?"
      >
        <div className="space-y-4 pt-1">
          <p className="text-xs text-zinc-400">
            You will need to enter your magic link or credentials to sign back in.
          </p>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsSignOutModalOpen(false)}
              disabled={authLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={signOut}
              isLoading={authLoading}
              className="font-extrabold"
            >
              Confirm Sign Out
            </Button>
          </div>
        </div>
      </Modal>

      <BottomNav />
    </div>
  );
}
