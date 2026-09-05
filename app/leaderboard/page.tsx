"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { LeaderboardEntry } from "@/lib/supabase/types";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { LeaderboardCard } from "@/components/leaderboard/LeaderboardCard";
import { ScoringBreakdown } from "@/components/leaderboard/ScoringBreakdown";
import { Trophy, HelpCircle, Star, Sparkles, Clock, Target, Flame, ChevronRight } from "lucide-react";
import { getAdminUserId, isAdminUserId } from "@/hooks/useAdmin";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_get_leaderboard", {
        p_timezone: timezone,
      });

      if (rpcErr) throw rpcErr;

      const rawEntries = (data as unknown as LeaderboardEntry[]) || [];
      const filtered = rawEntries.filter((e) => {
        if (isAdminUserId(e.user_id)) return false;
        if ((e as unknown as { is_admin?: boolean }).is_admin === true) return false;
        return true;
      });

      setEntries(filtered);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const userRankIndex = entries.findIndex((e) => e.user_id === user?.id);
  const userEntry = userRankIndex !== -1 ? entries[userRankIndex] : null;
  const userRank = userRankIndex !== -1 ? userRankIndex + 1 : null;

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      {/* Fluid Screen Container */}
      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-5">
        {/* Header Hero Card */}
        <div className="w-full bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-3 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0 flex-1">
              <div className="p-2 sm:p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 shrink-0">
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-sm sm:text-base font-extrabold text-zinc-100 tracking-tight leading-snug">
                  Weekly Leaderboard
                </h1>
                <p className="text-[10px] sm:text-xs text-zinc-400 mt-0.5 leading-snug">
                  Monday to Sunday rolling competition (Asia/Kolkata IST)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-zinc-100 text-xs font-bold transition-all shrink-0 touch-manipulation"
              title="View scoring methodology"
              aria-label="View scoring methodology"
            >
              <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Rules</span>
            </button>
          </div>

          {/* Minimalist Formula Update Notice */}
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="w-full group text-left px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-violet-950/40 via-zinc-900/70 to-fuchsia-950/30 border border-violet-500/20 hover:border-violet-400/40 transition-all flex items-center justify-between gap-2 touch-manipulation focus:outline-none focus:ring-1 focus:ring-violet-500/50"
            title="Learn how the new Dual-Pillar Goal Index works"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="flex h-2 w-2 relative shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] sm:text-[11px] font-bold text-violet-200 tracking-tight">
                    Scoring Upgraded
                  </span>
                  <span className="text-[8.5px] sm:text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-violet-500/20 border border-violet-500/30 text-violet-300 tracking-wider">
                    Dual-Pillar
                  </span>
                </div>
                <p className="text-[9px] sm:text-[10px] text-zinc-400 leading-snug mt-0.5">
                  <span>Volume (60%) + Discipline (40%) index.</span>
                  <span className="hidden min-[400px]:inline text-zinc-500"> More completed goals = higher rank.</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5 text-[10px] sm:text-xs font-semibold text-violet-300 group-hover:text-violet-200 shrink-0">
              <span className="hidden min-[380px]:inline">Rules</span>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
          </button>

          {/* Transparent Metric Formula Chips */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2.5 pt-2 border-t border-zinc-800/80 text-[9px] min-[360px]:text-[10px] sm:text-xs">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 sm:p-2 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/90 border border-violet-500/15 hover:border-violet-500/40 text-center min-w-0 transition-all group touch-manipulation"
              title="Active Study Duration (50% weight) - Click for methodology"
            >
              <div className="flex items-center justify-center space-x-1 text-violet-300 font-bold mb-0.5 flex-wrap">
                <Clock className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">50% Hours</span>
              </div>
              <span className="text-[8.5px] sm:text-[10px] text-zinc-500 group-hover:text-zinc-400 block leading-tight">Study Duration</span>
            </button>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="relative p-1.5 sm:p-2 rounded-xl bg-zinc-950/70 hover:bg-zinc-900/90 border border-fuchsia-500/30 hover:border-fuchsia-400/60 text-center min-w-0 transition-all group touch-manipulation shadow-sm"
              title="Dual-Pillar Goal Index (30% weight: 60% Volume + 40% Discipline) - Click for methodology"
            >
              <span className="absolute -top-1.5 -right-1 px-1 py-0.2 rounded text-[7.5px] font-black uppercase tracking-wider bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-sm border border-fuchsia-400/40">
                New
              </span>
              <div className="flex items-center justify-center space-x-1 text-fuchsia-300 font-bold mb-0.5 flex-wrap">
                <Target className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">30% Goals</span>
              </div>
              <span className="text-[8.5px] sm:text-[10px] text-fuchsia-300/90 group-hover:text-fuchsia-200 block leading-tight font-medium">Dual-Pillar Index</span>
            </button>

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="p-1.5 sm:p-2 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/90 border border-amber-500/15 hover:border-amber-500/40 text-center min-w-0 transition-all group touch-manipulation"
              title="Consistency Streak (20% weight: ≥30m daily) - Click for methodology"
            >
              <div className="flex items-center justify-center space-x-1 text-amber-300 font-bold mb-0.5 flex-wrap">
                <Flame className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">20% Streak</span>
              </div>
              <span className="text-[8.5px] sm:text-[10px] text-zinc-500 group-hover:text-zinc-400 block leading-tight">≥30m Daily</span>
            </button>
          </div>
        </div>

        {/* Current User Highlight Card */}
        {userEntry && userRank && (
          <div className="p-3.5 sm:p-4 bg-zinc-900/80 border border-zinc-700/80 rounded-2xl flex items-center justify-between shadow-md backdrop-blur-md gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-wider text-zinc-400 block">
                Your Current Standing
              </span>
              <div className="flex flex-wrap items-baseline gap-1.5 sm:gap-2 mt-0.5">
                <span className="text-base sm:text-lg font-black text-amber-300 whitespace-nowrap">
                  Rank #{userRank}
                </span>
                <span className="font-mono text-xs sm:text-sm text-zinc-300 font-semibold whitespace-nowrap">
                  ({userEntry.score.toFixed(1)} / 100 pts)
                </span>
              </div>
              {userEntry.total_tasks !== undefined && userEntry.completed_tasks !== undefined && userEntry.total_tasks > 0 && (
                <p className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 leading-tight">
                  {userEntry.completed_tasks}/{userEntry.total_tasks} goals completed ({userEntry.goal_completion_pct}% discipline)
                </p>
              )}
            </div>

            {userRank === 1 ? (
              <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black shrink-0 animate-pulse">
                <Star className="w-4 h-4 fill-amber-400" />
                <span>#1 Achiever</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs font-bold font-mono shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                <span>{userEntry.streak_days}d streak</span>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard Entries List */}
        <div className="space-y-2.5">
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((idx) => (
                <div
                  key={idx}
                  className="w-full h-20 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-2xl text-center text-xs text-rose-300">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-10 text-center border border-dashed border-zinc-800 bg-zinc-900/20 rounded-2xl space-y-2">
              <Trophy className="w-8 h-8 text-zinc-600 mx-auto" />
              <h3 className="text-xs font-bold text-zinc-300">No Weekly Rankings Yet</h3>
              <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                Complete your first study session this week to establish your score on the leaderboard!
              </p>
            </div>
          ) : (
            entries.map((entry, index) => (
              <LeaderboardCard
                key={entry.user_id}
                entry={entry}
                rank={index + 1}
                isCurrentUser={entry.user_id === user?.id}
              />
            ))
          )}
        </div>
      </main>

      <ScoringBreakdown
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <BottomNav />
    </div>
  );
}
