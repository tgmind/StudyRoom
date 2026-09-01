"use client";

import React from "react";
import { LeaderboardEntry } from "@/lib/supabase/types";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Star, Award, Medal } from "lucide-react";

interface LeaderboardCardProps {
  entry: LeaderboardEntry;
  rank: number;
  isCurrentUser?: boolean;
}

export function LeaderboardCard({
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
      className={`w-full p-4 rounded-2xl border transition-all duration-300 ${
        isRank1
          ? "bg-gradient-to-r from-amber-950/30 via-zinc-950 to-amber-950/20 border-amber-500/50 ring-1 ring-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.15)]"
          : isRank2
          ? "bg-zinc-950 border-zinc-500/40 ring-1 ring-zinc-400/20 shadow-md"
          : isRank3
          ? "bg-zinc-950 border-amber-800/40 ring-1 ring-amber-800/20 shadow-sm"
          : isCurrentUser
          ? "bg-zinc-900 border-zinc-700 ring-1 ring-zinc-600 shadow-md"
          : "bg-zinc-950 border-zinc-800/80 hover:border-zinc-700"
      }`}
    >
      <div className="flex items-center justify-between space-x-3">
        {/* Rank & User DP */}
        <div className="flex items-center space-x-3 min-w-0 flex-1">
          {/* Rank Badge */}
          <div className="flex items-center justify-center w-8 shrink-0">
            {isRank1 ? (
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-zinc-950 font-black text-xs shadow-md">
                1
              </span>
            ) : isRank2 ? (
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-300 text-zinc-950 font-black text-xs shadow-md">
                2
              </span>
            ) : isRank3 ? (
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-800 text-zinc-100 font-black text-xs shadow-md">
                3
              </span>
            ) : (
              <span className="font-mono text-xs font-extrabold text-zinc-500">
                #{rank}
              </span>
            )}
          </div>

          {/* User Avatar DP */}
          <div className="w-10 h-10 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center font-extrabold text-zinc-100 shrink-0 text-xs shadow-inner">
            {entry.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={entry.avatar_url}
                alt={entry.display_name}
                className="w-full h-full object-cover"
              />
            ) : (
              initials
            )}
          </div>

          {/* User Name & Achiever Badge */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center space-x-1.5">
              <h3 className="text-sm font-extrabold text-zinc-100 truncate">
                {entry.display_name}
              </h3>
              {entry.has_achiever_badge && (
                <span title="⭐ Weekly Achiever">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
                </span>
              )}
              {isCurrentUser && (
                <span className="text-[10px] uppercase font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 shrink-0">
                  You
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 font-medium">
              {entry.streak_days}d streak • {entry.goal_completion_pct}% goal completion
            </p>
          </div>
        </div>

        {/* Score & Study Hours Pill */}
        <div className="text-right shrink-0">
          <div className="font-mono text-base font-black text-zinc-100">
            {entry.score.toFixed(1)} <span className="text-xs font-normal text-zinc-500">pts</span>
          </div>
          <div className="text-[11px] font-mono text-zinc-400 font-bold">
            {hours} hrs active
          </div>
        </div>
      </div>
    </div>
  );
}
