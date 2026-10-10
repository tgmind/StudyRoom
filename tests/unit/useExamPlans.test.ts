import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExamPlans, PLANNER_UPDATED_EVENT } from "@/hooks/useExamPlans";
import * as supabaseClientModule from "@/lib/supabase/client";

describe("useExamPlans Hook", () => {
  const userId = "test-user-uuid";

  const mockPlans = [
    {
      id: "p1",
      user_id: userId,
      exam_name: "UPSC Prelims",
      exam_date: "2027-05-23",
      description: "Civil Services",
      show_in_streaks: true,
      is_locked: false,
      sort_order: 0,
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    },
  ];

  const mockSlots = [
    {
      id: "s1",
      plan_id: "p1",
      user_id: userId,
      title: "Polity & History",
      start_date: "2026-11-01",
      end_date: "2026-12-31",
      category: "syllabus",
      color: "#3b82f6",
      sort_order: 0,
      created_at: "2026-10-09T00:00:00Z",
      updated_at: "2026-10-09T00:00:00Z",
    },
  ];

  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === "exam_plans") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "p2",
                    user_id: userId,
                    exam_name: "New Exam",
                    exam_date: "2027-08-15",
                    show_in_streaks: true,
                    is_locked: false,
                    sort_order: 1,
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
            then: (resolve: any) => resolve({ data: mockPlans, error: null }),
          };
        }
        if (table === "preparation_slots") {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: {
                    id: "s2",
                    plan_id: "p1",
                    user_id: userId,
                    title: "Economy",
                    start_date: "2027-01-01",
                    end_date: "2027-02-15",
                    category: "syllabus",
                    color: "#3b82f6",
                    sort_order: 1,
                  },
                  error: null,
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ error: null }),
                }),
              }),
            }),
            then: (resolve: any) => resolve({ data: mockSlots, error: null }),
          };
        }
        return {};
      }),
      rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
      channel: vi.fn().mockReturnValue({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      }),
      removeChannel: vi.fn(),
    };

    vi.spyOn(supabaseClientModule, "createClient").mockReturnValue(mockSupabase);
  });

  it("initializes with empty plans when userId is not provided", async () => {
    const { result } = renderHook(() => useExamPlans(undefined));
    expect(result.current.plans).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("fetches plans and correlates their preparation slots", async () => {
    const { result } = renderHook(() => useExamPlans(userId));

    await act(async () => {
      await result.current.fetchPlans();
    });

    expect(result.current.plans.length).toBe(1);
    expect(result.current.plans[0].exam_name).toBe("UPSC Prelims");
    expect(result.current.plans[0].slots.length).toBe(1);
    expect(result.current.plans[0].slots[0].title).toBe("Polity & History");
  });

  it("dispatches PLANNER_UPDATED_EVENT when mutations are performed", async () => {
    const eventSpy = vi.fn();
    window.addEventListener(PLANNER_UPDATED_EVENT, eventSpy);

    const { result } = renderHook(() => useExamPlans(userId));

    await act(async () => {
      await result.current.createExamPlan({
        exam_name: "New Exam",
        exam_date: "2027-08-15",
      });
    });

    expect(eventSpy).toHaveBeenCalled();
    window.removeEventListener(PLANNER_UPDATED_EVENT, eventSpy);
  });

  it("rejects mutations on a locked plan", async () => {
    const lockedPlan = { ...mockPlans[0], is_locked: true };
    mockSupabase.from = vi.fn((table: string) => {
      if (table === "exam_plans") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: any) => resolve({ data: [lockedPlan], error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
    });

    const { result } = renderHook(() => useExamPlans(userId));
    await act(async () => {
      await result.current.fetchPlans();
    });

    await expect(
      result.current.updateExamPlan("p1", { exam_name: "Hacked Name" })
    ).rejects.toThrow("Plan is locked");

    await expect(
      result.current.toggleStreaksVisibility("p1", true)
    ).rejects.toThrow("Cannot change calendar settings while plan is locked");

    await expect(
      result.current.reorderPlans(["p1"])
    ).rejects.toThrow("Cannot reorder plans when one or more plans are locked");
  });

  it("clears plans when userId becomes undefined (user logs out)", async () => {
    const { result, rerender } = renderHook(
      ({ uid }: { uid?: string }) => useExamPlans(uid),
      { initialProps: { uid: userId } as { uid?: string } }
    );

    await act(async () => {
      await result.current.fetchPlans();
    });

    expect(result.current.plans.length).toBe(1);

    rerender({ uid: undefined });

    expect(result.current.plans).toEqual([]);
  });
});
