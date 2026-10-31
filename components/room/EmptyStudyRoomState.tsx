"use client";

import React, { memo } from "react";
import { Play, Users } from "lucide-react";
import { StudyLampIllustration } from "./StudyLampIllustration";

export interface EmptyStudyRoomStateProps {
  totalMembers?: number;
  onStartSession?: () => void;
  className?: string;
}

export const EmptyStudyRoomState = memo(function EmptyStudyRoomState({
  totalMembers = 0,
  onStartSession,
  className = "",
}: EmptyStudyRoomStateProps) {
  const handleStart = () => {
    if (onStartSession) {
      onStartSession();
      return;
    }
    if (typeof window !== "undefined") {
      if ((window as any).__studyRoomStartSession) {
        (window as any).__studyRoomStartSession();
        return;
      }
      const controllerEl =
        document.querySelector('[aria-label="Session Controller"]') ||
        document.querySelector("#session-controller");
      if (controllerEl) {
        controllerEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const peerCountText =
    totalMembers > 0
      ? `${totalMembers} ${totalMembers === 1 ? "peer" : "peers"} in room available`
      : "Be the first in the room";

  return (
    <div
      data-testid="empty-study-room-state"
      className={`relative w-full rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-md overflow-hidden transition-all duration-300 ${className}`}
    >
      {/* Ambient background glow accents */}
      <div
        className="pointer-events-none absolute -top-16 -left-16 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-16 right-0 w-72 h-72 bg-fuchsia-600/5 rounded-full blur-3xl"
        aria-hidden="true"
      />

      {/* ============================================================ */}
      {/* 1. DESKTOP / LARGE TABLET VIEWPORT (lg:flex, wide panoramic) */}
      {/* ============================================================ */}
      <div className="hidden lg:flex items-center justify-between gap-6 p-6 xl:p-8 relative z-10">
        {/* Left Side: Art-Directed Desk Lamp Illustration */}
        <div className="w-[320px] xl:w-[360px] flex-shrink-0 flex items-center justify-center">
          <StudyLampIllustration className="w-full h-auto max-h-[195px] drop-shadow-[0_12px_28px_rgba(168,85,247,0.18)]" />
        </div>

        {/* Right Side: Informational Hierarchy & Call to Action */}
        <div className="flex-1 min-w-0 space-y-3.5 pl-2">
          {/* Status Badge */}
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-950/50 border border-purple-800/40 text-purple-300 text-[11px] font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span>Live Peer Study • Room Quiet</span>
          </div>

          {/* Heading */}
          <p className="text-xl xl:text-2xl font-bold text-white tracking-tight leading-snug">
            No members actively studying right now
          </p>

          {/* Subtitle / Value Proposition */}
          <p className="text-xs xl:text-sm text-zinc-400 leading-relaxed max-w-xl">
            Be the first to enter the flow state. Starting your timer broadcasts your focus,
            sets the pace, and motivates peers to jump into the room with you.
          </p>

          {/* Action Row */}
          <div className="flex items-center space-x-4 pt-1">
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center space-x-2.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-purple-600 hover:from-purple-500 hover:to-fuchsia-500 text-white text-xs xl:text-sm font-semibold shadow-lg shadow-purple-600/25 hover:shadow-purple-600/40 active:scale-[0.98] transition-all duration-200 cursor-pointer group"
            >
              <Play className="w-3.5 h-3.5 fill-current transition-transform duration-200 group-hover:scale-110" />
              <span>Start Studying</span>
            </button>

            <div className="flex items-center space-x-1.5 text-xs text-zinc-400 font-medium bg-zinc-900/60 px-3 py-2 rounded-lg border border-zinc-800/60">
              <Users className="w-3.5 h-3.5 text-zinc-400" />
              <span>{peerCountText}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. MOBILE & COMPACT VIEWPORT (< lg, enlarged graphic + overlay) */}
      {/* ============================================================ */}
      <div className="flex lg:hidden flex-col items-center justify-center relative w-full pt-1.5 pb-0 overflow-hidden">
        {/* Enlarged Hero Lamp Graphic as Primary Centerpiece */}
        <div className="w-full max-w-[280px] sm:max-w-[320px] mx-auto px-2">
          <StudyLampIllustration className="w-full h-auto max-h-[160px] sm:max-h-[175px] drop-shadow-[0_8px_24px_rgba(168,85,247,0.22)]" />
        </div>

        {/* Beautiful Non-Hindering Overlapping Text Scrim */}
        <div className="absolute inset-x-0 bottom-0 pt-7 pb-2 px-3 bg-gradient-to-t from-zinc-950 via-zinc-950/75 to-transparent flex flex-col items-center text-center pointer-events-none">
          <p className="text-xs sm:text-sm font-bold text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.85)]">
            No members studying
          </p>
          <p className="text-[11px] sm:text-xs text-zinc-400 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
            Start your timer to lead the session
          </p>
        </div>
      </div>
    </div>
  );
});
