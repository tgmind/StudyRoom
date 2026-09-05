"use client";

import React, { memo } from "react";
import { LeaderboardEntry } from "@/lib/supabase/types";
import { Star, Crown } from "lucide-react";

interface LeaderboardCardProps {
  entry: LeaderboardEntry;
  rank: number;
  isCurrentUser?: boolean;
}

export const LeaderboardCard = memo(function LeaderboardCard({
  entry,
  rank,
  isCurrentUser = false,
}: LeaderboardCardProps) {
  const hours = (entry.total_study_minutes / 60).toFixed(1);
  const initials = entry.display_name
    ? entry.display_name.substring(0, 2).toUpperCase()
    : "??";

  const isRank1 = rank === 1;
  const isRank2 = rank === 2;
  const isRank3 = rank === 3;

  return (
    <div
      className={`w-full p-3.5 sm:p-4 rounded-2xl border transition-all duration-200 select-none ${
        isRank1
          ? "bg-gradient-to-r from-amber-500/10 via-zinc-900/90 to-zinc-950 border-amber-500/35 ring-1 ring-amber-500/20 shadow-md"
          : isRank2
          ? "bg-zinc-900/80 border-zinc-700/80 shadow-sm"
          : isRank3
          ? "bg-zinc-900/70 border-amber-900/40 shadow-sm"
          : isCurrentUser
          ? "bg-zinc-900/90 border-violet-500/30 ring-1 ring-violet-500/20 shadow-md"
          : "bg-zinc-900/60 border-zinc-800/80 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2.5">
        {/* Left Side: Rank Badge + Avatar DP + User Info */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
          {/* Rank Badge */}
          <div className="flex items-center justify-center w-7 sm:w-8 shrink-0">
            {isRank1 ? (
              <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-amber-400 text-zinc-950 font-black text-xs shadow-md">
                1
              </span>
            ) : isRank2 ? (
              <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-zinc-300 text-zinc-950 font-black text-xs shadow-md">
                2
              </span>
            ) : isRank3 ? (
              <span className="flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-amber-700 text-zinc-100 font-black text-xs shadow-md">
                3
              </span>
            ) : (
              <span className="font-mono text-xs font-black text-zinc-500">
                #{rank}
              </span>
            )}
          </div>

          {/* User Avatar DP */}
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center font-extrabold text-zinc-100 shrink-0 text-xs shadow-inner">
            {entry.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.avatar_url}
                alt={entry.display_name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              initials
            )}
          </div>

          {/* User Name & Streak Tag */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5 min-w-0">
              <h3
                className={`text-xs sm:text-sm font-extrabold truncate ${isRank1 ? "text-amber-200" : "text-zinc-100"}`}
                title={entry.display_name}
              >
                {entry.display_name}
              </h3>
              {entry.has_achiever_badge && (
                <span title="Weekly Achiever">
                  <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                </span>
              )}
              {isCurrentUser && (
                <span className="text-[9px] uppercase font-black px-1.5 py-0.2 rounded-full bg-violet-500/20 text-violet-200 border border-violet-500/30 shrink-0">
                  You
                </span>
              )}
            </div>
            <p className="text-[10px] sm:text-[11px] text-zinc-400 font-medium break-words leading-tight mt-0.5">
              {entry.streak_days}d streak •{" "}
              {entry.total_tasks !== undefined &&
              entry.completed_tasks !== undefined &&
              entry.total_tasks > 0
                ? `${entry.completed_tasks}/${entry.total_tasks} goals (${entry.goal_completion_pct}%)`
                : `${entry.goal_completion_pct}% goals`}
            </p>
          </div>
        </div>

        {/* Right Side: Score & Study Duration Pill */}
        <div className="text-right shrink-0">
          <div className="font-mono text-sm sm:text-base font-black text-zinc-100 whitespace-nowrap">
            {entry.score.toFixed(1)} <span className="text-[10px] font-normal text-zinc-500">pts</span>
          </div>
          <div className="text-[10px] sm:text-[11px] font-mono text-zinc-400 font-bold whitespace-nowrap">
            {hours}h active
          </div>
        </div>
      </div>
    </div>
  );
});
