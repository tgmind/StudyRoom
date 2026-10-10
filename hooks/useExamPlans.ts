"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  ExamPlan,
  PreparationSlot,
  ExamPlanWithSlots,
  SlotCategory,
} from "@/lib/supabase/types";
import {
  calculatePlanningInsights,
  validateSlot,
  validateExamDateChange,
} from "@/lib/planner/calculations";
import { PlanningInsights } from "@/lib/planner/types";
import { getServerNow } from "@/lib/time/clockSync";

export const PLANNER_UPDATED_EVENT = "studyroom:planner-updated";

// Module-level SWR memory cache for 0ms tab transitions
let cachedPlansUserId = "";
let cachedExamPlans: ExamPlanWithSlots[] = [];

export function useExamPlans(userId?: string) {
  const hasCachedData = Boolean(
    userId && cachedPlansUserId === userId && cachedExamPlans.length > 0
  );

  const [plans, setPlans] = useState<ExamPlanWithSlots[]>(() => {
    if (userId && cachedPlansUserId === userId) return cachedExamPlans;
    return [];
  });
  const [loading, setLoading] = useState(!hasCachedData);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const isMountedRef = useRef(true);
  const fetchSeqRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const notifyUpdate = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(PLANNER_UPDATED_EVENT));
    }
  }, []);

  const fetchPlans = useCallback(async () => {
    const currentSeq = ++fetchSeqRef.current;

    if (!userId) {
      cachedPlansUserId = "";
      cachedExamPlans = [];
      setPlans([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // 1. Fetch user's exam plans ordered by sort_order ASC, created_at DESC
      const { data: plansData, error: plansErr } = await supabase
        .from("exam_plans")
        .select("*")
        .eq("user_id", userId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (plansErr) throw plansErr;

      const rawPlans = (plansData || []) as ExamPlan[];

      if (currentSeq !== fetchSeqRef.current) return;

      if (rawPlans.length === 0) {
        if (isMountedRef.current) {
          setPlans([]);
          cachedPlansUserId = userId;
          cachedExamPlans = [];
        }
        return;
      }

      // 2. Fetch all slots belonging to user in single batch query (no N+1 queries)
      const planIds = rawPlans.map((p) => p.id);
      const { data: slotsData, error: slotsErr } = await supabase
        .from("preparation_slots")
        .select("*")
        .in("plan_id", planIds)
        .order("start_date", { ascending: true })
        .order("sort_order", { ascending: true });

      if (slotsErr) throw slotsErr;

      if (currentSeq !== fetchSeqRef.current) return;

      const rawSlots = (slotsData || []) as PreparationSlot[];

      // Group slots by plan_id
      const slotsByPlan = new Map<string, PreparationSlot[]>();
      for (const slot of rawSlots) {
        const list = slotsByPlan.get(slot.plan_id) || [];
        list.push(slot);
        slotsByPlan.set(slot.plan_id, list);
      }

      const mergedPlans: ExamPlanWithSlots[] = rawPlans.map((plan) => ({
        ...plan,
        slots: slotsByPlan.get(plan.id) || [],
      }));

      if (isMountedRef.current && currentSeq === fetchSeqRef.current) {
        setPlans(mergedPlans);
        cachedPlansUserId = userId;
        cachedExamPlans = mergedPlans;
      }
    } catch (err) {
      if (currentSeq !== fetchSeqRef.current) return;
      console.error("Failed to fetch exam plans:", err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load exam plans");
      }
    } finally {
      if (isMountedRef.current && currentSeq === fetchSeqRef.current) {
        setLoading(false);
      }
    }
  }, [userId, supabase]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Listen to custom cross-component update events
  useEffect(() => {
    const handlePlannerEvent = () => {
      fetchPlans();
    };

    window.addEventListener(PLANNER_UPDATED_EVENT, handlePlannerEvent);
    return () => {
      window.removeEventListener(PLANNER_UPDATED_EVENT, handlePlannerEvent);
    };
  }, [fetchPlans]);

  // Realtime subscription for cross-device & concurrent multi-tab sync
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`exam-planner:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "exam_plans",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchPlans();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "preparation_slots",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          fetchPlans();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, supabase, fetchPlans]);

  // 1. Create Exam Plan
  const createExamPlan = useCallback(
    async (params: {
      exam_name: string;
      exam_date: string;
      description?: string;
      show_in_streaks?: boolean;
      initial_slot?: {
        title: string;
        start_date: string;
        end_date: string;
        category?: SlotCategory | string;
        color?: string;
        description?: string;
      };
    }) => {
      if (!userId) throw new Error("User must be authenticated");
      setActionLoading(true);
      setError(null);

      try {
        const nextOrder = plans.length > 0
          ? Math.max(...plans.map((p) => p.sort_order)) + 1
          : 0;

        // Call transactional RPC if initial_slot provided or insert directly
        if (params.initial_slot && params.initial_slot.title.trim()) {
          const { data, error: rpcErr } = await (supabase.rpc as any)(
            "rpc_create_exam_plan_with_slot",
            {
              p_exam_name: params.exam_name.trim(),
              p_exam_date: params.exam_date,
              p_description: params.description || null,
              p_show_in_streaks: params.show_in_streaks ?? true,
              p_initial_slot: params.initial_slot,
            }
          );

          if (rpcErr) {
            // Graceful fallback to sequential table inserts if RPC function is not yet created on database
            const { data: planData, error: planErr } = await (supabase
              .from("exam_plans") as any)
              .insert({
                user_id: userId,
                exam_name: params.exam_name.trim(),
                exam_date: params.exam_date,
                description: params.description?.trim() || null,
                show_in_streaks: params.show_in_streaks ?? true,
                sort_order: nextOrder,
                is_locked: false,
              })
              .select()
              .single();

            if (planErr) throw planErr;

            const { error: slotErr } = await (supabase
              .from("preparation_slots") as any)
              .insert({
                plan_id: planData.id,
                user_id: userId,
                title: params.initial_slot.title.trim(),
                start_date: params.initial_slot.start_date,
                end_date: params.initial_slot.end_date,
                category: params.initial_slot.category || "syllabus",
                color: params.initial_slot.color || "#3b82f6",
                description: params.initial_slot.description?.trim() || null,
                sort_order: 0,
              });

            if (slotErr) throw slotErr;
          } else if (data && typeof data === "object" && "success" in data && !data.success) {
            throw new Error((data as any).error || "Failed to create plan");
          }
        } else {
          const { data, error: insertErr } = await (supabase
            .from("exam_plans") as any)
            .insert({
              user_id: userId,
              exam_name: params.exam_name.trim(),
              exam_date: params.exam_date,
              description: params.description?.trim() || null,
              show_in_streaks: params.show_in_streaks ?? true,
              sort_order: nextOrder,
              is_locked: false,
            })
            .select()
            .single();

          if (insertErr) throw insertErr;
        }

        await fetchPlans();
        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to create exam plan";
        setError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 2. Update Exam Plan Details
  const updateExamPlan = useCallback(
    async (
      planId: string,
      updates: {
        exam_name?: string;
        exam_date?: string;
        description?: string | null;
        show_in_streaks?: boolean;
      }
    ) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) throw new Error("Exam plan not found");

      if (targetPlan.is_locked) {
        throw new Error("Plan is locked. Unlock it before editing details.");
      }

      // If exam date is changing, validate against existing slots
      if (updates.exam_date && updates.exam_date !== targetPlan.exam_date) {
        const val = validateExamDateChange(updates.exam_date, targetPlan.slots);
        if (!val.isValid) {
          throw new Error(val.error);
        }
      }

      setActionLoading(true);
      setError(null);

      try {
        const payload: Partial<ExamPlan> = {};
        if (updates.exam_name !== undefined) payload.exam_name = updates.exam_name.trim();
        if (updates.exam_date !== undefined) payload.exam_date = updates.exam_date;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.show_in_streaks !== undefined) payload.show_in_streaks = updates.show_in_streaks;

        const { error: updateErr } = await (supabase
          .from("exam_plans") as any)
          .update(payload)
          .eq("id", planId)
          .eq("user_id", userId);

        if (updateErr) throw updateErr;

        // Optimistic update
        setPlans((prev) =>
          prev.map((p) => (p.id === planId ? { ...p, ...payload } : p))
        );

        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update exam plan";
        setError(msg);
        await fetchPlans(); // Revert on failure
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 3. Delete Exam Plan
  const deleteExamPlan = useCallback(
    async (planId: string) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) return;

      setActionLoading(true);
      setError(null);

      try {
        const { error: delErr } = await supabase
          .from("exam_plans")
          .delete()
          .eq("id", planId)
          .eq("user_id", userId);

        if (delErr) throw delErr;

        setPlans((prev) => prev.filter((p) => p.id !== planId));
        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete exam plan";
        setError(msg);
        await fetchPlans();
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 4. Toggle Lock Plan
  const toggleLockPlan = useCallback(
    async (planId: string, currentLockState: boolean) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) return;

      const newLockState = !currentLockState;
      setActionLoading(true);
      setError(null);

      // Optimistic update
      setPlans((prev) =>
        prev.map((p) => (p.id === planId ? { ...p, is_locked: newLockState } : p))
      );

      try {
        const { error: lockErr } = await (supabase
          .from("exam_plans") as any)
          .update({ is_locked: newLockState })
          .eq("id", planId)
          .eq("user_id", userId);

        if (lockErr) throw lockErr;
        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to toggle lock state";
        setError(msg);
        await fetchPlans(); // Rollback
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 5. Toggle Streaks Visibility
  const toggleStreaksVisibility = useCallback(
    async (planId: string, currentVisibility: boolean) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) return;

      if (targetPlan.is_locked) {
        throw new Error("Cannot change calendar settings while plan is locked.");
      }

      const newVisibility = !currentVisibility;
      setActionLoading(true);
      setError(null);

      // Optimistic update
      setPlans((prev) =>
        prev.map((p) =>
          p.id === planId ? { ...p, show_in_streaks: newVisibility } : p
        )
      );

      try {
        const { error: visErr } = await (supabase
          .from("exam_plans") as any)
          .update({ show_in_streaks: newVisibility })
          .eq("id", planId)
          .eq("user_id", userId);

        if (visErr) throw visErr;
        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to toggle visibility";
        setError(msg);
        await fetchPlans();
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 6. Reorder Plans (Drag & Drop / Move Up & Down)
  const reorderPlans = useCallback(
    async (reorderedPlanIds: string[]) => {
      if (!userId) throw new Error("User must be authenticated");
      if (reorderedPlanIds.length === 0) return;

      // Check if any plan being moved is locked
      const planMap = new Map(plans.map((p) => [p.id, p]));
      const lockedPlans = reorderedPlanIds
        .map((id) => planMap.get(id))
        .filter((p) => p && p.is_locked);

      if (lockedPlans.length > 0) {
        throw new Error("Cannot reorder plans when one or more plans are locked. Unlock them first.");
      }

      // Optimistic local state update
      const reorderedList = reorderedPlanIds
        .map((id, index) => {
          const item = planMap.get(id);
          return item ? { ...item, sort_order: index } : null;
        })
        .filter(Boolean) as ExamPlanWithSlots[];

      setPlans(reorderedList);
      setActionLoading(true);
      setError(null);

      try {
        // Try atomic RPC first
        const { data, error: rpcErr } = await (supabase.rpc as any)(
          "rpc_reorder_exam_plans",
          {
            p_plan_ids: reorderedPlanIds,
          }
        );

        if (rpcErr) {
          // Fallback to sequential updates
          for (let i = 0; i < reorderedPlanIds.length; i++) {
            await (supabase
              .from("exam_plans") as any)
              .update({ sort_order: i })
              .eq("id", reorderedPlanIds[i])
              .eq("user_id", userId);
          }
        } else if (data && typeof data === "object" && "success" in data && !data.success) {
          throw new Error((data as any).error || "Failed to save reorder");
        }

        notifyUpdate();
      } catch (err) {
        console.error("Failed to reorder plans:", err);
        const msg = err instanceof Error ? err.message : "Failed to reorder plans";
        setError(msg);
        await fetchPlans(); // Rollback
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 7. Add Preparation Slot
  const addSlot = useCallback(
    async (
      planId: string,
      slotData: {
        title: string;
        start_date: string;
        end_date: string;
        category?: string;
        color?: string;
        description?: string | null;
      }
    ) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) throw new Error("Exam plan not found");

      if (targetPlan.is_locked) {
        throw new Error("Cannot add slots to a locked exam plan. Unlock it first.");
      }

      // Validate dates and overlaps
      const val = validateSlot(slotData, targetPlan.slots, targetPlan.exam_date);
      if (!val.isValid) {
        throw new Error(val.error);
      }

      setActionLoading(true);
      setError(null);

      try {
        const nextOrder = targetPlan.slots.length > 0
          ? Math.max(...targetPlan.slots.map((s) => s.sort_order)) + 1
          : 0;

        const { data, error: insertErr } = await (supabase
          .from("preparation_slots") as any)
          .insert({
            plan_id: planId,
            user_id: userId,
            title: slotData.title.trim(),
            start_date: slotData.start_date,
            end_date: slotData.end_date,
            category: slotData.category || "custom",
            color: slotData.color || "#3b82f6",
            description: slotData.description?.trim() || null,
            sort_order: nextOrder,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        const newSlot = data as PreparationSlot;

        // Optimistic update
        setPlans((prev) =>
          prev.map((p) => {
            if (p.id === planId) {
              const updatedSlots = [...p.slots, newSlot].sort(
                (a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order
              );
              return { ...p, slots: updatedSlots };
            }
            return p;
          })
        );

        notifyUpdate();
        return newSlot;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to add preparation slot";
        setError(msg);
        await fetchPlans();
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 8. Update Preparation Slot
  const updateSlot = useCallback(
    async (
      slotId: string,
      planId: string,
      updates: {
        title?: string;
        start_date?: string;
        end_date?: string;
        category?: string;
        color?: string;
        description?: string | null;
      }
    ) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) throw new Error("Exam plan not found");

      if (targetPlan.is_locked) {
        throw new Error("Cannot edit slots in a locked exam plan. Unlock it first.");
      }

      const existingSlot = targetPlan.slots.find((s) => s.id === slotId);
      if (!existingSlot) throw new Error("Preparation slot not found");

      const mergedSlot = {
        title: updates.title ?? existingSlot.title,
        start_date: updates.start_date ?? existingSlot.start_date,
        end_date: updates.end_date ?? existingSlot.end_date,
      };

      const val = validateSlot(
        mergedSlot,
        targetPlan.slots,
        targetPlan.exam_date,
        slotId
      );
      if (!val.isValid) {
        throw new Error(val.error);
      }

      setActionLoading(true);
      setError(null);

      try {
        const payload: Partial<PreparationSlot> = {};
        if (updates.title !== undefined) payload.title = updates.title.trim();
        if (updates.start_date !== undefined) payload.start_date = updates.start_date;
        if (updates.end_date !== undefined) payload.end_date = updates.end_date;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.color !== undefined) payload.color = updates.color;
        if (updates.description !== undefined) payload.description = updates.description;

        const { error: updateErr } = await (supabase
          .from("preparation_slots") as any)
          .update(payload)
          .eq("id", slotId)
          .eq("plan_id", planId)
          .eq("user_id", userId);

        if (updateErr) throw updateErr;

        setPlans((prev) =>
          prev.map((p) => {
            if (p.id === planId) {
              const updatedSlots = p.slots
                .map((s) => (s.id === slotId ? { ...s, ...payload } : s))
                .sort(
                  (a, b) => a.start_date.localeCompare(b.start_date) || a.sort_order - b.sort_order
                );
              return { ...p, slots: updatedSlots };
            }
            return p;
          })
        );

        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to update slot";
        setError(msg);
        await fetchPlans();
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // 9. Delete Preparation Slot
  const deleteSlot = useCallback(
    async (slotId: string, planId: string) => {
      if (!userId) throw new Error("User must be authenticated");
      const targetPlan = plans.find((p) => p.id === planId);
      if (!targetPlan) throw new Error("Exam plan not found");

      if (targetPlan.is_locked) {
        throw new Error("Cannot delete slots from a locked exam plan. Unlock it first.");
      }

      setActionLoading(true);
      setError(null);

      try {
        const { error: delErr } = await supabase
          .from("preparation_slots")
          .delete()
          .eq("id", slotId)
          .eq("plan_id", planId)
          .eq("user_id", userId);

        if (delErr) throw delErr;

        setPlans((prev) =>
          prev.map((p) =>
            p.id === planId
              ? { ...p, slots: p.slots.filter((s) => s.id !== slotId) }
              : p
          )
        );

        notifyUpdate();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to delete slot";
        setError(msg);
        await fetchPlans();
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [userId, plans, supabase, fetchPlans, notifyUpdate]
  );

  // Calculate live planning insights whenever plans state updates
  const insights: PlanningInsights = useMemo(() => {
    return calculatePlanningInsights(plans, getServerNow());
  }, [plans]);

  return {
    plans,
    loading,
    actionLoading,
    error,
    insights,
    fetchPlans,
    createExamPlan,
    updateExamPlan,
    deleteExamPlan,
    toggleLockPlan,
    toggleStreaksVisibility,
    reorderPlans,
    addSlot,
    updateSlot,
    deleteSlot,
  };
}
