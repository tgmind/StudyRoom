"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudySession } from "@/lib/supabase/types";
import { getWeekStartTimestamp } from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export interface HistorySummary {
  totalSessions: number;
  totalMinutes: number;
  pastWeeksCount: number;
  pastWeeksMinutes: number;
}

// Module-level SWR memory cache to make History tab switching instantaneous (0ms)
let cachedHistoryUserId = "";
let cachedCurrentWeekSessions: StudySession[] = [];
let cachedPastSummary = { count: 0, minutes: 0 };

export function useStudyHistory(userId?: string) {
  const hasCachedData = Boolean(
    userId &&
    cachedHistoryUserId === userId &&
    cachedCurrentWeekSessions.length > 0
  );

  const [currentWeekSessions, setCurrentWeekSessions] = useState<StudySession[]>(() => {
    if (userId && cachedHistoryUserId === userId) return cachedCurrentWeekSessions;
    return [];
  });
  const [pastSessions, setPastSessions] = useState<StudySession[]>([]);
  const [pastSummary, setPastSummary] = useState<{ count: number; minutes: number }>(() => {
    if (userId && cachedHistoryUserId === userId) return cachedPastSummary;
    return { count: 0, minutes: 0 };
  });
  const [loading, setLoading] = useState(!hasCachedData);
  const [isPastLoading, setIsPastLoading] = useState(false);
  const [isPastLoaded, setIsPastLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchHistory = useCallback(async () => {
    if (!userId) {
      setCurrentWeekSessions([]);
      setPastSessions([]);
      setPastSummary({ count: 0, minutes: 0 });
      setIsPastLoaded(false);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const serverNow = getServerNow();
      const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow)).toISOString();
      const ninetyDaysAgoIso = new Date(serverNow.getTime() - 90 * 86400000).toISOString();

      // 1. Fetch current week's full sessions (immediate fast load)
      const currentWeekPromise = supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", userId)
        .gte("start_time", currentWeekStartIso)
        .order("start_time", { ascending: false });

      // 2. Fetch lightweight summary of earlier sessions (only id, duration_minutes, start_time)
      const pastSummaryPromise = supabase
        .from("study_sessions")
        .select("id, duration_minutes, start_time")
        .eq("user_id", userId)
        .lt("start_time", currentWeekStartIso)
        .gte("start_time", ninetyDaysAgoIso);

      const [currentRes, summaryRes] = await Promise.all([currentWeekPromise, pastSummaryPromise]);

      if (currentRes.error) {
        // Fallback to RPC if direct table select has issue
        const { data: rpcData, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_get_study_history");
        if (rpcErr) throw currentRes.error;
        const allSessions = (rpcData || []) as StudySession[];
        const currentMs = new Date(currentWeekStartIso).getTime();
        const current = allSessions.filter((s) => new Date(s.start_time).getTime() >= currentMs);
        const past = allSessions.filter((s) => new Date(s.start_time).getTime() < currentMs);
        setCurrentWeekSessions(current);
        setPastSessions(past);
        setIsPastLoaded(true);
        setPastSummary({
          count: past.length,
          minutes: past.reduce((acc, s) => acc + (s.duration_minutes || 0), 0),
        });
        return;
      }

      setCurrentWeekSessions((currentRes.data || []) as StudySession[]);

      if (summaryRes.data) {
        const rows = summaryRes.data as Array<{ duration_minutes: number }>;
        const count = rows.length;
        const minutes = rows.reduce((acc, r) => acc + (r.duration_minutes || 0), 0);
        const nextSummary = { count, minutes };
        setPastSummary(nextSummary);

        cachedHistoryUserId = userId;
        cachedCurrentWeekSessions = (currentRes.data || []) as StudySession[];
        cachedPastSummary = nextSummary;
      } else {
        cachedHistoryUserId = userId;
        cachedCurrentWeekSessions = (currentRes.data || []) as StudySession[];
      }
    } catch (err) {
      console.error("Failed to fetch study history:", err);
      setError(err instanceof Error ? err.message : "Failed to load study history");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // On-demand fetch for past weeks data when user expands the archive banner
  const fetchPastSessions = useCallback(async (): Promise<boolean> => {
    if (!userId || isPastLoaded || isPastLoading) return isPastLoaded;

    setIsPastLoading(true);
    try {
      const serverNow = getServerNow();
      const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow)).toISOString();
      const ninetyDaysAgoIso = new Date(serverNow.getTime() - 90 * 86400000).toISOString();

      const { data, error: pastErr } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", userId)
        .lt("start_time", currentWeekStartIso)
        .gte("start_time", ninetyDaysAgoIso)
        .order("start_time", { ascending: false });

      if (pastErr) {
        // Fallback to RPC if direct table select encounters an issue
        const { data: rpcData, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_get_study_history");
        if (rpcErr) throw pastErr;
        const allSessions = (rpcData || []) as StudySession[];
        const currentMs = new Date(currentWeekStartIso).getTime();
        const past = allSessions.filter((s) => new Date(s.start_time).getTime() < currentMs);
        setPastSessions(past);
        setIsPastLoaded(true);
        setPastSummary({
          count: past.length,
          minutes: past.reduce((acc, s) => acc + (s.duration_minutes || 0), 0),
        });
        return true;
      }

      const loadedPast = (data || []) as StudySession[];
      setPastSessions(loadedPast);
      setIsPastLoaded(true);
      setPastSummary({
        count: loadedPast.length,
        minutes: loadedPast.reduce((acc, s) => acc + (s.duration_minutes || 0), 0),
      });
      return true;
    } catch (err) {
      console.error("Failed to load past study archives:", err);
      return false;
    } finally {
      setIsPastLoading(false);
    }
  }, [supabase, userId, isPastLoaded, isPastLoading]);

  const clearHistory = async () => {
    if (!userId || actionLoading) return;

    setActionLoading(true);
    setError(null);

    try {
      const { error: deleteErr } = await supabase
        .from("study_sessions")
        .delete()
        .eq("user_id", userId);

      if (deleteErr) {
        const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_clear_study_history");
        if (rpcErr) throw deleteErr;
        setCurrentWeekSessions([]);
        setPastSessions([]);
        setPastSummary({ count: 0, minutes: 0 });
        setIsPastLoaded(false);
        return data;
      }

      setCurrentWeekSessions([]);
      setPastSessions([]);
      setPastSummary({ count: 0, minutes: 0 });
      setIsPastLoaded(false);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear history";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  // Combined full sessions list (preserves backward compatibility)
  const sessions = useMemo(() => {
    return [...currentWeekSessions, ...pastSessions];
  }, [currentWeekSessions, pastSessions]);

  // Overall 90-day metrics
  const totalSummary: HistorySummary = useMemo(() => {
    const currentMinutes = currentWeekSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
    return {
      totalSessions: currentWeekSessions.length + pastSummary.count,
      totalMinutes: currentMinutes + pastSummary.minutes,
      pastWeeksCount: pastSummary.count,
      pastWeeksMinutes: pastSummary.minutes,
    };
  }, [currentWeekSessions, pastSummary]);

  return {
    sessions,
    currentWeekSessions,
    pastSessions,
    pastSummary,
    totalSummary,
    loading,
    isPastLoading,
    isPastLoaded,
    actionLoading,
    error,
    fetchPastSessions,
    refreshHistory: fetchHistory,
    clearHistory,
  };
}
