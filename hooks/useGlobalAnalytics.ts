"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { GlobalAnalyticsPayload } from "@/lib/supabase/types";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

let cachedAnalyticsState: {
  payload: GlobalAnalyticsPayload;
  fetchedAt: number;
} | null = null;

export function useGlobalAnalytics() {
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
          if (
            payload.achiever.leaderboard_score === undefined &&
            typeof (payload.achiever as { score?: number }).score === "number"
          ) {
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

  return {
    analytics,
    loading,
    error,
    fetchAnalytics,
  };
}
