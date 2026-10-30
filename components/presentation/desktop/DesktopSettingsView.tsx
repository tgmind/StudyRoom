"use client";

import React, { memo } from "react";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { AvatarUpload } from "@/components/ui/AvatarUpload";
import { CommunityLinksCard } from "@/components/settings/CommunityLinksCard";
import { AppInfoCard } from "@/components/settings/AppInfoCard";
import { UserProfile } from "@/lib/supabase/types";
import {
  Settings,
  User,
  LogOut,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Crown,
  Star,
  BookOpen,
  ChevronRight,
} from "lucide-react";

export interface DesktopSettingsViewProps {
  user: any;
  profile: UserProfile | null;
  authLoading: boolean;
  displayName: string;
  setDisplayName: (name: string) => void;
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;
  saving: boolean;
  error: string | null;
  success: string | null;
  handleUpdateProfile: (e: React.FormEvent) => Promise<void>;
  isSignOutModalOpen: boolean;
  setIsSignOutModalOpen: (open: boolean) => void;
  handleSignOut: () => Promise<void>;
  onNavigateGuide: () => void;
}

export const DesktopSettingsView = memo(function DesktopSettingsView({
  user,
  profile,
  authLoading,
  displayName,
  setDisplayName,
  avatarUrl,
  setAvatarUrl,
  saving,
  error,
  success,
  handleUpdateProfile,
  isSignOutModalOpen,
  setIsSignOutModalOpen,
  handleSignOut,
  onNavigateGuide,
}: DesktopSettingsViewProps) {
  const isAchiever = profile?.has_achiever_badge === true;

  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full px-6 lg:px-8 xl:px-12 py-6 space-y-6">
        {/* Desktop Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-start space-x-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/25 text-violet-300 shrink-0 shadow-inner mt-0.5">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                Account & Preferences
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-3xl">
                Manage your public profile identity, avatar representation, and application preferences
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onNavigateGuide}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs sm:text-sm font-bold transition-all shadow-sm shrink-0 self-start md:self-auto cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-violet-400" />
            <span>Feature Handbook</span>
            <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
          </button>
        </div>

        {/* 1. TOP BALANCED 50/50 WORKSPACE DECK */}
        <div className="grid grid-cols-2 gap-6 items-start">
          {/* Left Wing: Profile Editor Card */}
          <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-6 shadow-xl space-y-5 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center space-x-2">
                <User className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-extrabold text-zinc-100 uppercase tracking-wider">
                  Public Profile
                </h2>
              </div>
              <span className="text-xs text-zinc-400">
                Visible to live study peers
              </span>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-5">
              {error && (
                <div className="p-3.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs font-medium text-rose-200 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>{error}</span>
                </div>
              )}
              {success && (
                <div className="p-3.5 bg-violet-950/40 border border-violet-800/80 rounded-xl text-xs font-medium text-violet-200 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-violet-400" />
                  <span>{success}</span>
                </div>
              )}

              {/* Display Name Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-300">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={32}
                  required
                  placeholder="Enter your name"
                  className="w-full px-4 py-2.5 bg-zinc-950/80 border border-zinc-800 rounded-xl text-sm text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all font-medium"
                />
                <p className="text-[11px] text-zinc-500">
                  Maximum 32 characters. Visible across Study Room and Leaderboards.
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
                  className="w-full font-extrabold text-sm space-x-2 shadow-md py-2.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Save Profile Changes</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Right Wing: Achiever Status, Community, App Info & Sign Out */}
          <div className="space-y-5">
            {/* Weekly Achiever Status Banner */}
            {isAchiever && (
              <div className="p-5 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-center space-x-4 shadow-sm">
                <div className="p-3 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                  <Crown className="w-6 h-6 fill-amber-400 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-1.5">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-200">
                      Weekly Achiever Crown Active
                    </h3>
                  </div>
                  <p className="text-xs text-amber-200/80 mt-0.5 leading-snug">
                    You hold the Weekly Achiever rank for premier group study consistency!
                  </p>
                </div>
              </div>
            )}

            {/* Community Links Card */}
            <CommunityLinksCard />

            {/* App Info Card */}
            <AppInfoCard />

            {/* Sign Out Card */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsSignOutModalOpen(true)}
                disabled={authLoading}
                className="w-full flex items-center justify-center space-x-2 p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-300 hover:text-rose-200 font-extrabold text-xs transition-all shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out of Account</span>
              </button>
            </div>
          </div>
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
              onClick={handleSignOut}
              isLoading={authLoading}
              className="font-extrabold"
            >
              Confirm Sign Out
            </Button>
          </div>
        </div>
      </Modal>
    </DesktopAppLayout>
  );
});
