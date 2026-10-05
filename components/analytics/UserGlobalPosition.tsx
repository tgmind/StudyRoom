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
        className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#0b0f19] border border-sky-500/20 p-4 sm:p-5 backdrop-blur-md text-center space-y-2 shadow-lg"
      >
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
        className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#0b0f19] border border-sky-500/20 p-4 sm:p-5 backdrop-blur-md space-y-2 shadow-lg"
      >
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

  return (
    <section
      aria-label="Your Global Position and Benchmark Comparison"
      className="w-full relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-[#0b0f19] border border-sky-500/25 p-4 sm:p-5 shadow-[0_8px_30px_rgba(14,165,233,0.08)] backdrop-blur-md space-y-3.5"
    >
      {/* Ambient Cool Sky Glow */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl"
        aria-hidden="true"
      />

      {/* Header and Rank Pill */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-800/80">
        <div>
          <span className="text-[9.5px] uppercase font-mono font-bold tracking-wider text-sky-400 block mb-0.5">
            Personalized Analytics
          </span>
          <h2 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight flex items-center gap-1.5">
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

          <div className="px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-black font-mono">
            Top {userPosition.percentile}%
          </div>
        </div>
      </div>

      {/* Side-by-Side Community Benchmark Comparison */}
      <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
        {/* Study Duration Benchmark */}
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              Study Duration vs Avg
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
        <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-300 font-semibold flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              Goal Follow-Through vs Avg
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
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-zinc-400">
        <div className="flex items-center space-x-1.5">
          <Calendar className="w-3.5 h-3.5 text-sky-400/80" />
          <span>
            Consistency:{" "}
            <strong className="text-zinc-200">
              {userPosition.active_study_days} of 7 days
            </strong>{" "}
            active
          </span>
        </div>

        {!userPosition.is_in_top5 && userPosition.minutes_to_top5 > 0 ? (
          <div className="flex items-center space-x-1 text-amber-300 font-medium">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>
              +{formatMinutesToHours(userPosition.minutes_to_top5)} study time separated you from Top 5
            </span>
          </div>
        ) : userPosition.is_in_top5 ? (
          <span className="text-emerald-400 font-semibold flex items-center gap-1">
            <span>✨ You finished in the Top 5 worldwide!</span>
          </span>
        ) : null}
      </div>
    </section>
  );
});
