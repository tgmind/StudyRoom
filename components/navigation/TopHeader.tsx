"use client";

import React, { memo, useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { UserProfile } from "@/lib/supabase/types";
import { Star } from "lucide-react";

export const HEADER_PEEK_MS = 8_000;

interface TopHeaderProps {
  memberCount?: number;
  isRealtimeConnected?: boolean;
  connectionState?: "connecting" | "connected" | "reconnecting" | "offline";
  profile?: UserProfile | null;
  expectedPeakHours?: string | null;
  isStudying?: boolean;
}

export const TopHeader = memo(function TopHeader({
  memberCount = 0,
  isRealtimeConnected = true,
  connectionState,
  profile,
  expectedPeakHours,
  isStudying,
}: TopHeaderProps) {
  const [isMounted, setIsMounted] = useState(false);

  // Determine if the user is currently in a study session
  const effectiveIsStudying =
    isStudying !== undefined
      ? isStudying
      : profile?.current_status === "studying" || profile?.current_status === "break";

  // When in a study session, the header must be compact. When not, it must stay expanded.
  const [isCompact, setIsCompact] = useState(effectiveIsStudying);
  const peekTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const clearPeekTimer = useCallback(() => {
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }, []);

  // Synchronize state when study session status changes
  useEffect(() => {
    clearPeekTimer();
    if (effectiveIsStudying) {
      setIsCompact(true);
    } else {
      setIsCompact(false);
    }
  }, [effectiveIsStudying, clearPeekTimer]);

  // Allow temporary peek expansion when tapping/hovering the compact bar while studying
  const handlePeekExpand = useCallback(() => {
    if (!effectiveIsStudying) return;
    setIsCompact(false);
    clearPeekTimer();
    peekTimerRef.current = setTimeout(() => {
      setIsCompact(true);
    }, HEADER_PEEK_MS);
  }, [effectiveIsStudying, clearPeekTimer]);

  useEffect(() => {
    return () => {
      clearPeekTimer();
    };
  }, [clearPeekTimer]);

  const initials = profile?.display_name
    ? profile.display_name.substring(0, 2).toUpperCase()
    : "??";

  const isReconnecting = connectionState === "reconnecting";
  const isConnecting = connectionState === "connecting";
  const isOffline = connectionState === "offline" || (!connectionState && !isRealtimeConnected);

  const statusDotClass = isReconnecting
    ? "bg-amber-400 animate-pulse"
    : isConnecting
    ? "bg-sky-400 animate-pulse"
    : isOffline
    ? "bg-zinc-600"
    : "bg-fuchsia-500 animate-pulse";

  const statusTitle = isReconnecting
    ? "Reconnecting..."
    : isConnecting
    ? "Connecting..."
    : isOffline
    ? "Offline"
    : "Connected";

  return (
    <header
      onClick={isCompact ? handlePeekExpand : undefined}
      onMouseEnter={isCompact ? handlePeekExpand : undefined}
      aria-label={isCompact ? "Compact navigation bar (click to expand)" : "Application header"}
      title={isCompact ? "Click to expand header" : undefined}
      className={`sticky top-0 z-30 bg-zinc-950 border-b border-zinc-800/80 shadow-md transition-all duration-300 ease-in-out motion-reduce:transition-none ${
        isCompact ? "py-1 cursor-pointer" : "py-2.5 sm:py-3"
      }`}
      style={{
        paddingTop: isCompact
          ? "calc(0.25rem + env(safe-area-inset-top, 0px))"
          : "calc(0.625rem + env(safe-area-inset-top, 0px))",
      }}
    >
      {isCompact ? (
        /* Compact, very thin opaque docked bar */
        <div className="max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 mx-auto flex items-center justify-between h-6 sm:h-7 animate-fade-in">
          {/* Top Left: Member count pill */}
          {memberCount > 0 ? (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10.5px] font-bold text-zinc-300 shrink-0">
              <span
                className={`w-1.5 h-1.5 rounded-full ${statusDotClass}`}
                title={statusTitle}
              />
              <span>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </span>
            </div>
          ) : (
            <div />
          )}

          {/* Top Right: Expected peak information */}
          {expectedPeakHours ? (
            <div className="flex items-center space-x-1.5 select-none text-[10px] text-zinc-400 font-medium tracking-tight">
              <span className="w-1 h-1 rounded-full bg-zinc-600 shrink-0" />
              <span>
                Expected peak: <span className="text-zinc-200 font-bold">{expectedPeakHours}</span>
              </span>
            </div>
          ) : (
            <div />
          )}
        </div>
      ) : (
        /* Full expanded header bar */
        <div className="max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 mx-auto flex items-center justify-between animate-fade-in">
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
                    className={`w-2 h-2 rounded-full ${statusDotClass}`}
                    title={statusTitle}
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
      )}
    </header>
  );
});
