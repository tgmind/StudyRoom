"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { LeaderboardEntry } from "@/lib/supabase/types";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { LeaderboardCard } from "@/components/leaderboard/LeaderboardCard";
import { ScoringBreakdown } from "@/components/leaderboard/ScoringBreakdown";
import { Trophy, HelpCircle, Star, Sparkles, Clock, Target, Flame } from "lucide-react";
import { getAdminUserId, isAdminUserId } from "@/hooks/useAdmin";
import { calculateLeaderboardScore } from "@/lib/scoring/engine";

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
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLeaderboard = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) {
          setLoading(true);
        }
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

        // Identify weekly benchmarks across active group competitors
        const maxGroupStudyMinutes = Math.max(1, ...filtered.map((e) => e.total_study_minutes || 0));
        const maxGroupCompletedTasks = Math.max(1, ...filtered.map((e) => e.completed_tasks || 0));

        // Authoritatively recalculate scores using the Dual-Pillar Goal Index engine
        const recalculatedEntries: LeaderboardEntry[] = filtered.map((entry) => {
          const completed = entry.completed_tasks ?? (entry.goal_completion_pct > 0 ? 1 : 0);
          const total = entry.total_tasks ?? (entry.goal_completion_pct > 0 ? 1 : 0);
          const { composite_score } = calculateLeaderboardScore(
            entry.total_study_minutes || 0,
            maxGroupStudyMinutes,
            completed,
            total,
            entry.streak_days || 0,
            maxGroupCompletedTasks
          );

          return {
            ...entry,
            score: composite_score,
          };
        });

        // Sort by: score DESC, total_study_minutes DESC, display_name ASC
        recalculatedEntries.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
          return a.display_name.localeCompare(b.display_name);
        });

        setEntries(recalculatedEntries);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        if (!isBackground) {
          setError(err instanceof Error ? err.message : "Failed to load leaderboard");
        }
      } finally {
        if (!isBackground) {
          setLoading(false);
        }
      }
    },
    [supabase]
  );

  useEffect(() => {
    // Initial fetch
    fetchLeaderboard(false);

    // Debounced background refresh to honor the lag-free realtime promise
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        fetchLeaderboard(true);
      }, 300);
    };

    // Listen to real-time events on study_sessions, daily_goals, and users
    const channel = supabase
      .channel("studyroom:leaderboard:realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "study_sessions" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_goals" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchLeaderboard, supabase]);

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
              className="relative flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-amber-500/30 hover:border-amber-500/60 text-zinc-200 hover:text-white text-xs font-bold transition-all shrink-0 touch-manipulation focus:outline-none shadow-sm group"
              title="View scoring methodology & updated Dual-Pillar rules"
              aria-label="View scoring methodology and updated Dual-Pillar rules"
            >
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400"></span>
              </span>
              <HelpCircle className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-12 transition-transform" />
              <span className="hidden min-[360px]:inline">Rules</span>
            </button>
          </div>

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
              className="p-1.5 sm:p-2 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/90 border border-fuchsia-500/15 hover:border-fuchsia-500/40 text-center min-w-0 transition-all group touch-manipulation"
              title="Dual-Pillar Goal Index (30% weight: 60% Volume + 40% Discipline) - Click for methodology"
            >
              <div className="flex items-center justify-center space-x-1 text-fuchsia-300 font-bold mb-0.5 flex-wrap">
                <Target className="w-3 h-3 shrink-0" />
                <span className="whitespace-nowrap">30% Goals</span>
              </div>
              <span className="text-[8.5px] sm:text-[10px] text-zinc-500 group-hover:text-zinc-400 block leading-tight">Dual-Pillar Index</span>
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
