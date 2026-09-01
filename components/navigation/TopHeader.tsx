"use client";

import React, { memo } from "react";
import Link from "next/link";
import { UserProfile } from "@/lib/supabase/types";
import { Star } from "lucide-react";

interface TopHeaderProps {
  memberCount?: number;
  isRealtimeConnected?: boolean;
  profile?: UserProfile | null;
}

export const TopHeader = memo(function TopHeader({
  memberCount = 0,
  isRealtimeConnected = true,
  profile,
}: TopHeaderProps) {
  const initials = profile?.display_name
    ? profile.display_name.substring(0, 2).toUpperCase()
    : "??";

  return (
    <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/80 px-0 py-3 shadow-md">
      <div className="max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 mx-auto flex items-center justify-between">
        {/* Brand & Member Counter */}
        <div className="flex items-center space-x-3">
          <Link
            href="/room"
            className="text-base font-extrabold tracking-tight text-zinc-100 hover:text-white transition-colors"
          >
            StudyRoom
          </Link>

          {memberCount > 0 && (
            <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300">
              <span
                className={`w-2 h-2 rounded-full ${
                  isRealtimeConnected ? "bg-emerald-500 animate-pulse" : "bg-zinc-600"
                }`}
              />
              <span>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
            </div>
          )}
        </div>

        {/* User Profile Avatar / Achiever Badge */}
        {profile && (
          <Link
            href="/settings"
            className="flex items-center space-x-2 p-1 rounded-full hover:bg-zinc-900 transition-colors"
            title="Account & Settings"
          >
            {profile.has_achiever_badge && (
              <span title="⭐ Weekly Achiever">
                <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              </span>
            )}

            <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center text-xs font-extrabold text-zinc-200 shadow-inner">
              {profile.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{initials}</span>
              )}
            </div>
          </Link>
        )}
      </div>
    </header>
  );
});
