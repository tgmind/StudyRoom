"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { calculateGoalCountdown, GoalCountdownResult } from "@/lib/time/countdown";
import { validateGoalTasks } from "@/lib/validation/schemas";

export function useDailyGoals(userId?: string) {
  const [activeGoal, setActiveGoal] = useState<DailyGoal | null>(null);
  const [countdown, setCountdown] = useState<GoalCountdownResult>({
    isExpired: true,
    remainingSeconds: 0,
    formattedText: "NO ACTIVE GOAL",
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
      const nowISO = new Date().toISOString();

      const { data, error: fetchErr } = await supabase
        .from("daily_goals")
        .select("*")
        .eq("user_id", userId)
        .gt("expires_at", nowISO)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      const goal = data as DailyGoal | null;
      setActiveGoal(goal);

      if (goal) {
        setCountdown(calculateGoalCountdown(goal.expires_at, new Date()));
      } else {
        setCountdown({
          isExpired: true,
          remainingSeconds: 0,
          formattedText: "NO ACTIVE GOAL",
        });
      }
    } catch (err) {
      console.error("Failed to fetch daily goals:", err);
      setError(err instanceof Error ? err.message : "Failed to load active goals");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    fetchActiveGoal();
  }, [fetchActiveGoal]);

  // Periodic countdown refresh (derives remaining time from expires_at)
  useEffect(() => {
    if (!activeGoal) return;

    const intervalId = setInterval(() => {
      setCountdown(calculateGoalCountdown(activeGoal.expires_at, new Date()));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeGoal]);

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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("rpc_create_daily_goal", {
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

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("rpc_add_goal_tasks", {
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

  // Helper completion percentage calculation
  const totalTasks = activeGoal?.tasks?.length ?? 0;
  const completedTasks = activeGoal?.tasks?.filter((t) => t.completed)?.length ?? 0;
  const completionPercentage =
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  return {
    activeGoal,
    countdown,
    totalTasks,
    completedTasks,
    completionPercentage,
    loading,
    actionLoading,
    error,
    createGoal,
    addTasksToGoal,
    refreshGoals: fetchActiveGoal,
  };
}
