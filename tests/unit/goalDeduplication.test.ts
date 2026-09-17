import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDailyGoals, deduplicateGoalTasks, generateGoalTaskId } from "@/hooks/useDailyGoals";
import { DailyGoal, GoalTask } from "@/lib/supabase/types";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("Goal Task Deduplication & Self-Healing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("deduplicateGoalTasks pure function", () => {
    it("handles null, undefined, or empty arrays gracefully", () => {
      expect(deduplicateGoalTasks(null)).toEqual([]);
      expect(deduplicateGoalTasks(undefined)).toEqual([]);
      expect(deduplicateGoalTasks([])).toEqual([]);
    });

    it("preserves an array with unique task IDs in order", () => {
      const tasks: GoalTask[] = [
        { id: "task-1", task: "Maths Mania", completed: false },
        { id: "task-2", task: "GK GS", completed: true },
        { id: "task-3", task: "Exercise", completed: false },
      ];
      expect(deduplicateGoalTasks(tasks)).toEqual(tasks);
    });

    it("eliminates exact duplicate task IDs matching user error scenario", () => {
      const duplicateId = "task-1789647748357-0";
      const tasksWithDuplicates: GoalTask[] = [
        { id: "task-1", task: "Maths Mania Percentage 1", completed: false },
        { id: "task-2", task: "GK GS", completed: false },
        { id: "task-1789647748357-0", task: "Exercise", completed: false },
        { id: "task-1789647748357-0", task: "Exercise", completed: false },
      ];

      const cleaned = deduplicateGoalTasks(tasksWithDuplicates);
      expect(cleaned).toHaveLength(3);
      expect(cleaned.map((t) => t.id)).toEqual([
        "task-1",
        "task-2",
        "task-1789647748357-0",
      ]);
      expect(cleaned[2].task).toBe("Exercise");
    });

    it("merges completion status if any duplicate is completed", () => {
      const duplicateId = "task-dup-1";
      const tasks: GoalTask[] = [
        { id: duplicateId, task: "Exercise", completed: false },
        { id: "task-other", task: "Reading", completed: false },
        { id: duplicateId, task: "Exercise", completed: true },
      ];

      const cleaned = deduplicateGoalTasks(tasks);
      expect(cleaned).toHaveLength(2);
      expect(cleaned[0].id).toBe(duplicateId);
      expect(cleaned[0].completed).toBe(true);
    });
  });

  describe("generateGoalTaskId uniqueness", () => {
    it("generates unique IDs across rapid repeated invocations with the same index", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(generateGoalTaskId(0));
      }
      expect(ids.size).toBe(50);
    });
  });

  describe("useDailyGoals self-healing from database duplicates", () => {
    it("deduplicates tasks received from Supabase and triggers self-healing update to DB", async () => {
      const duplicateId = "task-1789647748357-0";
      const corruptGoalFromDb: DailyGoal = {
        id: "goal-corrupt-uuid",
        user_id: "user-123",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
        archived_at: null,
        is_locked: true,
        tasks: [
          { id: "task-1", task: "Maths Mania Percentage 1", completed: false },
          { id: "task-2", task: "GK GS", completed: false },
          { id: duplicateId, task: "Exercise", completed: false },
          { id: duplicateId, task: "Exercise", completed: false },
        ],
      };

      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      mockFrom.mockImplementation((table: string) => {
        if (table === "daily_goals") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: corruptGoalFromDb,
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update: mockUpdate,
          };
        }
        return {};
      });

      const { result } = renderHook(() => useDailyGoals("user-123", null, false));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // Front-end state receives strictly unique tasks
      expect(result.current.activeGoal?.tasks).toHaveLength(3);
      const renderedIds = result.current.activeGoal?.tasks.map((t) => t.id);
      expect(renderedIds).toEqual(["task-1", "task-2", duplicateId]);

      // Verifies self-healing DB update was dispatched
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tasks: expect.arrayContaining([
            expect.objectContaining({ id: "task-1" }),
            expect.objectContaining({ id: "task-2" }),
            expect.objectContaining({ id: duplicateId }),
          ]),
        })
      );
    });
  });

  describe("useDailyGoals cache hydration deduplication", () => {
    it("sanitizes duplicate tasks from localStorage on initial render", async () => {
      const duplicateId = "task-1789647748357-0";
      const corruptCachedGoal: DailyGoal = {
        id: "goal-cached-1",
        user_id: "user-123",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 10 * 3600 * 1000).toISOString(),
        archived_at: null,
        is_locked: true,
        tasks: [
          { id: "task-1", task: "Task 1", completed: false },
          { id: duplicateId, task: "Exercise", completed: false },
          { id: duplicateId, task: "Exercise", completed: false },
        ],
      };

      localStorage.setItem(
        "studyroom_cached_active_goal",
        JSON.stringify(corruptCachedGoal)
      );

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: null,
                  error: null,
                }),
              }),
            }),
          }),
        }),
      });

      const { result } = renderHook(() => useDailyGoals("user-123", null, false));

      // Active goal is cleansed immediately from cached state
      expect(result.current.activeGoal?.tasks).toHaveLength(2);
      expect(result.current.activeGoal?.tasks.map((t) => t.id)).toEqual([
        "task-1",
        duplicateId,
      ]);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });
});
