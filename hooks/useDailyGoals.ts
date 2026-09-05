"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { calculateGoalCountdown, GoalCountdownResult } from "@/lib/time/countdown";
import { getServerNow, calibrateWithServerTime } from "@/lib/time/clockSync";
import { validateGoalTasks } from "@/lib/validation/schemas";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export function useDailyGoals(
  userId?: string,
  sessionStartTime?: string | null,
  isSessionActive = false
) {
  const [activeGoal, setActiveGoal] = useState<DailyGoal | null>(null);
  const [countdown, setCountdown] = useState<GoalCountdownResult>({
    remainingSeconds: 0,
    formattedText: "EXPIRED",
    isExpired: true,
  });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchActiveGoal = useCallback(async () => {
    if (!userId) {
      setActiveGoal(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const serverNow = getServerNow();

      // Fetch user's latest goal window
      const { data, error: fetchErr } = await supabase
        .from("daily_goals")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr) {
        throw fetchErr;
      }

      if (data) {
        const goal = data as DailyGoal;
        const isUnexpired = new Date(goal.expires_at).getTime() > serverNow.getTime();

        if (isUnexpired) {
          // Standard unexpired 24-hour goal set
          setActiveGoal(goal);
          setCountdown(calculateGoalCountdown(goal.expires_at, serverNow));
        } else {
          // 24-hour window has expired.
          // Mid-Session Goal Grace Window:
          // If a session is currently active (or finishing) and either:
          // 1. The goal was active when this session started (expires_at >= sessionStartTime)
          // 2. Or the goal expired within the recent session window (last 4 hours)
          const fourHoursAgoMs = serverNow.getTime() - 4 * 3600 * 1000;
          const goalExpiryMs = new Date(goal.expires_at).getTime();
          const wasActiveAtSessionStart = Boolean(
            sessionStartTime && goalExpiryMs >= new Date(sessionStartTime).getTime()
          );
          const isEligibleSessionGrace =
            isSessionActive && (wasActiveAtSessionStart || goalExpiryMs >= fourHoursAgoMs);

          if (isEligibleSessionGrace) {
            setActiveGoal(goal);
            setCountdown({
              remainingSeconds: 0,
              formattedText: "EXPIRED",
              isExpired: true,
            });
          } else {
            setActiveGoal(null);
            setCountdown({
              remainingSeconds: 0,
              formattedText: "EXPIRED",
              isExpired: true,
            });
          }
        }
      } else {
        setActiveGoal(null);
        setCountdown({
          remainingSeconds: 0,
          formattedText: "EXPIRED",
          isExpired: true,
        });
      }
    } catch (err) {
      console.error("Failed to fetch active daily goal:", err);
      setError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, sessionStartTime, isSessionActive]);

  useEffect(() => {
    fetchActiveGoal();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchActiveGoal();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [fetchActiveGoal]);

  // Periodic 1s countdown tick for active goal
  useEffect(() => {
    if (!activeGoal) return;

    const intervalId = setInterval(() => {
      const updated = calculateGoalCountdown(activeGoal.expires_at, getServerNow());
      setCountdown(updated);

      if (updated.isExpired) {
        clearInterval(intervalId);
        // If session is active, do not immediately wipe activeGoal to null
        if (!isSessionActive) {
          fetchActiveGoal();
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeGoal, fetchActiveGoal, isSessionActive]);

  const createGoal = async (rawTaskTexts: string[]) => {
    if (!userId || actionLoading) return;

    const validation = validateGoalTasks(rawTaskTexts);
    if (!validation.isValid) {
      setError(validation.error || "Invalid task entries");
      throw new Error(validation.error || "Invalid task entries");
    }

    setActionLoading(true);
    setError(null);

    try {
      const taskObjects: GoalTask[] = validation.value.map((taskText, idx) => ({
        id: `task-${Date.now()}-${idx}`,
        task: taskText,
        completed: false,
      }));

      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_create_daily_goal", {
        p_tasks: taskObjects,
      });

      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to create goals");

      await fetchActiveGoal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Goal creation failed";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const addTasksToGoal = async (rawTaskTexts: string[]) => {
    if (!userId || actionLoading) return;

    const validation = validateGoalTasks(rawTaskTexts);
    if (!validation.isValid) {
      setError(validation.error || "Invalid task entries");
      throw new Error(validation.error || "Invalid task entries");
    }

    setActionLoading(true);
    setError(null);

    try {
      const taskObjects: GoalTask[] = validation.value.map((taskText, idx) => ({
        id: `task-${Date.now()}-${idx}`,
        task: taskText,
        completed: false,
      }));

      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_add_goal_tasks", {
        p_new_tasks: taskObjects,
      });

      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to add goal tasks");

      await fetchActiveGoal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add goal tasks";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const completeGoalTasks = async (taskIds: string[]) => {
    if (!userId || !activeGoal || taskIds.length === 0 || actionLoading) return;

    setActionLoading(true);
    setError(null);

    try {
      const updatedTasks: GoalTask[] = (activeGoal.tasks || []).map((t) =>
        taskIds.includes(t.id) ? { ...t, completed: true } : t
      );

      const { error: updateErr } = await (supabase as any)
        .from("daily_goals")
        .update({ tasks: updatedTasks })
        .eq("id", activeGoal.id);

      if (updateErr) throw updateErr;

      // Also record task completions in the latest study session if available
      try {
        const { data: latestSession } = await (supabase as any)
          .from("study_sessions")
          .select("id, completed_tasks")
          .eq("user_id", userId)
          .not("end_time", "is", null)
          .order("end_time", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestSession) {
          const newlyCompletedObjects = activeGoal.tasks
            .filter((t) => taskIds.includes(t.id))
            .map((t) => ({ id: t.id, task: t.task }));

          const existingTasks = (latestSession.completed_tasks || []) as { id: string; task: string }[];
          const existingIds = new Set(existingTasks.map((et) => et.id));
          const toAdd = newlyCompletedObjects.filter((nt) => !existingIds.has(nt.id));
          const combined = [...existingTasks, ...toAdd];

          await (supabase as any)
            .from("study_sessions")
            .update({ completed_tasks: combined })
            .eq("id", latestSession.id);
        }
      } catch (sessionErr) {
        console.warn("Could not associate completed tasks with latest session:", sessionErr);
      }

      await fetchActiveGoal();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update goal tasks";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  return {
    activeGoal,
    countdown,
    loading,
    actionLoading,
    error,
    createGoal,
    addTasksToGoal,
    completeGoalTasks,
    refreshGoals: fetchActiveGoal,
  };
}
