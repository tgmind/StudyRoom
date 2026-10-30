"use client";

import React, { memo } from "react";
import Link from "next/link";
import { DesktopAppLayout } from "./DesktopAppLayout";
import { LeaderboardCard } from "@/components/leaderboard/LeaderboardCard";
import { ScoringBreakdown } from "@/components/leaderboard/ScoringBreakdown";
import { AchieverCelebrationCard } from "@/components/analytics/AchieverCelebrationCard";
import { UserGlobalPosition } from "@/components/analytics/UserGlobalPosition";
import { AnalyticsRankingSection } from "@/components/analytics/AnalyticsRankingSection";
import {
  Trophy,
  Clock,
  Target,
  Flame,
  Star,
  Sparkles,
  HelpCircle,
  AlertCircle,
  RefreshCw,
  Globe,
} from "lucide-react";
import { UserProfile, LeaderboardEntry, GlobalAnalyticsPayload } from "@/lib/supabase/types";
import { useGlobalAnalytics } from "@/hooks/useGlobalAnalytics";

export interface DesktopLeaderboardViewProps {
  profile: UserProfile | null;
  user: any;
  entries: LeaderboardEntry[];
  loading: boolean;
  error: string | null;
  userEntry?: LeaderboardEntry | null;
  userRank: number | null;
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  analytics?: GlobalAnalyticsPayload | null;
  analyticsLoading?: boolean;
  analyticsError?: string | null;
  fetchAnalytics?: (isBackground?: boolean) => Promise<void>;
}

export const DesktopLeaderboardView = memo(function DesktopLeaderboardView({
  profile,
  user,
  entries,
  loading,
  error,
  userEntry,
  userRank,
  isModalOpen,
  setIsModalOpen,
  analytics: externalAnalytics,
  analyticsLoading: externalAnalyticsLoading,
  analyticsError: externalAnalyticsError,
  fetchAnalytics: externalFetchAnalytics,
}: DesktopLeaderboardViewProps) {
  // If analytics props are not provided externally, automatically resolve via useGlobalAnalytics hook
  const internalAnalytics = useGlobalAnalytics();
  const analytics = externalAnalytics !== undefined ? externalAnalytics : internalAnalytics.analytics;
  const analyticsLoading =
    externalAnalyticsLoading !== undefined ? externalAnalyticsLoading : internalAnalytics.loading;
  const analyticsError =
    externalAnalyticsError !== undefined ? externalAnalyticsError : internalAnalytics.error;
  const fetchAnalytics =
    externalFetchAnalytics !== undefined ? externalFetchAnalytics : internalAnalytics.fetchAnalytics;

  return (
    <DesktopAppLayout profile={profile}>
      <main className="w-full max-w-6xl xl:max-w-7xl 2xl:max-w-[1780px] mx-auto px-4 sm:px-6 lg:px-8 xl:px-10 py-6 space-y-6">
        {/* Unified Desktop Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-5">
          <div className="flex items-start space-x-3.5 min-w-0 flex-1">
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 shrink-0 shadow-inner mt-0.5">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight leading-tight">
                  Rankings & Global Analytics
                </h1>
                <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full shrink-0">
                  LIVE SPLIT VIEW
                </span>
              </div>
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed max-w-3xl">
                Weekly 50/30/20 competitive leaderboard on the left • Historical community benchmarks & observatory on the right
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0 self-start md:self-auto">
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-amber-500/30 hover:border-amber-500/60 text-zinc-200 hover:text-white text-xs sm:text-sm font-bold transition-all shadow-sm group cursor-pointer"
              title="View scoring methodology & updated Dual-Pillar rules"
            >
              <HelpCircle className="w-4 h-4 text-amber-400 group-hover:rotate-12 transition-transform shrink-0" />
              <span>Scoring Rules</span>
            </button>
          </div>
        </div>

        {/* Desktop Balanced Split-Screen: Left Leaderboard / Right Global Analytics */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
          {/* ======================================================== */}
          {/* LEFT WING: WEEKLY LEADERBOARD & USER STANDING            */}
          {/* ======================================================== */}
          <section aria-label="Weekly Leaderboard" className="space-y-6 min-w-0">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center space-x-2 min-w-0">
                <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-zinc-200">
                  Weekly Leaderboard
                </h2>
              </div>
              <span className="text-[10px] font-mono font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded-full shrink-0">
                50/30/20 RULES
              </span>
            </div>

            {/* Leaderboard Standing & Formula Hero */}
            <div className="bg-zinc-900/70 border border-zinc-800/90 rounded-2xl p-5 shadow-xl space-y-4 backdrop-blur-md">
              {/* Top Row: User Standing Summary */}
              {userEntry && userRank ? (
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400 block mb-0.5">
                      Your Current Standing
                    </span>
                    <div className="flex items-baseline space-x-2">
                      <span className="text-lg font-black text-amber-300">
                        Rank #{userRank}
                      </span>
                      <span className="font-mono text-xs text-zinc-400 font-semibold">
                        ({userEntry.score.toFixed(1)} / 100 pts)
                      </span>
                    </div>
                    {userEntry.total_tasks !== undefined &&
                      userEntry.completed_tasks !== undefined &&
                      userEntry.total_tasks > 0 && (
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          {userEntry.completed_tasks}/{userEntry.total_tasks} goals completed (
                          {userEntry.goal_completion_pct}% discipline)
                        </p>
                      )}
                  </div>

                  {userRank === 1 ? (
                    <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black shrink-0 animate-pulse">
                      <Star className="w-4 h-4 fill-amber-400" />
                      <span>#1 Achiever</span>
                    </div>
                  ) : (
                    <Link
                      href="/streak"
                      title="View study consistency & streak details in the Streaks tab"
                      className="flex items-center space-x-1 px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700/80 border border-zinc-700 hover:border-zinc-600 text-zinc-300 hover:text-zinc-100 text-xs font-bold font-mono shrink-0 transition-all cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                      <span>{userEntry.streak_days}d streak</span>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-zinc-950/50 border border-zinc-800/80 rounded-xl flex items-center space-x-2.5 text-zinc-400 text-xs">
                  <Trophy className="w-4 h-4 text-amber-400/80 shrink-0" />
                  <span>Complete a study session this week to establish your standing on the leaderboard.</span>
                </div>
              )}

              {/* Transparent Metric Formula Chips */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/90 border border-violet-500/15 hover:border-violet-500/40 text-center min-w-0 transition-all group"
                  title="Active Study Duration (50% weight)"
                >
                  <div className="flex items-center justify-center space-x-1 text-violet-300 font-bold mb-0.5">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-black truncate">50% Hours</span>
                  </div>
                  <span className="text-[10px] xl:text-[11px] text-zinc-400 group-hover:text-zinc-300 block leading-tight font-medium truncate">
                    Study Duration
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/90 border border-fuchsia-500/15 hover:border-fuchsia-500/40 text-center min-w-0 transition-all group"
                  title="Dual-Pillar Goal Index (30% weight: 60% Volume + 40% Discipline)"
                >
                  <div className="flex items-center justify-center space-x-1 text-fuchsia-300 font-bold mb-0.5">
                    <Target className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-black truncate">30% Goals</span>
                  </div>
                  <span className="text-[10px] xl:text-[11px] text-zinc-400 group-hover:text-zinc-300 block leading-tight font-medium truncate">
                    Dual-Pillar Index
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 hover:bg-zinc-900/90 border border-amber-500/15 hover:border-amber-500/40 text-center min-w-0 transition-all group"
                  title="Consistency Streak (20% weight: ≥30m daily)"
                >
                  <div className="flex items-center justify-center space-x-1 text-amber-300 font-bold mb-0.5">
                    <Flame className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs font-black truncate">20% Streak</span>
                  </div>
                  <span className="text-[10px] xl:text-[11px] text-zinc-400 group-hover:text-zinc-300 block leading-tight font-medium truncate">
                    ≥30m Daily
                  </span>
                </button>
              </div>

              {/* Reset Schedule Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px] text-zinc-400">
                <span className="flex items-center space-x-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>Resets Every Monday 00:00 IST</span>
                </span>
                <span className="font-semibold text-zinc-300">Rolling 7-Day Window</span>
              </div>
            </div>

            {/* Community Rankings List */}
            <div className="space-y-3">
              <div className="border-b border-zinc-800/80 pb-2.5 flex items-center justify-between">
                <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-zinc-300">
                  Community Rankings ({entries.length} Active Competitors)
                </h2>
              </div>

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
                <div className="space-y-2.5">
                  {entries.map((entry, index) => (
                    <LeaderboardCard
                      key={entry.user_id}
                      entry={entry}
                      rank={index + 1}
                      isCurrentUser={entry.user_id === user?.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ======================================================== */}
          {/* RIGHT WING: GLOBAL ANALYTICS OBSERVATORY                 */}
          {/* ======================================================== */}
          <section aria-label="Global Analytics Observatory" className="space-y-6 min-w-0">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center space-x-2 min-w-0">
                <Globe className="w-4 h-4 text-amber-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-zinc-200">
                  Global Analytics Observatory
                </h2>
              </div>
              <Link
                href="/analytics"
                className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors shrink-0 flex items-center space-x-1"
              >
                <span>Global Analytics</span>
                <span>→</span>
              </Link>
            </div>

            {analyticsLoading && !analytics ? (
              <div className="space-y-6 animate-pulse">
                <div className="w-full h-72 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl" />
                <div className="w-full h-44 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl" />
                <div className="w-full h-96 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl" />
              </div>
            ) : analyticsError ? (
              <div className="p-8 bg-rose-950/40 border border-rose-800/80 rounded-3xl text-center space-y-3">
                <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
                <h3 className="text-base font-bold text-rose-200">Unable to Load Global Analytics</h3>
                <p className="text-xs text-rose-300/80 max-w-md mx-auto">{analyticsError}</p>
                {fetchAnalytics && (
                  <button
                    type="button"
                    onClick={() => fetchAnalytics(false)}
                    className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 inline-flex items-center space-x-2 transition-all active:scale-95"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            ) : analytics ? (
              <div className="space-y-6">
                {/* 1. Achiever of the Week Hero */}
                <AchieverCelebrationCard achiever={analytics.achiever} />

                {/* 2. Personalized Analytics: Your Global Position */}
                <UserGlobalPosition
                  userPosition={analytics.user_position}
                  communityStats={analytics.community_stats}
                  isLoggedIn={Boolean(user?.id)}
                />

                {/* 3. Study Ecosystem Observatory (Top 5 Telemetry) */}
                <AnalyticsRankingSection
                  rankings={analytics.rankings}
                  currentUserId={user?.id}
                  weekStart={analytics.week_start}
                  weekEnd={analytics.week_end}
                />
              </div>
            ) : null}
          </section>
        </div>
      </main>

      <ScoringBreakdown
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </DesktopAppLayout>
  );
});
