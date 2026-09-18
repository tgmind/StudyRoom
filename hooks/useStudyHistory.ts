"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudySession, DailyGoal, GoalTask } from "@/lib/supabase/types";
import { getWeekStartTimestamp, formatSessionDate } from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";
import {
  with10sTimeout,
  getOfflineCompletedSessions,
  removeOfflineCompletedSession,
  getCachedSessions,
  saveCachedSessions,
  clearUserHistoryCache,
} from "@/lib/offline/sessionQueue";

type RpcCaller = {
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export interface HistorySummary {
  totalSessions: number;
  totalMinutes: number;
  pastWeeksCount: number;
  pastWeeksMinutes: number;
}

export interface LapsedGoalWindow {
  id: string;
  expires_at: string;
  created_at: string;
  lapsedTasks: GoalTask[];
  totalTasksCount: number;
  completedTasksCount: number;
}

/**
 * Deduplicates study sessions and filters out zero-minute ghost entries.
 * - Drops 0-minute sessions with 0 break and no completed tasks.
 * - Consolidates duplicate records created by network retries or stop button spam
 *   (sessions starting within 60 seconds for the same user).
 * - Prefers canonical server UUIDs over offline IDs.
 * - Preserves the maximum duration and merges any completed tasks without duplicates.
 */
export function deduplicateStudySessions(sessions: StudySession[]): StudySession[] {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  // 1. Filter out 0-minute ghost sessions with no tasks and no break
  const nonGhosts = sessions.filter((s) => {
    const dur = s.duration_minutes ?? 0;
    const brk = s.break_minutes ?? 0;
    const hasTasks = Array.isArray(s.completed_tasks) && s.completed_tasks.length > 0;
    return dur > 0 || brk > 0 || hasTasks;
  });

  // 2. Sort by start_time descending
  const sorted = [...nonGhosts].sort((a, b) => {
    const tA = new Date(a.start_time).getTime();
    const tB = new Date(b.start_time).getTime();
    return tB - tA;
  });

  const deduped: StudySession[] = [];

  for (const session of sorted) {
    const sessionStartMs = new Date(session.start_time).getTime();
    if (isNaN(sessionStartMs)) continue;

    // Find any existing duplicate within 60 seconds for the same user
    const existingIndex = deduped.findIndex((existing) => {
      if (existing.id === session.id) return true;
      if (existing.user_id && session.user_id && existing.user_id !== session.user_id) {
        return false;
      }
      const existingStartMs = new Date(existing.start_time).getTime();
      return Math.abs(existingStartMs - sessionStartMs) <= 60000;
    });

    if (existingIndex === -1) {
      deduped.push({ ...session });
    } else {
      const existing = deduped[existingIndex];
      const isExistingOffline = typeof existing.id === "string" && existing.id.startsWith("offline_");
      const isSessionOffline = typeof session.id === "string" && session.id.startsWith("offline_");

      // Prefer server UUID over temporary offline ID
      if (isExistingOffline && !isSessionOffline) {
        existing.id = session.id;
      }

      // Keep maximum duration
      existing.duration_minutes = Math.max(
        existing.duration_minutes ?? 0,
        session.duration_minutes ?? 0
      );

      // Keep maximum break minutes
      existing.break_minutes = Math.max(
        existing.break_minutes ?? 0,
        session.break_minutes ?? 0
      );

      // Keep later end time
      const existingEndMs = new Date(existing.end_time).getTime();
      const sessionEndMs = new Date(session.end_time).getTime();
      if (!isNaN(sessionEndMs) && (isNaN(existingEndMs) || sessionEndMs > existingEndMs)) {
        existing.end_time = session.end_time;
      }

      // Merge completed tasks without duplicates
      const seenTaskIds = new Set((existing.completed_tasks || []).map((t) => t.id));
      const mergedTasks = [...(existing.completed_tasks || [])];
      for (const t of session.completed_tasks || []) {
        if (t && t.id && !seenTaskIds.has(t.id)) {
          seenTaskIds.add(t.id);
          mergedTasks.push(t);
        }
      }
      existing.completed_tasks = mergedTasks;
    }
  }

  return deduped;
}

// Module-level SWR memory cache to make History tab switching instantaneous (0ms)
let cachedHistoryUserId = "";
let cachedCurrentWeekSessions: StudySession[] = [];
let cachedPastSessions: StudySession[] = [];
let cachedPastSummary = { count: 0, minutes: 0 };
let cachedCurrentWeekLapsedGoals: Record<string, LapsedGoalWindow[]> = {};
let cachedPastWeeksLapsedGoals: Record<string, LapsedGoalWindow[]> = {};

export function resetStudyHistoryMemoryCache(): void {
  cachedHistoryUserId = "";
  cachedCurrentWeekSessions = [];
  cachedPastSessions = [];
  cachedPastSummary = { count: 0, minutes: 0 };
  cachedCurrentWeekLapsedGoals = {};
  cachedPastWeeksLapsedGoals = {};
}

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
  const [currentWeekLapsedGoals, setCurrentWeekLapsedGoals] = useState<Record<string, LapsedGoalWindow[]>>(() => {
    if (userId && cachedHistoryUserId === userId) return cachedCurrentWeekLapsedGoals;
    return {};
  });
  const [pastWeeksLapsedGoals, setPastWeeksLapsedGoals] = useState<Record<string, LapsedGoalWindow[]>>(() => {
    if (userId && cachedHistoryUserId === userId) return cachedPastWeeksLapsedGoals;
    return {};
  });
  const [loading, setLoading] = useState(!hasCachedData);
  const [isPastLoading, setIsPastLoading] = useState(false);
  const [isPastLoaded, setIsPastLoaded] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Clean up in-memory history immediately when account changes
  const prevUserIdRef = useRef(userId);
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      if (!userId || cachedHistoryUserId !== userId) {
        setCurrentWeekSessions([]);
        setPastSessions([]);
        setPastSummary({ count: 0, minutes: 0 });
        setCurrentWeekLapsedGoals({});
        setPastWeeksLapsedGoals({});
      }
    }
  }, [userId]);

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

      // Read any offline-completed sessions stored locally
      const offlineCompleted = getOfflineCompletedSessions(userId).map((s) => ({
        id: s.id,
        user_id: s.user_id,
        start_time: s.start_time,
        end_time: s.end_time,
        duration_minutes: s.duration_minutes,
        break_minutes: s.break_minutes ?? 0,
        completed_tasks: s.completed_tasks,
        created_at: s.created_at,
      })) as StudySession[];

      // 1. Fetch current week's full sessions with 10s safety timeout
      const currentWeekPromise = with10sTimeout(
        supabase
          .from("study_sessions")
          .select("*")
          .eq("user_id", userId)
          .gte("start_time", currentWeekStartIso)
          .order("start_time", { ascending: false }),
        "Fetch current week sessions"
      );

      // 2. Fetch lightweight summary of earlier sessions
      const pastSummaryPromise = with10sTimeout(
        supabase
          .from("study_sessions")
          .select("id, duration_minutes, start_time")
          .eq("user_id", userId)
          .lt("start_time", currentWeekStartIso)
          .gte("start_time", ninetyDaysAgoIso),
        "Fetch past summary"
      );

      let fetchedCurrent: StudySession[] = [];
      try {
        const [currentRes, summaryRes] = await Promise.all([currentWeekPromise, pastSummaryPromise]);

        if (currentRes.data) {
          fetchedCurrent = currentRes.data as StudySession[];
        }

        if (summaryRes.data) {
          const rows = summaryRes.data as Array<{ duration_minutes: number }>;
          const count = rows.length;
          const minutes = rows.reduce((acc, r) => acc + (r.duration_minutes || 0), 0);
          const nextSummary = { count, minutes };
          setPastSummary(nextSummary);
          cachedPastSummary = nextSummary;
        }
      } catch (networkErr) {
        console.warn("Could not fetch remote study history (using local/offline data):", networkErr);
      }

      // Self-heal offline sessions: if already recorded on server, remove from localStorage
      const uncommittedOffline: StudySession[] = [];
      for (const off of offlineCompleted) {
        const offStartMs = new Date(off.start_time).getTime();
        const matchingServerSession = fetchedCurrent.find((srv) => {
          if (srv.id === off.id) return true;
          const srvStartMs = new Date(srv.start_time).getTime();
          return !isNaN(srvStartMs) && !isNaN(offStartMs) && Math.abs(srvStartMs - offStartMs) <= 120000;
        });

        if (matchingServerSession) {
          // It was already committed to the server! Clean up local offline copy
          removeOfflineCompletedSession(off.id);
        } else {
          // Filter out stale (> 24h) or 0-minute ghost entries
          const isStale = isNaN(offStartMs) || (serverNow.getTime() - offStartMs > 24 * 3600 * 1000);
          const isGhost = (off.duration_minutes ?? 0) === 0 && (off.break_minutes ?? 0) === 0 && (!off.completed_tasks || off.completed_tasks.length === 0);
          if (isStale || isGhost) {
            removeOfflineCompletedSession(off.id);
          } else {
            uncommittedOffline.push(off);
          }
        }
      }

      // Merge and apply canonical deduplication (merges duplicate clicks, removes ghosts)
      const rawCombined = [...uncommittedOffline, ...fetchedCurrent];
      const combinedCurrent = deduplicateStudySessions(rawCombined);

      setCurrentWeekSessions(combinedCurrent);
      cachedHistoryUserId = userId;
      cachedCurrentWeekSessions = combinedCurrent;
      saveCachedSessions(combinedCurrent);

      // 3. Fetch user's daily goals to extract lapsed goals (Uncompleted expired goals)
      let fetchedGoals: DailyGoal[] = [];
      try {
        const goalsQuery = supabase.from("daily_goals").select("*");
        const withUser = typeof (goalsQuery as any)?.eq === "function" ? (goalsQuery as any).eq("user_id", userId) : goalsQuery;
        const withOrder = typeof (withUser as any)?.order === "function" ? (withUser as any).order("created_at", { ascending: false }) : withUser;
        const goalsRes = (await with10sTimeout(withOrder, "Fetch goals for history")) as { data?: DailyGoal[] | null };
        if (goalsRes?.data) {
          fetchedGoals = goalsRes.data as DailyGoal[];
        }
      } catch (goalErr) {
        console.warn("Could not fetch daily goals for history:", goalErr);
      }

      const serverNowMs = serverNow.getTime();
      const currentWeekStartMs = new Date(currentWeekStartIso).getTime();

      const nextCurrentWeekLapsed: Record<string, LapsedGoalWindow[]> = {};
      const nextPastWeeksLapsed: Record<string, LapsedGoalWindow[]> = {};

      for (const g of fetchedGoals) {
        const expiryMs = new Date(g.expires_at).getTime();
        if (isNaN(expiryMs) || expiryMs > serverNowMs) {
          continue;
        }
        const tasks = (g.tasks || []) as GoalTask[];
        const lapsedTasks = tasks.filter((t) => !t.completed);
        if (lapsedTasks.length === 0) {
          continue;
        }

        const windowInfo: LapsedGoalWindow = {
          id: g.id,
          expires_at: g.expires_at,
          created_at: g.created_at,
          lapsedTasks,
          totalTasksCount: tasks.length,
          completedTasksCount: tasks.length - lapsedTasks.length,
        };

        // ALIGNMENT: Group by created_at date (the day the student set the goal)
        const createdDate = g.created_at || g.expires_at;
        const createdMs = new Date(createdDate).getTime();
        const dateLabel = formatSessionDate(createdDate, serverNow);

        if (createdMs >= currentWeekStartMs) {
          if (!nextCurrentWeekLapsed[dateLabel]) nextCurrentWeekLapsed[dateLabel] = [];
          nextCurrentWeekLapsed[dateLabel].push(windowInfo);
        } else {
          if (!nextPastWeeksLapsed[dateLabel]) nextPastWeeksLapsed[dateLabel] = [];
          nextPastWeeksLapsed[dateLabel].push(windowInfo);
        }
      }

      setCurrentWeekLapsedGoals(nextCurrentWeekLapsed);
      setPastWeeksLapsedGoals(nextPastWeeksLapsed);
      cachedCurrentWeekLapsedGoals = nextCurrentWeekLapsed;
      cachedPastWeeksLapsedGoals = nextPastWeeksLapsed;
    } catch (err) {
      console.error("Failed to fetch study history:", err);
      setError(err instanceof Error ? err.message : "Failed to load study history");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    if (userId && cachedHistoryUserId === userId && cachedCurrentWeekSessions.length === 0) {
      const disk = getCachedSessions<StudySession[]>(userId);
      if (disk && Array.isArray(disk) && disk.length > 0) {
        setCurrentWeekSessions(deduplicateStudySessions(disk));
      }
    }

    fetchHistory();

    const handleQueueFlushed = () => {
      fetchHistory();
    };

    window.addEventListener("studyroom_queue_flushed", handleQueueFlushed);
    window.addEventListener("online", handleQueueFlushed);

    return () => {
      window.removeEventListener("studyroom_queue_flushed", handleQueueFlushed);
      window.removeEventListener("online", handleQueueFlushed);
    };
  }, [fetchHistory, userId]);

  // On-demand fetch for past weeks data when user expands the archive banner
  const fetchPastSessions = useCallback(async (): Promise<boolean> => {
    if (!userId || isPastLoaded || isPastLoading) return isPastLoaded;

    setIsPastLoading(true);
    try {
      const serverNow = getServerNow();
      const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow)).toISOString();
      const ninetyDaysAgoIso = new Date(serverNow.getTime() - 90 * 86400000).toISOString();

      const { data, error: pastErr } = await with10sTimeout(
        supabase
          .from("study_sessions")
          .select("*")
          .eq("user_id", userId)
          .lt("start_time", currentWeekStartIso)
          .gte("start_time", ninetyDaysAgoIso)
          .order("start_time", { ascending: false }),
        "Fetch past study sessions"
      );

      if (pastErr) {
        const { data: rpcData, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_get_study_history");
        if (rpcErr) throw pastErr;
        const allSessions = deduplicateStudySessions((rpcData || []) as StudySession[]);
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

      const loadedPast = deduplicateStudySessions((data || []) as StudySession[]);
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
      const { error: deleteErr } = await with10sTimeout(
        supabase
          .from("study_sessions")
          .delete()
          .eq("user_id", userId),
        "Clear study sessions"
      );

      if (deleteErr) {
        const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_clear_study_history");
        if (rpcErr) throw deleteErr;
        resetStudyHistoryMemoryCache();
        clearUserHistoryCache(userId);
        setCurrentWeekSessions([]);
        setPastSessions([]);
        setPastSummary({ count: 0, minutes: 0 });
        setCurrentWeekLapsedGoals({});
        setPastWeeksLapsedGoals({});
        cachedCurrentWeekLapsedGoals = {};
        cachedPastWeeksLapsedGoals = {};
        setIsPastLoaded(false);
        return data;
      }

      resetStudyHistoryMemoryCache();
      clearUserHistoryCache(userId);
      setCurrentWeekSessions([]);
      setPastSessions([]);
      setPastSummary({ count: 0, minutes: 0 });
      setCurrentWeekLapsedGoals({});
      setPastWeeksLapsedGoals({});
      cachedCurrentWeekLapsedGoals = {};
      cachedPastWeeksLapsedGoals = {};
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

  // Combined full sessions list
  const sessions = useMemo(() => {
    return [...currentWeekSessions, ...pastSessions];
  }, [currentWeekSessions, pastSessions]);

  const totalSummary = useMemo<HistorySummary>(() => {
    const currentMinutes = currentWeekSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
    const totalSessions = currentWeekSessions.length + pastSummary.count;
    const totalMinutes = currentMinutes + pastSummary.minutes;
    return {
      totalSessions,
      totalMinutes,
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
    currentWeekLapsedGoals,
    pastWeeksLapsedGoals,
    loading,
    isPastLoading,
    isPastLoaded,
    actionLoading,
    error,
    refreshHistory: fetchHistory,
    fetchPastSessions,
    clearHistory,
  };
}
