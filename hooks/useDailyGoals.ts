"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";
import { calculateGoalCountdown, GoalCountdownResult } from "@/lib/time/countdown";
import { getServerNow } from "@/lib/time/clockSync";
import { GOAL_WINDOW_MS } from "@/lib/time/format";
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

/**
 * Safely deduplicates goal tasks by task ID while strictly preserving original order.
 * If duplicate IDs exist, merges completion state (true if any duplicate instance is completed).
 */
export function deduplicateGoalTasks(tasks?: GoalTask[] | null): GoalTask[] {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return [];
  if (tasks.length === 1) return tasks[0]?.id ? [{ ...tasks[0] }] : [];

  const seen = new Set<string>();
  const result: GoalTask[] = [];

  for (const item of tasks) {
    if (!item || !item.id) continue;
    if (seen.has(item.id)) {
      const existing = result.find((t) => t.id === item.id);
      if (existing && item.completed) {
        existing.completed = true;
      }
      continue;
    }
    seen.add(item.id);
    result.push({ ...item });
  }

  return result;
}

/**
 * Generates a cryptographically unique task ID with timestamp, index, and random entropy.
 */
export function generateGoalTaskId(idx: number): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).substring(2, 10);
  return `task-${Date.now()}-${idx}-${randomPart}`;
}

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
  const isSubmittingAddTasksRef = useRef(false);

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
        let hasDuplicatesInDb = false;
        if (goal.tasks && Array.isArray(goal.tasks)) {
          const cleanedTasks = deduplicateGoalTasks(goal.tasks);
          if (cleanedTasks.length !== goal.tasks.length) {
            hasDuplicatesInDb = true;
            goal.tasks = cleanedTasks;
          }
        }

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

        // Automatic self-healing: if duplicates were present in the database row,
        // sanitize it immediately so future queries and other clients receive clean data.
        if (hasDuplicatesInDb && goal.id) {
          console.info("[useDailyGoals] Self-healing daily_goals: removing duplicate tasks from DB for goal:", goal.id);
          (async () => {
            try {
              const { error: healErr } = await (supabase.from("daily_goals") as any)
                .update({ tasks: goal.tasks })
                .eq("id", goal.id);
              if (healErr) {
                console.warn("[useDailyGoals] Self-healing update failed:", healErr);
              } else {
                console.info("[useDailyGoals] Self-healing update succeeded in database");
              }
            } catch (err) {
              console.warn("[useDailyGoals] Self-healing error:", err);
            }
          })();
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
      if (cached.tasks && Array.isArray(cached.tasks)) {
        const cleanedTasks = deduplicateGoalTasks(cached.tasks);
        if (cleanedTasks.length !== cached.tasks.length) {
          cached.tasks = cleanedTasks;
          saveCachedActiveGoal(cached);
        }
      }
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
    const expiresAt = new Date(now.getTime() + GOAL_WINDOW_MS).toISOString();
    const taskObjects: GoalTask[] = validation.value.map((taskText, idx) => ({
      id: generateGoalTaskId(idx),
      task: taskText,
      completed: false,
    }));
    const sanitizedTasks = deduplicateGoalTasks(taskObjects);

    // Optimistically update local active goal immediately
    const optimisticGoal: DailyGoal = {
      id: "goal_" + Date.now(),
      user_id: userId,
      tasks: sanitizedTasks,
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
          p_tasks: sanitizedTasks,
        }),
        "Create goal RPC"
      );

      if (!rpcErr && data) {
        await fetchActiveGoal();
      } else if (rpcErr) {
        // Enqueue only if remote network failed so sync worker syncs when reconnected
        enqueueSessionAction("create_goal", { payload: { tasks: sanitizedTasks } });
      }
    } catch (err) {
      console.warn("Create goal timed out or offline; safely queued on disk:", err);
      enqueueSessionAction("create_goal", { payload: { tasks: sanitizedTasks } });
    } finally {
      isSubmittingGoalRef.current = false;
      setActionLoading(false);
    }
  };

  const addTasksToGoal = async (rawTaskTexts: string[]) => {
    if (!userId || actionLoading || isSubmittingAddTasksRef.current) return;

    const validation = validateGoalTasks(rawTaskTexts);
    if (!validation.isValid) {
      setError(validation.error || "Invalid task entries");
      throw new Error(validation.error || "Invalid task entries");
    }

    isSubmittingAddTasksRef.current = true;
    setActionLoading(true);
    setError(null);

    const newTaskObjects: GoalTask[] = validation.value.map((taskText, idx) => ({
      id: generateGoalTaskId(idx),
      task: taskText,
      completed: false,
    }));

    // Optimistically append locally with strict deduplication
    if (activeGoal) {
      const updatedTasks = deduplicateGoalTasks([
        ...(activeGoal.tasks || []),
        ...newTaskObjects,
      ]);
      const updatedGoal = { ...activeGoal, tasks: updatedTasks };
      setActiveGoal(updatedGoal);
      saveCachedActiveGoal(updatedGoal);
    }

    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_add_goal_tasks", {
          p_new_tasks: newTaskObjects,
        }),
        "Add goal tasks RPC"
      );

      if (!rpcErr && data) {
        await fetchActiveGoal();
      } else if (rpcErr) {
        // Enqueue only if remote network failed so sync worker syncs when reconnected
        enqueueSessionAction("add_goal_tasks", { payload: { tasks: newTaskObjects } });
      }
    } catch (err) {
      console.warn("Add goal tasks timed out or offline; safely queued on disk:", err);
      enqueueSessionAction("add_goal_tasks", { payload: { tasks: newTaskObjects } });
    } finally {
      isSubmittingAddTasksRef.current = false;
      setActionLoading(false);
    }
  };

  const completeGoalTasks = async (taskIds: string[]) => {
    if (!userId || !activeGoal || taskIds.length === 0 || actionLoading) return;

    setActionLoading(true);
    setError(null);

    // Optimistically mark tasks complete in local state and cache with deduplication
    const updatedTasks: GoalTask[] = deduplicateGoalTasks(
      (activeGoal.tasks || []).map((t) =>
        taskIds.includes(t.id) ? { ...t, completed: true } : t
      )
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
