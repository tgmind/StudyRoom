"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudySession } from "@/lib/supabase/types";
import {
  HeatmapDay,
  ConsistencyStats,
  DailyStudySummary,
  calculateWeeklyHeatmap,
  calculateConsistencyStats,
  getDateInTimezone,
} from "@/lib/scoring/streak";
import { getWeekStartTimestamp } from "@/lib/time/format";
import { getServerNow } from "@/lib/time/clockSync";

export function useUserStreak(userId?: string, liveActiveMinutes = 0) {
  const [weekSessions, setWeekSessions] = useState<StudySession[]>([]);
  const [pastSummaries, setPastSummaries] = useState<DailyStudySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<HeatmapDay | null>(null);
  const [minuteTick, setMinuteTick] = useState(0);

  const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";

  const fetchStreakData = useCallback(async () => {
    if (!userId) {
      setWeekSessions([]);
      setPastSummaries([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const supabase = createClient();
      const serverNow = getServerNow();
      const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow, timezone)).toISOString();
      const ninetyDaysAgoIso = new Date(serverNow.getTime() - 90 * 86400000).toISOString();

      // 1. Fetch current week's full sessions
      const weekPromise = supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", userId)
        .gte("start_time", currentWeekStartIso)
        .order("start_time", { ascending: false });

      // 2. Fetch past 90 days lightweight sessions to build historical daily summaries
      const pastPromise = supabase
        .from("study_sessions")
        .select("start_time, duration_minutes")
        .eq("user_id", userId)
        .gte("start_time", ninetyDaysAgoIso);

      const [weekRes, pastRes] = await Promise.all([weekPromise, pastPromise]);

      if (weekRes.error) {
        throw weekRes.error;
      }
      if (pastRes.error) {
        throw pastRes.error;
      }

      const fetchedWeekSessions = (weekRes.data || []) as StudySession[];
      setWeekSessions(fetchedWeekSessions);

      // Aggregate past 90 days by date in target timezone
      const dailyMap = new Map<string, number>();
      const pastRows = (pastRes.data || []) as Array<{ start_time: string; duration_minutes: number }>;
      for (const row of pastRows) {
        if (!row.start_time) continue;
        const d = new Date(row.start_time);
        if (isNaN(d.getTime())) continue;
        const dateKey = getDateInTimezone(d, timezone);
        dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + (row.duration_minutes || 0));
      }

      const summaryList: DailyStudySummary[] = Array.from(dailyMap.entries()).map(([dateISO, activeStudyMinutes]) => ({
        dateISO,
        activeStudyMinutes,
      }));

      setPastSummaries(summaryList);
    } catch (err) {
      console.error("Failed to load streak data:", err);
      setError(err instanceof Error ? err.message : "Failed to load streak data");
    } finally {
      setLoading(false);
    }
  }, [userId, timezone]);

  useEffect(() => {
    fetchStreakData();
  }, [fetchStreakData]);

  // Periodic 30s minute ticker to update "lock in Xh Ym" countdown dynamically
  useEffect(() => {
    const interval = setInterval(() => {
      setMinuteTick((prev) => prev + 1);
    }, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setMinuteTick((prev) => prev + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Automated midnight timer to advance day state seamlessly
  useEffect(() => {
    const now = getServerNow();
    // Calculate ms until next midnight
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      const getPart = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || "0", 10);
      const h = getPart("hour") % 24;
      const m = getPart("minute");
      const s = getPart("second");
      const secondsLeft = Math.max(1, 86400 - (h * 3600 + m * 60 + s));
      const msLeft = secondsLeft * 1000 + 500; // 500ms buffer

      const timer = setTimeout(() => {
        setMinuteTick((prev) => prev + 1);
        fetchStreakData();
      }, Math.min(msLeft, 86400000));

      return () => clearTimeout(timer);
    } catch {
      const fallbackTimer = setInterval(() => {
        setMinuteTick((prev) => prev + 1);
      }, 3600000);
      return () => clearInterval(fallbackTimer);
    }
  }, [minuteTick, timezone, fetchStreakData]);

  // Current server synchronized time (advances every 30-60s for live midnight countdown)
  const serverNow = useMemo(() => {
    if (minuteTick < 0) return getServerNow();
    return getServerNow();
  }, [minuteTick]);

  const heatmapDays = useMemo(() => {
    return calculateWeeklyHeatmap(weekSessions, serverNow, liveActiveMinutes, timezone);
  }, [weekSessions, serverNow, liveActiveMinutes, timezone]);

  // Incorporate today's live minutes into daily summaries for accurate streak calculation
  const mergedSummaries = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of pastSummaries) {
      map.set(s.dateISO, s.activeStudyMinutes);
    }
    for (const day of heatmapDays) {
      map.set(day.dateISO, day.activeStudyMinutes);
    }
    return Array.from(map.entries()).map(([dateISO, activeStudyMinutes]) => ({
      dateISO,
      activeStudyMinutes,
    }));
  }, [pastSummaries, heatmapDays]);

  const stats = useMemo(() => {
    return calculateConsistencyStats(heatmapDays, mergedSummaries, serverNow, timezone, weekSessions, liveActiveMinutes);
  }, [heatmapDays, mergedSummaries, serverNow, timezone, weekSessions, liveActiveMinutes]);

  // Ensure inspected day stays updated with live heatmap changes
  const activeSelectedDay = useMemo(() => {
    if (!selectedDay) return null;
    return heatmapDays.find((d) => d.dateISO === selectedDay.dateISO) || selectedDay;
  }, [selectedDay, heatmapDays]);

  return {
    loading,
    error,
    heatmapDays,
    stats,
    selectedDay: activeSelectedDay,
    setSelectedDay,
    refreshStreak: fetchStreakData,
  };
}
