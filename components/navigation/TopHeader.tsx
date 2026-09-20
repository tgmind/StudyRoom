"use client";

import React, { memo, useState, useEffect } from "react";
import Link from "next/link";
import { UserProfile } from "@/lib/supabase/types";
import { Star } from "lucide-react";

interface TopHeaderProps {
  memberCount?: number;
  isRealtimeConnected?: boolean;
  connectionState?: "connecting" | "connected" | "reconnecting" | "offline";
  profile?: UserProfile | null;
  expectedPeakHours?: string | null;
}

export const TopHeader = memo(function TopHeader({
  memberCount = 0,
  isRealtimeConnected = true,
  connectionState,
  profile,
  expectedPeakHours,
}: TopHeaderProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const initials = profile?.display_name
    ? profile.display_name.substring(0, 2).toUpperCase()
    : "??";

  const isReconnecting = connectionState === "reconnecting";
  const isOffline = connectionState === "offline" || (!connectionState && !isRealtimeConnected);
  const isConnected = connectionState === "connected" || (!connectionState && isRealtimeConnected);

  return (
    <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/80 px-0 py-2.5 sm:py-3 shadow-md">
      <div className="max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 mx-auto flex items-center justify-between">
        {/* Brand, Member Counter & Expected Peak Hours */}
        <div className="flex flex-col min-w-0 flex-1 pr-2">
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <Link
              href="/room"
              className="text-base font-extrabold tracking-tight text-zinc-100 hover:text-white transition-colors shrink-0"
            >
              StudyRoom
            </Link>

            {memberCount > 0 && (
              <div className="flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] font-bold text-zinc-300 shrink-0">
                <span
                  className={`w-2 h-2 rounded-full ${
                    isReconnecting
                      ? "bg-amber-400 animate-pulse"
                      : isOffline
                      ? "bg-zinc-600"
                      : "bg-fuchsia-500 animate-pulse"
                  }`}
                  title={isReconnecting ? "Reconnecting..." : isOffline ? "Offline" : "Connected"}
                />
                <span>
                  {memberCount} {memberCount === 1 ? "member" : "members"}
                </span>
              </div>
            )}
          </div>

          {expectedPeakHours && (
            <div className="flex items-center space-x-1.5 mt-0.5 select-none text-[10px] text-zinc-400 font-medium tracking-tight flex-wrap">
              <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
              <span className="break-words">
                Expected peak: <span className="text-zinc-300 font-bold">{expectedPeakHours}</span>
              </span>
            </div>
          )}
        </div>

        {/* User Profile Avatar / Achiever Badge */}
        {profile && isMounted && (
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
