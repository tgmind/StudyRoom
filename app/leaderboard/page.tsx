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
import { calculateLeaderboardScore, calculateCurrentUserLeaderboardMinutes } from "@/lib/scoring/engine";
import { calculateWeeklyStreak } from "@/lib/scoring/streak";
import {
  getWeekStartTimestamp,
  getLeaderboardPeriodId,
  calculateMemberElapsedStudySeconds,
} from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";
import { StudySession } from "@/lib/supabase/types";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

// Module-level SWR memory cache to make Rankings tab switching instantaneous (0ms)
// Period-scoped to prevent previous-week stale data from flashing or persisting across reset boundaries
type LeaderboardCache = {
  periodId: string;
  entries: LeaderboardEntry[];
  fetchedAt: number;
};
let cachedLeaderboardState: LeaderboardCache | null = null;

export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
  const currentPeriodId = getLeaderboardPeriodId(getServerNow(), timezone);
  const initialCachedEntries =
    cachedLeaderboardState && cachedLeaderboardState.periodId === currentPeriodId
      ? cachedLeaderboardState.entries
      : [];

  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialCachedEntries);
  const [loading, setLoading] = useState(initialCachedEntries.length === 0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activePeriodIdRef = useRef<string>(currentPeriodId);

  const fetchLeaderboard = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) {
          setLoading(true);
        }
        setError(null);

        const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
        const serverNow = getServerNow();
        const periodId = getLeaderboardPeriodId(serverNow, timezone);
        const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow, timezone)).toISOString();

        // Check if period rolled over
        if (activePeriodIdRef.current !== periodId) {
          activePeriodIdRef.current = periodId;
          cachedLeaderboardState = null;
        }

        // 1. Fetch leaderboard RPC and current week's study sessions concurrently
        const [rpcResult, sessionsResult] = await Promise.all([
          (supabase as unknown as RpcCaller).rpc("rpc_get_leaderboard", {
            p_timezone: timezone,
            p_week_start: currentWeekStartIso,
          }),
          supabase
            .from("study_sessions")
            .select("id, user_id, start_time, duration_minutes")
            .gte("start_time", currentWeekStartIso),
        ]);

        if (rpcResult.error) throw rpcResult.error;

        const rawEntries = (rpcResult.data as unknown as LeaderboardEntry[]) || [];
        const filtered = rawEntries.filter((e) => {
          if (isAdminUserId(e.user_id)) return false;
          if ((e as unknown as { is_admin?: boolean }).is_admin === true) return false;
          return true;
        });

        // 2. Group weekly sessions by user
        const sessionsByUser = new Map<string, StudySession[]>();
        if (sessionsResult.data) {
          for (const row of sessionsResult.data as StudySession[]) {
            if (!row.user_id) continue;
            const list = sessionsByUser.get(row.user_id) || [];
            list.push(row);
            sessionsByUser.set(row.user_id, list);
          }
        }

        // Calculate current user's live study seconds strictly within current week
        // NEVER read profile.weekly_study_seconds here to prevent cross-week contamination
        let liveActiveSecondsInWeek = 0;
        if (user?.id && (profile?.current_status === "studying" || profile?.current_status === "break")) {
          const isBreakExpired =
            profile.current_status === "break" && profile.break_started_at
              ? (serverNow.getTime() - new Date(profile.break_started_at).getTime()) >= 3600 * 1000
              : false;

          let elapsedSeconds = 0;
          if (isBreakExpired) {
            elapsedSeconds = profile.active_study_seconds_snapshot ?? 0;
          } else {
            elapsedSeconds = calculateMemberElapsedStudySeconds(profile, serverNow);
          }

          if (elapsedSeconds > 0) {
            const currentWeekStartMs = getWeekStartTimestamp(serverNow, timezone);
            const startIso = profile.session_start_time || profile.last_resumed_at;
            if (startIso) {
              const startMs = new Date(startIso).getTime();
              if (!isNaN(startMs) && startMs < currentWeekStartMs) {
                const secondsInCurrentWeek = Math.max(0, Math.floor((serverNow.getTime() - currentWeekStartMs) / 1000));
                elapsedSeconds = Math.min(elapsedSeconds, secondsInCurrentWeek);
              }
            }
            liveActiveSecondsInWeek = elapsedSeconds;
          }
        }

        const userCompletedWeeklyMinutes = (sessionsByUser.get(user?.id || "") || []).reduce(
          (acc, s) => acc + (s.duration_minutes || 0),
          0
        );
        const userLiveMinutesInCurrentWeek = Math.floor(liveActiveSecondsInWeek / 60);
        const isCurrentStudying =
          Boolean(user?.id) &&
          (profile?.current_status === "studying" || profile?.current_status === "break");

        // Group weekly sessions by user to compute weekly qualifying streak (matching Weekly Heatmap)
        const weeklyStreaksByUser = new Map<string, number>();
        for (const [uid, userSessions] of sessionsByUser.entries()) {
          const liveSeconds =
            uid === user?.id && isCurrentStudying
              ? liveActiveSecondsInWeek
              : 0;
          const liveMinutes = Math.floor(liveSeconds / 60);

          const streak = calculateWeeklyStreak(userSessions, serverNow, liveMinutes, timezone);
          weeklyStreaksByUser.set(uid, streak);
        }

        // If current user is studying but has no past sessions this week yet, calculate their live streak
        if (
          user?.id &&
          isCurrentStudying &&
          !weeklyStreaksByUser.has(user.id)
        ) {
          const streak = calculateWeeklyStreak([], serverNow, userLiveMinutesInCurrentWeek, timezone);
          weeklyStreaksByUser.set(user.id, streak);
        }

        // Identify weekly benchmarks across active group competitors
        const maxGroupStudyMinutes = Math.max(
          1,
          ...filtered.map((e) => {
            if (e.user_id === user?.id) {
              const { displayedTotalMinutes } = calculateCurrentUserLeaderboardMinutes({
                serverTotalMinutes: e.total_study_minutes || 0,
                completedWeeklyMinutes: userCompletedWeeklyMinutes,
                liveActiveSecondsInWeek,
                isSessionActive: isCurrentStudying,
              });
              return displayedTotalMinutes;
            }
            return e.total_study_minutes || 0;
          })
        );
        const maxGroupCompletedTasks = Math.max(1, ...filtered.map((e) => e.completed_tasks || 0));

        // Authoritatively recalculate scores using the Dual-Pillar Goal Index engine
        const recalculatedEntries: LeaderboardEntry[] = filtered.map((entry) => {
          let totalStudyMinutes = entry.total_study_minutes || 0;
          if (entry.user_id === user?.id) {
            const { displayedTotalMinutes } = calculateCurrentUserLeaderboardMinutes({
              serverTotalMinutes: entry.total_study_minutes || 0,
              completedWeeklyMinutes: userCompletedWeeklyMinutes,
              liveActiveSecondsInWeek,
              isSessionActive: isCurrentStudying,
            });
            totalStudyMinutes = displayedTotalMinutes;
          }

          const completed = entry.completed_tasks ?? (entry.goal_completion_pct > 0 ? 1 : 0);
          const total = entry.total_tasks ?? (entry.goal_completion_pct > 0 ? 1 : 0);

          // Weekly streak matches the Weekly Study Heatmap (resets to 0 on weekly restart, max 7)
          // Combines client-side calculation with DB RPC calculation (which includes live in-progress study for all users)
          const computedStreak = weeklyStreaksByUser.get(entry.user_id);
          const rpcStreak = entry.streak_days ?? 0;
          const weeklyStreak = computedStreak !== undefined
            ? Math.max(computedStreak, rpcStreak)
            : rpcStreak;

          const { composite_score } = calculateLeaderboardScore(
            totalStudyMinutes,
            maxGroupStudyMinutes,
            completed,
            total,
            weeklyStreak,
            maxGroupCompletedTasks
          );

          return {
            ...entry,
            total_study_minutes: totalStudyMinutes,
            streak_days: weeklyStreak,
            score: composite_score,
          };
        });

        // Sort by: score DESC, total_study_minutes DESC, display_name ASC
        recalculatedEntries.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
          return a.display_name.localeCompare(b.display_name);
        });

        cachedLeaderboardState = {
          periodId,
          entries: recalculatedEntries,
          fetchedAt: serverNow.getTime(),
        };
        activePeriodIdRef.current = periodId;
        setEntries(recalculatedEntries);
      } catch (err: any) {
        const errorMsg =
          err?.message ||
          (typeof err === "object" && err ? JSON.stringify(err) : String(err)) ||
          "Failed to load leaderboard";
        console.error("Failed to fetch leaderboard:", {
          message: err?.message,
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          raw: err,
        });
        if (!isBackground) {
          setError(errorMsg);
        }
      } finally {
        if (!isBackground) {
          setLoading(false);
        }
      }
    },
    [supabase, user?.id, profile]
  );

  useEffect(() => {
    // Initial fetch: if cached entries exist for the current period, fetch in background without showing spinner
    const hasValidCache =
      cachedLeaderboardState !== null &&
      cachedLeaderboardState.periodId === getLeaderboardPeriodId(getServerNow(), timezone);
    fetchLeaderboard(hasValidCache);

    const checkPeriodAndRefresh = (isBackground = true) => {
      const nowPeriodId = getLeaderboardPeriodId(getServerNow(), timezone);
      if (nowPeriodId !== activePeriodIdRef.current) {
        activePeriodIdRef.current = nowPeriodId;
        cachedLeaderboardState = null;
        fetchLeaderboard(false);
      } else {
        fetchLeaderboard(isBackground);
      }
    };

    // Debounced background refresh to honor the lag-free realtime promise
    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        checkPeriodAndRefresh(true);
      }, 300);
    };

    // 20-second interval to keep live study time ticking and detect week rollover seamlessly
    const liveInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        checkPeriodAndRefresh(true);
      }
    }, 20000);

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

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkPeriodAndRefresh(true);
      }
    };
    const handleFocus = () => {
      checkPeriodAndRefresh(true);
    };
    const handleOnline = () => {
      checkPeriodAndRefresh(true);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      clearInterval(liveInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
      supabase.removeChannel(channel);
    };
  }, [fetchLeaderboard, supabase, timezone]);

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
