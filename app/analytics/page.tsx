"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { GlobalAnalyticsPayload } from "@/lib/supabase/types";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { AchieverCelebrationCard } from "@/components/analytics/AchieverCelebrationCard";
import { UserGlobalPosition } from "@/components/analytics/UserGlobalPosition";
import { AnalyticsRankingSection } from "@/components/analytics/AnalyticsRankingSection";
import { Globe, RefreshCw, AlertCircle } from "lucide-react";
import Link from "next/link";
import { useDeviceLayout } from "@/lib/device/useDeviceLayout";
import { DesktopAnalyticsView } from "@/components/presentation/desktop/DesktopAnalyticsView";
import { useGlobalAnalytics } from "@/hooks/useGlobalAnalytics";

export default function GlobalAnalyticsPage() {
  const { user, profile } = useAuth();
  const layout = useDeviceLayout();
  const { analytics, loading, error, fetchAnalytics } = useGlobalAnalytics();

  if (layout === "desktop") {
    return (
      <DesktopAnalyticsView
        profile={profile}
        user={user}
        analytics={analytics}
        loading={loading}
        error={error}
        fetchAnalytics={fetchAnalytics}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-24 bg-[#090a0f] text-zinc-100">
      <TopHeader profile={profile} />

      <main className="flex-1 w-full max-w-2xl sm:max-w-3xl px-3.5 sm:px-6 py-4 mx-auto space-y-4 sm:space-y-6">
        {/* Navigation Switcher: Weekly Rankings <-> Global Analytics */}
        <div className="w-full flex items-center justify-between gap-2 p-1.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 backdrop-blur-md">
          <Link
            href="/leaderboard"
            className="flex-1 py-1.5 px-3 rounded-xl text-center text-xs font-bold text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Weekly Leaderboard
          </Link>
          <div className="flex-1 py-1.5 px-3 rounded-xl text-center text-xs font-black bg-zinc-800/90 text-amber-300 shadow-sm border border-amber-500/25 flex items-center justify-center space-x-1.5">
            <Globe className="w-3.5 h-3.5 text-amber-400" />
            <span>Global Analytics</span>
          </div>
        </div>

        {/* Loading Skeletons */}
        {loading && !analytics ? (
          <div className="space-y-4 animate-pulse">
            <div className="w-full h-72 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl" />
            <div className="w-full h-36 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl" />
            <div className="w-full h-64 bg-zinc-900/50 border border-zinc-800/80 rounded-2xl" />
          </div>
        ) : error ? (
          /* Polished Error State */
          <div className="p-6 bg-rose-950/40 border border-rose-800/80 rounded-3xl text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <h3 className="text-sm font-bold text-rose-200">Unable to Load Global Analytics</h3>
            <p className="text-xs text-rose-300/80 max-w-md mx-auto">{error}</p>
            <button
              type="button"
              onClick={() => fetchAnalytics(false)}
              className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-bold text-zinc-200 inline-flex items-center space-x-1.5 transition-all active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : analytics ? (
          <>
            {/* 1. Achiever of the Week Hero Card */}
            <AchieverCelebrationCard achiever={analytics.achiever} />

            {/* 2. Your Global Position & Community Benchmark */}
            <UserGlobalPosition
              userPosition={analytics.user_position}
              communityStats={analytics.community_stats}
              isLoggedIn={Boolean(user?.id)}
            />

            {/* 3. The Four Core Global Analytics Rankings */}
            <AnalyticsRankingSection
              rankings={analytics.rankings}
              currentUserId={user?.id}
              weekStart={analytics.week_start}
              weekEnd={analytics.week_end}
            />
          </>
        ) : null}
      </main>

      <BottomNav />
    </div>
  );
}
