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
  calculateMemberOfflineHours,
} from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";
import { Crown, Star, Coffee, Clock, BookOpen } from "lucide-react";

import { getEffectiveMemberStatus } from "@/lib/time/break";

interface MemberCardProps {
  member: UserProfile;
  isCurrentUser?: boolean;
  customElapsedSeconds?: number;
  currentTimestamp?: Date;
  compact?: boolean;
}

export const MemberCard = memo(function MemberCard({
  member,
  isCurrentUser = false,
  customElapsedSeconds,
  currentTimestamp = getServerNow(),
  compact = false,
}: MemberCardProps) {
  const effectiveStatus = getEffectiveMemberStatus(member, currentTimestamp);
  const isStudying = effectiveStatus === "studying";
  const isBreak = effectiveStatus === "break";
  const isOffline = effectiveStatus === "offline";
  const isBreakExpired = member.current_status === "break" && isOffline;
  const isAchiever = member.has_achiever_badge === true;

  const showDeepNight = isDeepNight(effectiveStatus, currentTimestamp);
  const showEarlyBird = isEarlyBird(effectiveStatus, currentTimestamp);

  // Derive latest offline duration for offline pill
  const { formattedPill: offlinePillText, formattedDetailed: offlineDetailedText } =
    calculateMemberOfflineHours(member, currentTimestamp);

  // 1. Live Active Session Study Seconds (0 if offline)
  const elapsedSeconds =
    isCurrentUser && customElapsedSeconds !== undefined
      ? customElapsedSeconds
      : calculateMemberElapsedStudySeconds(member, currentTimestamp);

  // 2. Live Break Timer (ticking by the second when on break, 0 otherwise)
  const liveBreakSeconds = isBreak ? calculateMemberLiveBreakSeconds(member, currentTimestamp) : 0;

  // 3. Total Realtime Live Weekly Study Duration (past completed sessions of the week + live active session)
  const isCurrentSessionActive = isStudying || isBreak;
  const totalWeeklyStudySeconds =
    (member.weekly_study_seconds ?? 0) +
    (isCurrentSessionActive
      ? elapsedSeconds
      : isBreakExpired
      ? (member.active_study_seconds_snapshot ?? 0)
      : 0);

  // 4. Total Sessions Count (completed sessions + active in-progress session)
  const sessionsCount = (member.total_sessions_count ?? 0) + (isCurrentSessionActive || isBreakExpired ? 1 : 0);

  const initials = member.display_name
    ? member.display_name.substring(0, 2).toUpperCase()
    : "??";

  return (
    <div
      className={`relative isolate flex flex-col items-center justify-between ${
        compact ? "p-2 sm:p-2.5 rounded-xl" : "p-3.5 sm:p-4 rounded-2xl"
      } border transition-all duration-200 select-none h-full w-full ${
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
          className={`absolute ${compact ? "top-1.5 left-1.5 text-[8px] px-1.5 py-0.2" : "top-2.5 left-2.5 text-[9px] px-2 py-0.5"} flex items-center space-x-1 rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 text-zinc-950 font-black uppercase tracking-wider shadow-md`}
          title="Weekly Achiever"
        >
          <Crown className={`${compact ? "w-2 h-2" : "w-2.5 h-2.5"} fill-zinc-950`} />
          <span>Achiever</span>
        </span>
      ) : isBreak ? (
        <span
          className={`absolute ${compact ? "top-1.5 left-1.5 text-[8px] px-1.5 py-0.2" : "top-2.5 left-2.5 text-[9px] px-2 py-0.5"} flex items-center space-x-1 rounded-full bg-amber-950/90 border border-amber-500/60 text-amber-300 font-extrabold uppercase tracking-wider shadow-sm`}
          title="Member is currently on break"
        >
          <Coffee className={`${compact ? "w-2 h-2" : "w-2.5 h-2.5"}`} />
          <span>On Break</span>
        </span>
      ) : isStudying ? (
        <span
          className={`absolute ${compact ? "top-1.5 left-1.5 text-[8px] px-1.5 py-0.2" : "top-2.5 left-2.5 text-[9px] px-2 py-0.5"} flex items-center space-x-1 rounded-full bg-fuchsia-950/80 border border-fuchsia-500/40 text-fuchsia-300 font-extrabold uppercase tracking-wider shadow-sm`}
          title="Member is studying"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(217,70,239,0.8)]" />
          <span>Studying</span>
        </span>
      ) : null}

      {/* Floating "YOU" badge (Top-Right) */}
      {isCurrentUser && (
        <span className={`absolute ${compact ? "top-1.5 right-1.5 text-[8px] px-1 py-0.2" : "top-2.5 right-2.5 text-[9px] px-1.5 py-0.5"} uppercase font-black tracking-wider rounded-full bg-zinc-800 text-zinc-200 border border-zinc-700 shadow-sm`}>
          You
        </span>
      )}

      {/* Top: Avatar DP Container with Strict Geometric Constraints */}
      <div className={`relative flex flex-col items-center ${isAchiever || isBreak || isStudying ? (compact ? "mt-1.5" : "mt-3") : (compact ? "mt-0.5" : "mt-1")}`}>
        {/* Crown for Weekly Achiever */}
        {isAchiever && (
          <div className={`absolute ${compact ? "-top-2.5" : "-top-3"} animate-bounce`}>
            <Crown className={`${compact ? "w-4 h-4" : "w-5 h-5"} text-amber-400 fill-amber-400 filter drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]`} />
          </div>
        )}

        {/* Avatar DP */}
        <div
          className={`relative rounded-full bg-zinc-800 border-2 overflow-hidden shrink-0 aspect-square flex items-center justify-center font-extrabold text-zinc-100 shadow-md ${
            compact
              ? "w-11 h-11 min-w-[2.75rem] min-h-[2.75rem] max-w-[2.75rem] max-h-[2.75rem] text-xs"
              : "w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] max-w-[3.5rem] max-h-[3.5rem] text-sm"
          } ${
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
              className="w-full h-full object-cover object-center rounded-full block pointer-events-none"
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
      <div className={`w-full text-center ${compact ? "mt-1.5 space-y-0" : "mt-2.5 space-y-0.5"} min-w-0`}>
        <div className="flex items-center justify-center space-x-1 min-w-0 px-1">
          <h3
            className={`${compact ? "text-xs" : "text-xs sm:text-sm"} font-extrabold truncate ${
              isAchiever ? "text-amber-200 drop-shadow-sm font-black" : "text-zinc-100"
            }`}
            title={member.display_name}
          >
            {member.display_name}
          </h3>
          {isAchiever && (
            <Star className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-amber-400 fill-amber-400 shrink-0`} />
          )}
        </div>

        {/* Fixed height container for badges to maintain identical card height */}
        <div className={`${compact ? "h-3.5" : "h-4"} flex items-center justify-center space-x-1`}>
          {showDeepNight && <IndicatorTag type="night" />}
          {showEarlyBird && <IndicatorTag type="early" />}
        </div>
      </div>

      {/* Middle Stats Row: Realtime Live Weekly Total Study Duration + Sessions Count */}
      <div className={`w-full flex items-center justify-center gap-1 sm:gap-1.5 text-zinc-400 ${compact ? "mt-1 py-0.5 text-[9px]" : "mt-2 py-1 text-[10px] sm:text-[11px]"} border-t border-zinc-800/40 min-w-0 select-none`}>
        <div
          className="flex items-center gap-1 min-w-0 shrink-0"
          title={`Total weekly study duration: ${formatSecondsToHuman(totalWeeklyStudySeconds)} this week`}
        >
          <Clock className={`${compact ? "w-2 h-2" : "w-2.5 h-2.5"} text-fuchsia-400/90 shrink-0`} />
          <span className="font-bold text-zinc-200 tabular-nums whitespace-nowrap shrink-0 text-[10px] sm:text-[11px]">
            {formatSecondsToHuman(totalWeeklyStudySeconds)}
          </span>
          <span className="text-[8px] sm:text-[8.5px] text-zinc-500 font-medium whitespace-nowrap shrink-0">
            /wk
          </span>
        </div>

        <span className="text-zinc-700 font-bold select-none shrink-0">•</span>

        <div
          className="flex items-center gap-1 min-w-0 shrink-0"
          title={`${sessionsCount} session${sessionsCount === 1 ? "" : "s"} this week (${isCurrentSessionActive ? "current session in progress" : "completed"})`}
        >
          <BookOpen className={`${compact ? "w-2 h-2" : "w-2.5 h-2.5"} text-violet-400/90 shrink-0`} />
          <span className="font-bold text-zinc-200 tabular-nums text-[10px] sm:text-[10.5px] whitespace-nowrap shrink-0">
            {sessionsCount}
          </span>
          <span className="text-[8px] sm:text-[8.5px] text-zinc-500 font-medium whitespace-nowrap shrink-0">
            sess
          </span>
        </div>
      </div>

      {/* Bottom: Live Digital Timer Readout Pill (Uniform Symmetrical Height Across All Cards) */}
      <div className={`w-full ${compact ? "mt-1 pt-1 min-h-[38px]" : "mt-2 pt-2 min-h-[50px]"} border-t border-zinc-800/60 flex flex-col justify-center items-center`}>
        {isStudying ? (
          <>
            <div className={`font-mono ${compact ? "text-[11px] px-2.5 py-0.5" : "text-xs px-3 py-1"} font-black tracking-tight rounded-full border shadow-inner flex items-center space-x-1.5 bg-fuchsia-950/40 text-fuchsia-300 border-fuchsia-500/30 tabular-nums`}>
              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 shadow-[0_0_6px_rgba(217,70,239,0.8)]" />
              <span>{formatDurationSeconds(elapsedSeconds)}</span>
            </div>
            <div className={`${compact ? "h-2.5 mt-0.2" : "h-3.5 mt-0.5"}`} aria-hidden="true" />
          </>
        ) : isBreak ? (
          <>
            <div
              className={`font-mono ${compact ? "text-[11px] px-2.5 py-0.5" : "text-xs px-3 py-1"} font-black tracking-tight rounded-full border shadow-inner flex items-center space-x-1.5 bg-amber-950/60 text-amber-300 border-amber-500/50 tabular-nums`}
              title={`Live Break: ${formatDurationSeconds(liveBreakSeconds)} | Session Study: ${formatDurationSeconds(elapsedSeconds)}`}
            >
              <Coffee className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span>Break {formatDurationSeconds(liveBreakSeconds)}</span>
            </div>
            <div
              className={`${compact ? "h-2.5 mt-0.2 text-[9px]" : "h-3.5 mt-0.5 text-[10px]"} flex items-center justify-center gap-1 text-zinc-400 font-medium tabular-nums whitespace-nowrap`}
              title={`Active study session duration: ${formatDurationSeconds(elapsedSeconds)}`}
            >
              <span>Session:</span>
              <span className="font-mono font-bold text-zinc-200">{formatDurationSeconds(elapsedSeconds)}</span>
            </div>
          </>
        ) : (
          <>
            <span
              className={`${compact ? "text-[9px] px-2.5 py-0.5" : "text-[10px] px-3 py-1"} text-zinc-500 font-bold uppercase tracking-wider rounded-full bg-zinc-900/60 border border-zinc-800/80 tabular-nums select-none transition-colors`}
              title={offlineDetailedText}
            >
              {offlinePillText}
            </span>
            <div className={`${compact ? "h-2.5 mt-0.2" : "h-3.5 mt-0.5"}`} aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}, areMemberCardsEqual);

function areMemberCardsEqual(prev: MemberCardProps, next: MemberCardProps): boolean {
  if (prev.isCurrentUser !== next.isCurrentUser) return false;
  if (prev.compact !== next.compact) return false;
  if (prev.customElapsedSeconds !== next.customElapsedSeconds) return false;

  const mA = prev.member;
  const mB = next.member;

  if (mA.id !== mB.id) return false;
  if (mA.current_status !== mB.current_status) return false;
  if (mA.display_name !== mB.display_name) return false;
  if (mA.avatar_url !== mB.avatar_url) return false;
  if (mA.has_achiever_badge !== mB.has_achiever_badge) return false;
  if (mA.weekly_study_seconds !== mB.weekly_study_seconds) return false;
  if (mA.total_sessions_count !== mB.total_sessions_count) return false;
  if (mA.session_start_time !== mB.session_start_time) return false;
  if (mA.last_resumed_at !== mB.last_resumed_at) return false;
  if (mA.break_started_at !== mB.break_started_at) return false;
  if (mA.active_study_seconds_snapshot !== mB.active_study_seconds_snapshot) return false;
  if (mA.last_offline_at !== mB.last_offline_at) return false;

  const prevNow = prev.currentTimestamp || new Date();
  const nextNow = next.currentTimestamp || new Date();

  const statusA = getEffectiveMemberStatus(mA, prevNow);
  const statusB = getEffectiveMemberStatus(mB, nextNow);
  if (statusA !== statusB) return false;

  // If member is actively studying or on break, timer ticks every second -> re-render
  if (statusB === "studying" || statusB === "break") {
    return false;
  }

  // Member is offline: only re-render if offline pill text or time-of-day indicators changed
  const prevPill = calculateMemberOfflineHours(mA, prevNow).formattedPill;
  const nextPill = calculateMemberOfflineHours(mB, nextNow).formattedPill;
  if (prevPill !== nextPill) return false;

  const prevNight = isDeepNight(statusA, prevNow);
  const nextNight = isDeepNight(statusB, nextNow);
  if (prevNight !== nextNight) return false;

  const prevBird = isEarlyBird(statusA, prevNow);
  const nextBird = isEarlyBird(statusB, nextNow);
  if (prevBird !== nextBird) return false;

  // Everything relevant for offline card is identical -> SKIP RE-RENDER!
  return true;
}

