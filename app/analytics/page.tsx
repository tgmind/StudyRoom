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

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

let cachedAnalyticsState: {
  payload: GlobalAnalyticsPayload;
  fetchedAt: number;
} | null = null;

export default function GlobalAnalyticsPage() {
  const { user, profile } = useAuth();
  const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
  const supabase = createClient();

  const [analytics, setAnalytics] = useState<GlobalAnalyticsPayload | null>(
    cachedAnalyticsState ? cachedAnalyticsState.payload : null
  );
  const [loading, setLoading] = useState(!cachedAnalyticsState);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) {
          setLoading(true);
        }
        setError(null);

        const { data, error: rpcError } = await (supabase as unknown as RpcCaller).rpc(
          "rpc_get_global_analytics",
          { p_timezone: timezone }
        );

        if (rpcError) throw rpcError;

        const payload = data as GlobalAnalyticsPayload;
        if (!payload || !payload.success) {
          throw new Error(payload?.message || "Failed to load global analytics.");
        }

        if (payload.achiever) {
          if (payload.achiever.leaderboard_score === undefined && typeof (payload.achiever as { score?: number }).score === "number") {
            payload.achiever.leaderboard_score = (payload.achiever as { score?: number }).score;
          }
        }

        cachedAnalyticsState = {
          payload,
          fetchedAt: Date.now(),
        };

        setAnalytics(payload);
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null
            ? JSON.stringify(err)
            : "Failed to load global analytics.";
        console.error("Global Analytics error:", err);
        if (!isBackground) {
          setError(errorMsg);
        }
      } finally {
        if (!isBackground) {
          setLoading(false);
        }
      }
    },
    [supabase, timezone]
  );

  useEffect(() => {
    fetchAnalytics(Boolean(cachedAnalyticsState));
  }, [fetchAnalytics]);

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
            />
          </>
        ) : null}
      </main>

      <BottomNav />
    </div>
  );
}
