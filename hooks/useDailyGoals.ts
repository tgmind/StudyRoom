"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { calculateGoalCountdown, GoalCountdownResult } from "@/lib/time/countdown";
import { getServerNow } from "@/lib/time/clockSync";
import { validateGoalTasks } from "@/lib/validation/schemas";
import {
  getCachedActiveGoal,
  saveCachedActiveGoal,
  enqueueSessionAction,
  with10sTimeout,
} from "@/lib/offline/sessionQueue";

type RpcCaller = {
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>;
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
  const isSubmittingGoalRef = useRef(false);

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

      // Fetch user's latest goal window with 10s safety timeout
      const { data, error: fetchErr } = await with10sTimeout(
        supabase
          .from("daily_goals")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "Fetch active goal"
      );

      if (fetchErr) throw fetchErr;

      if (data) {
        const goal = data as DailyGoal;
        const isUnexpired = new Date(goal.expires_at).getTime() > serverNow.getTime();

        if (isUnexpired) {
          setActiveGoal(goal);
          saveCachedActiveGoal(goal);
          setCountdown(calculateGoalCountdown(goal.expires_at, serverNow));
        } else {
          const fourHoursAgoMs = serverNow.getTime() - 4 * 3600 * 1000;
          const goalExpiryMs = new Date(goal.expires_at).getTime();
          const wasActiveAtSessionStart = Boolean(
            sessionStartTime && goalExpiryMs >= new Date(sessionStartTime).getTime()
          );
          const isEligibleSessionGrace =
            isSessionActive && (wasActiveAtSessionStart || goalExpiryMs >= fourHoursAgoMs);

          if (isEligibleSessionGrace) {
            setActiveGoal(goal);
            saveCachedActiveGoal(goal);
            setCountdown({
              remainingSeconds: 0,
              formattedText: "EXPIRED",
              isExpired: true,
            });
          } else {
            setActiveGoal(null);
            saveCachedActiveGoal(null);
            setCountdown({
              remainingSeconds: 0,
              formattedText: "EXPIRED",
              isExpired: true,
            });
          }
        }
      } else {
        setActiveGoal(null);
        saveCachedActiveGoal(null);
        setCountdown({
          remainingSeconds: 0,
          formattedText: "EXPIRED",
          isExpired: true,
        });
      }
    } catch (err) {
      console.warn("Could not fetch active daily goal online (preserving cached goal):", err);
      // Keep cached goal if present
    } finally {
      setLoading(false);
    }
  }, [supabase, userId, sessionStartTime, isSessionActive]);

  useEffect(() => {
    // Restore cached active goal on mount without SSR hydration mismatch
    const cached = getCachedActiveGoal<DailyGoal>();
    if (cached) {
      setActiveGoal(cached);
      if (cached.expires_at) {
        setCountdown(calculateGoalCountdown(cached.expires_at, new Date()));
      }
    }

    fetchActiveGoal();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchActiveGoal();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    // Real-time listener for daily_goals table
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (userId && typeof supabase.channel === "function") {
      channel = supabase
        .channel(`daily_goals_user_${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "daily_goals",
            filter: `user_id=eq.${userId}`,
          },
          () => {
            fetchActiveGoal();
          }
        )
        .subscribe();
    }

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
      if (channel && typeof supabase.removeChannel === "function") {
        try {
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [fetchActiveGoal, supabase, userId]);

  // Periodic 1s countdown tick
  useEffect(() => {
    if (!activeGoal) return;

    const intervalId = setInterval(() => {
      const updated = calculateGoalCountdown(activeGoal.expires_at, getServerNow());
      setCountdown(updated);

      if (updated.isExpired) {
        clearInterval(intervalId);
        if (!isSessionActive) {
          fetchActiveGoal();
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeGoal, fetchActiveGoal, isSessionActive]);

  const createGoal = async (rawTaskTexts: string[]) => {
    if (!userId || actionLoading || isSubmittingGoalRef.current) return;
    isSubmittingGoalRef.current = true;

    const validation = validateGoalTasks(rawTaskTexts);
    if (!validation.isValid) {
      isSubmittingGoalRef.current = false;
      setError(validation.error || "Invalid task entries");
      throw new Error(validation.error || "Invalid task entries");
    }

    setActionLoading(true);
    setError(null);

    const now = getServerNow();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const taskObjects: GoalTask[] = validation.value.map((taskText, idx) => ({
      id: `task-${Date.now()}-${idx}`,
      task: taskText,
      completed: false,
    }));

    // Optimistically update local active goal immediately
    const optimisticGoal: DailyGoal = {
      id: "goal_" + Date.now(),
      user_id: userId,
      tasks: taskObjects,
      created_at: now.toISOString(),
      expires_at: expiresAt,
      is_locked: true,
      archived_at: null,
    };
    setActiveGoal(optimisticGoal);
    saveCachedActiveGoal(optimisticGoal);
    setCountdown(calculateGoalCountdown(expiresAt, now));

    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_create_daily_goal", {
          p_tasks: taskObjects,
        }),
        "Create goal RPC"
      );

      if (!rpcErr && data) {
        await fetchActiveGoal();
      } else if (rpcErr) {
        // Enqueue only if remote network failed so sync worker syncs when reconnected
        enqueueSessionAction("create_goal", { payload: { tasks: taskObjects } });
      }
    } catch (err) {
      console.warn("Create goal timed out or offline; safely queued on disk:", err);
      enqueueSessionAction("create_goal", { payload: { tasks: taskObjects } });
    } finally {
      isSubmittingGoalRef.current = false;
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

    const newTaskObjects: GoalTask[] = validation.value.map((taskText, idx) => ({
      id: `task-${Date.now()}-${idx}`,
      task: taskText,
      completed: false,
    }));

    // Optimistically append locally
    if (activeGoal) {
      const updatedTasks = [...(activeGoal.tasks || []), ...newTaskObjects];
      const updatedGoal = { ...activeGoal, tasks: updatedTasks };
      setActiveGoal(updatedGoal);
      saveCachedActiveGoal(updatedGoal);
    }

    enqueueSessionAction("add_goal_tasks", { payload: { tasks: newTaskObjects } });

    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_add_goal_tasks", {
          p_new_tasks: newTaskObjects,
        }),
        "Add goal tasks RPC"
      );

      if (!rpcErr && data) {
        await fetchActiveGoal();
      }
    } catch (err) {
      console.warn("Add goal tasks timed out or offline; safely queued on disk:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const completeGoalTasks = async (taskIds: string[]) => {
    if (!userId || !activeGoal || taskIds.length === 0 || actionLoading) return;

    setActionLoading(true);
    setError(null);

    // Optimistically mark tasks complete in local state and cache
    const updatedTasks: GoalTask[] = (activeGoal.tasks || []).map((t) =>
      taskIds.includes(t.id) ? { ...t, completed: true } : t
    );
    const updatedGoal = { ...activeGoal, tasks: updatedTasks };
    setActiveGoal(updatedGoal);
    saveCachedActiveGoal(updatedGoal);

    try {
      const res: any = await with10sTimeout(
        (supabase.from("daily_goals") as any)
          .update({ tasks: updatedTasks })
          .eq("id", activeGoal.id),
        "Update goal tasks"
      );
      const updateErr = res?.error;

      if (updateErr) {
        console.warn("Update goal tasks failed over network; preserved locally:", updateErr);
      }
    } catch (err) {
      console.warn("Network error completing goal tasks; preserved locally:", err);
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
