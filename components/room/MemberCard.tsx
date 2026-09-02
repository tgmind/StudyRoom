"use client";

import React, { memo } from "react";
import { UserProfile } from "@/lib/supabase/types";
import { IndicatorTag } from "@/components/room/Indicators";
import { isDeepNight, isEarlyBird } from "@/lib/time/indicators";
import {
  formatDurationSeconds,
  calculateMemberElapsedStudySeconds,
  formatSecondsToHuman,
  calculateMemberLiveBreakSeconds,
} from "@/lib/time/format";
import { Crown, Star, Pause, Coffee, Clock, BookOpen } from "lucide-react";

interface MemberCardProps {
  member: UserProfile;
  isCurrentUser?: boolean;
  customElapsedSeconds?: number;
  currentTimestamp?: Date;
}

export const MemberCard = memo(function MemberCard({
  member,
  isCurrentUser = false,
  customElapsedSeconds,
  currentTimestamp = new Date(),
}: MemberCardProps) {
  const isStudying = member.current_status === "studying";
  const isBreak = member.current_status === "break";
  const isOffline = member.current_status === "offline";
  const isAchiever = member.has_achiever_badge === true;

  const showDeepNight = isDeepNight(member.current_status, currentTimestamp);
  const showEarlyBird = isEarlyBird(member.current_status, currentTimestamp);

  // 1. Live Active Session Study Seconds (0 if offline)
  const elapsedSeconds =
    isCurrentUser && customElapsedSeconds !== undefined
      ? customElapsedSeconds
      : calculateMemberElapsedStudySeconds(member, currentTimestamp);

  // 2. Live Break Timer (ticking by the second when on break, 0 otherwise)
  const liveBreakSeconds = calculateMemberLiveBreakSeconds(member, currentTimestamp);

  // 3. Total Study Duration of Current 24 Hours
  // Sum of completed study session seconds in past 24h + current active study seconds (if currently studying or on break)
  const total24hStudySeconds =
    (member.past_24h_study_seconds ?? 0) + (isStudying || isBreak ? elapsedSeconds : 0);

  // 4. Completed Sessions Count
  const sessionsCount = member.total_sessions_count ?? 0;

  const initials = member.display_name
    ? member.display_name.substring(0, 2).toUpperCase()
    : "??";

  return (
    <div
      className={`relative isolate flex flex-col items-center justify-between p-3 sm:p-4 rounded-2xl border transition-all duration-200 select-none ${
        isAchiever
          ? "bg-gradient-to-b from-amber-950/40 via-zinc-900/95 to-zinc-950 border-amber-400/60 ring-1 ring-amber-400/30 shadow-[0_4px_25px_rgba(251,191,36,0.18)]"
          : isStudying
          ? "bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 border-fuchsia-500/40 ring-1 ring-fuchsia-500/20 shadow-[0_4px_20px_rgba(217,70,239,0.15)]"
          : isBreak
          ? "bg-gradient-to-b from-amber-950/30 via-zinc-900/90 to-zinc-950/95 border-amber-500/50 ring-1 ring-amber-500/30 shadow-[0_4px_20px_rgba(245,158,11,0.12)]"
          : "bg-zinc-950/60 border-zinc-900/80 opacity-60 grayscale hover:opacity-95 hover:grayscale-0"
      }`}
    >
      {/* Floating Status Badge (Top-Left) */}
      {isAchiever ? (
        <span
          className="absolute top-2.5 left-2.5 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 text-[9px] font-black uppercase tracking-wider shadow-md"
          title="Weekly Achiever"
        >
          <Crown className="w-2.5 h-2.5 fill-zinc-950" />
          <span>Achiever</span>
        </span>
      ) : isBreak ? (
        <span
          className="absolute top-2.5 left-2.5 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 text-[9px] font-extrabold uppercase tracking-wider shadow-sm animate-pulse"
          title="Member is currently on break"
        >
          <Coffee className="w-2.5 h-2.5" />
          <span>On Break</span>
        </span>
      ) : isStudying ? (
        <span
          className="absolute top-2.5 left-2.5 flex items-center space-x-1 px-2 py-0.5 rounded-full bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300 text-[9px] font-extrabold uppercase tracking-wider shadow-sm"
          title="Member is studying"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-ping" />
          <span>Studying</span>
        </span>
      ) : null}

      {/* Floating "YOU" badge (Top-Right) */}
      {isCurrentUser && (
        <span className="absolute top-2.5 right-2.5 text-[9px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-sm">
          You
        </span>
      )}

      {/* Top: Avatar DP Container */}
      <div className={`relative flex flex-col items-center ${isAchiever || isBreak || isStudying ? "mt-3.5" : "mt-1"}`}>
        {/* Crown for Weekly Achiever */}
        {isAchiever && (
          <div className="absolute -top-3 animate-bounce">
            <Crown className="w-5 h-5 text-amber-400 fill-amber-400 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]" />
          </div>
        )}

        {/* Avatar DP */}
        <div
          className={`relative w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-zinc-800 border-2 overflow-hidden shrink-0 aspect-square flex items-center justify-center font-extrabold text-zinc-100 text-sm shadow-md ${
            isAchiever
              ? "border-amber-400 ring-2 ring-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.3)]"
              : isStudying
              ? "border-fuchsia-500 ring-2 ring-fuchsia-500/40 shadow-[0_0_15px_rgba(217,70,239,0.25)]"
              : isBreak
              ? "border-amber-500 ring-2 ring-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
              : "border-zinc-800"
          }`}
        >
          {member.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={member.avatar_url}
              alt={member.display_name}
              className="w-full h-full object-cover object-center rounded-full block"
              loading="lazy"
            />
          ) : (
            <span>{initials}</span>
          )}

          {/* Live Status Pulse Dot on Avatar */}
          {!isOffline && (
            <span
              className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-zinc-950 ${
                isStudying ? "bg-fuchsia-500" : "bg-amber-500"
              }`}
            />
          )}
        </div>
      </div>

      {/* Middle: User Name & Time of Day Badges */}
      <div className="w-full text-center mt-2.5 space-y-0.5 min-w-0">
        <div className="flex items-center justify-center space-x-1 min-w-0 px-1">
          <h3
            className={`text-xs sm:text-sm font-extrabold truncate ${
              isAchiever ? "text-amber-200 drop-shadow-sm font-black" : "text-zinc-100"
            }`}
            title={member.display_name}
          >
            {member.display_name}
          </h3>
          {isAchiever && (
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
          )}
        </div>

        {/* Time of Day Badges */}
        {(showDeepNight || showEarlyBird) && (
          <div className="flex items-center justify-center space-x-1 pt-0.5">
            {showDeepNight && <IndicatorTag type="night" />}
            {showEarlyBird && <IndicatorTag type="early" />}
          </div>
        )}
      </div>

      {/* Middle Stats Row: 24h Total Study Duration + Sessions Count */}
      <div className="w-full flex items-center justify-center gap-1.5 xs:gap-2 text-[10px] text-zinc-400 mt-2 pt-1.5 border-t border-zinc-800/40 min-w-0">
        <div
          className="flex items-center gap-1 min-w-0"
          title={`Total study duration in current 24 hours: ${formatSecondsToHuman(total24hStudySeconds)}`}
        >
          <Clock className="w-2.5 h-2.5 text-fuchsia-400/90 shrink-0" />
          <span className="font-bold text-zinc-200 tabular-nums truncate text-[10px] sm:text-[11px]">
            {formatSecondsToHuman(total24hStudySeconds)}
          </span>
          <span className="text-[9px] text-zinc-500 hidden xs:inline">24h</span>
        </div>

        <span className="text-zinc-700 font-bold select-none">•</span>

        <div
          className="flex items-center gap-1 min-w-0"
          title={`Completed study sessions: ${sessionsCount}`}
        >
          <BookOpen className="w-2.5 h-2.5 text-violet-400/90 shrink-0" />
          <span className="font-bold text-zinc-200 tabular-nums text-[10px] sm:text-[11px]">
            {sessionsCount}
          </span>
          <span className="text-[9px] text-zinc-500">
            {sessionsCount === 1 ? "sess" : "sess"}
          </span>
        </div>
      </div>

      {/* Bottom: Live Digital Timer Readout Pill */}
      <div className="w-full mt-2 pt-2 border-t border-zinc-800/60 flex justify-center">
        {isStudying ? (
          <div className="font-mono text-xs font-black tracking-tight px-2.5 sm:px-3 py-1 rounded-full border shadow-inner flex items-center space-x-1.5 bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-500/30 tabular-nums">
            <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
            <span>{formatDurationSeconds(elapsedSeconds)}</span>
          </div>
        ) : isBreak ? (
          <div className="w-full flex flex-col items-center gap-1">
            {/* Live Break Timer (Ticking Up Second-by-Second) */}
            <div className="font-mono text-xs font-black tracking-tight px-2.5 py-1 rounded-full border shadow-inner flex items-center space-x-1.5 bg-amber-950/60 text-amber-300 border-amber-500/50 tabular-nums animate-pulse">
              <Coffee className="w-3 h-3 text-amber-400 shrink-0" />
              <span>Break {formatDurationSeconds(liveBreakSeconds)}</span>
            </div>
            {/* Paused Study Session Timer Sub-Readout */}
            <div className="text-[10px] text-zinc-400 font-medium flex items-center space-x-1 tabular-nums">
              <Pause className="w-2.5 h-2.5 text-amber-400/70 shrink-0" />
              <span>Study: {formatDurationSeconds(elapsedSeconds)}</span>
            </div>
          </div>
        ) : (
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-900/60 border border-zinc-800/80">
            Offline
          </span>
        )}
      </div>
    </div>
  );
});
