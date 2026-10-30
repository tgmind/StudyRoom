"use client";

import React, { memo } from "react";
import {
  UserGlobalPosition as UserGlobalPositionType,
  GlobalCommunityStats,
} from "@/lib/supabase/types";
import { formatMinutesToHours } from "@/lib/time/format";
import {
  TrendingUp,
  Award,
  Clock,
  Target,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Compass,
} from "lucide-react";

export interface StandingPillInfo {
  type: "top" | "last_percentile" | "last";
  label: string;
  percentileValue?: number;
}

/**
 * Computes the user standing pill representation:
 * - "Last" in dramatic reddish style if user is the last in a cohort (> 1 students).
 * - "Last xx%" in warning style if user is outside the top 70% (percentile > 70).
 * - "Top xx%" in standard sky-blue style if user is in the top 70%.
 */
export function getStandingPillInfo(
  rank: number,
  totalStudents: number,
  percentile: number
): StandingPillInfo {
  const safeRank = typeof rank === "number" && !isNaN(rank) ? rank : 0;
  const safeTotal = typeof totalStudents === "number" && !isNaN(totalStudents) ? totalStudents : 0;
  const safePercentile = typeof percentile === "number" && !isNaN(percentile) ? percentile : 0;

  // 1. When user is the absolute last in a cohort with more than 1 student
  if (safeTotal > 1 && safeRank >= safeTotal) {
    return {
      type: "last",
      label: "Last",
    };
  }

  const effectivePercentile =
    safePercentile > 0
      ? safePercentile
      : safeTotal > 0 && safeRank > 0
      ? Math.max(1, Math.min(100, Math.ceil((safeRank / safeTotal) * 100)))
      : 100;

  // 2. When user is not in the top 70% (i.e. percentile > 70)
  if (effectivePercentile > 70) {
    const lastPct = Math.max(1, Math.round(100 - effectivePercentile));
    return {
      type: "last_percentile",
      label: `Last ${lastPct}%`,
      percentileValue: lastPct,
    };
  }

  // 3. User is in the top 70%
  return {
    type: "top",
    label: `Top ${effectivePercentile}%`,
    percentileValue: effectivePercentile,
  };
}

interface UserGlobalPositionProps {
  userPosition: UserGlobalPositionType | null;
  communityStats: GlobalCommunityStats;
  isLoggedIn: boolean;
}

export const UserGlobalPosition = memo(function UserGlobalPosition({
  userPosition,
  communityStats,
  isLoggedIn,
}: UserGlobalPositionProps) {
  if (!isLoggedIn) {
    return (
      <section
        aria-label="Your Global Position"
        className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#0b0f19] p-4 sm:p-5 backdrop-blur-md text-center space-y-2 shadow-lg"
      >
        {/* Inner thin white boundary */}
        <div
          data-testid="personalized-analytics-inner-border"
          className="pointer-events-none absolute inset-1 rounded-[20px] border border-white/60 z-0"
          aria-hidden="true"
        />
        <div className="w-9 h-9 mx-auto rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-300">
          <Compass className="w-4 h-4" />
        </div>
        <h3 className="text-xs sm:text-sm font-bold text-zinc-200">
          Sign In to View Your Global Standing
        </h3>
        <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
          Log in with your StudyRoom account to benchmark your study duration, goal completion, and community standing.
        </p>
      </section>
    );
  }

  if (!userPosition) {
    return (
      <section
        aria-label="Your Global Position"
        className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#0b0f19] p-4 sm:p-5 backdrop-blur-md space-y-2 shadow-lg"
      >
        {/* Inner thin white boundary */}
        <div
          data-testid="personalized-analytics-inner-border"
          className="pointer-events-none absolute inset-1 rounded-[20px] border border-white/60 z-0"
          aria-hidden="true"
        />
        <div className="flex items-center space-x-2 text-sky-400">
          <Compass className="w-4 h-4" />
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-zinc-300">
            Your Global Standing
          </h2>
        </div>
        <p className="text-xs text-zinc-400 leading-relaxed">
          No qualifying study sessions were recorded for your profile in the finalized week. Join the current week&apos;s live sessions in the Room to secure your global position for the next rollover!
        </p>
      </section>
    );
  }

  const userHours = formatMinutesToHours(userPosition.total_study_minutes);
  const communityHours = formatMinutesToHours(
    communityStats.global_avg_study_minutes
  );
  const userDailyHours = (userPosition.daily_average_minutes / 60).toFixed(1);
  const communityDailyHours = (
    communityStats.global_avg_daily_minutes / 60
  ).toFixed(1);

  const isAboveStudyAvg = userPosition.delta_vs_community_study_mins >= 0;
  const isAboveGoalAvg = userPosition.delta_vs_community_goal_pct >= 0;

  const standing = getStandingPillInfo(
    userPosition.rank,
    userPosition.total_eligible_students,
    userPosition.percentile
  );

  return (
    <section
      aria-label="Your Global Position and Benchmark Comparison"
      className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#0b0f19] p-4 sm:p-5 shadow-[0_8px_30px_rgba(255,255,255,0.04)] backdrop-blur-md space-y-3.5"
    >
      {/* Inner thin white boundary */}
      <div
        data-testid="personalized-analytics-inner-border"
        className="pointer-events-none absolute inset-1 rounded-[20px] border border-white/60 z-0"
        aria-hidden="true"
      />
      {/* Ambient Cool Glow (adapts subtly if last) */}
      <div
        className={`pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl transition-colors duration-500 ${
          standing.type === "last" ? "bg-rose-500/10" : "bg-sky-500/10"
        }`}
        aria-hidden="true"
      />

      {/* Header and Rank Pill */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
        <div>
          <span className="text-[10px] sm:text-[11px] uppercase font-mono font-bold tracking-wider text-sky-400 block mb-0.5">
            Personalized Analytics
          </span>
          <h2 className="text-base sm:text-lg font-black text-zinc-100 tracking-tight flex items-center gap-2 flex-wrap">
            <span>Your Global Position</span>
            {userPosition.is_in_top5 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase">
                Top 5 Elite
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center space-x-2">
          <div className="px-3 py-1 rounded-xl bg-slate-900/90 border border-slate-700/80 text-zinc-100 flex items-center space-x-1.5 shadow-sm">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono text-xs sm:text-sm font-black text-amber-300">
              Rank #{userPosition.rank}
            </span>
            <span className="text-[10px] text-zinc-400">
              / {userPosition.total_eligible_students}
            </span>
          </div>

          {standing.type === "last" ? (
            <div
              data-testid="user-standing-pill"
              aria-label="Global standing: Last"
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-rose-950/90 via-red-950/80 to-rose-900/90 border border-rose-500/60 text-rose-200 text-xs font-black font-mono shadow-[0_0_14px_rgba(244,63,94,0.35)] flex items-center space-x-1.5"
            >
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span>Last</span>
            </div>
          ) : standing.type === "last_percentile" ? (
            <div
              data-testid="user-standing-pill"
              aria-label={`Global standing: ${standing.label}`}
              className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/15 to-orange-500/15 border border-orange-500/30 text-orange-300 text-xs font-black font-mono"
            >
              {standing.label}
            </div>
          ) : (
            <div
              data-testid="user-standing-pill"
              aria-label={`Global standing: ${standing.label}`}
              className="px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-black font-mono"
            >
              {standing.label}
            </div>
          )}
        </div>
      </div>

      {/* Side-by-Side Community Benchmark Comparison */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 text-xs">
        {/* Study Duration Benchmark */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-200 font-bold flex items-center gap-1.5 text-xs sm:text-sm">
              <Clock className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Study Duration vs Avg</span>
            </span>
            <span
              className={`inline-flex items-center text-[10.5px] font-bold ${
                isAboveStudyAvg ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isAboveStudyAvg ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-0.5" />
              )}
              {isAboveStudyAvg ? "+" : ""}
              {Math.abs(
                Math.round(
                  (userPosition.delta_vs_community_study_mins / 60) * 10
                ) / 10
              )}
              h vs avg
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1 font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 block">You</span>
              <span className="text-sm sm:text-base font-black text-zinc-100">
                {userHours}
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">
                {" "}
                ({userDailyHours}h/d)
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 block">Community Avg</span>
              <span className="text-xs sm:text-sm font-bold text-zinc-400">
                {communityHours}
              </span>
              <span className="text-[10px] text-zinc-500 font-normal">
                {" "}
                ({communityDailyHours}h/d)
              </span>
            </div>
          </div>

          {/* Visual Percentage Comparison Bar */}
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isAboveStudyAvg
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-amber-500 to-orange-400"
              }`}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    8,
                    Math.round(
                      (userPosition.total_study_minutes /
                        Math.max(
                          1,
                          communityStats.global_avg_study_minutes * 1.5
                        )) *
                        100
                    )
                  )
                )}%`,
              }}
            />
          </div>
        </div>

        {/* Goal Discipline Benchmark */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-200 font-bold flex items-center gap-1.5 text-xs sm:text-sm">
              <Target className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Goal Follow-Through vs Avg</span>
            </span>
            <span
              className={`inline-flex items-center text-[10.5px] font-bold ${
                isAboveGoalAvg ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {isAboveGoalAvg ? (
                <ArrowUpRight className="w-3 h-3 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3 h-3 mr-0.5" />
              )}
              {isAboveGoalAvg ? "+" : ""}
              {Math.abs(userPosition.delta_vs_community_goal_pct)}% vs avg
            </span>
          </div>

          <div className="flex items-baseline justify-between pt-1 font-mono">
            <div>
              <span className="text-[10px] text-zinc-500 block">You</span>
              <span className="text-sm sm:text-base font-black text-zinc-100">
                {userPosition.goal_completion_pct}%
              </span>
              <span className="text-[10px] text-zinc-400 font-normal">
                {" "}
                ({userPosition.completed_tasks}/{userPosition.total_tasks})
              </span>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-zinc-500 block">Community Avg</span>
              <span className="text-xs sm:text-sm font-bold text-zinc-400">
                {communityStats.global_avg_goal_pct}%
              </span>
            </div>
          </div>

          {/* Visual Percentage Comparison Bar */}
          <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isAboveGoalAvg
                  ? "bg-gradient-to-r from-emerald-500 to-green-400"
                  : "bg-gradient-to-r from-amber-500 to-yellow-400"
              }`}
              style={{
                width: `${Math.min(
                  100,
                  Math.max(5, userPosition.goal_completion_pct)
                )}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Motivational Gap Indicator & Active Days */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-zinc-400">
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-sky-400/80 shrink-0" />
          <span>
            Consistency:{" "}
            <strong className="text-zinc-200 font-bold">
              {userPosition.active_study_days} of 7 days
            </strong>{" "}
            active
          </span>
        </div>

        {!userPosition.is_in_top5 && userPosition.minutes_to_top5 > 0 ? (
          <div className="flex items-center space-x-1.5 text-amber-300 font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              +{formatMinutesToHours(userPosition.minutes_to_top5)} study time separated you from Top 5
            </span>
          </div>
        ) : userPosition.is_in_top5 ? (
          <span className="text-emerald-400 font-bold flex items-center gap-1">
            <span>✨ You finished in the Top 5 worldwide!</span>
          </span>
        ) : null}
      </div>
    </section>
  );
});
