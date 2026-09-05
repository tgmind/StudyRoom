import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useDailyGoals } from "@/hooks/useDailyGoals";
import { DailyGoal } from "@/lib/supabase/types";

const mockFrom = vi.fn();

const mockClient = {
  from: mockFrom,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("useDailyGoals Hook - Mid-Session Expiry & Grace Window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retains activeGoal if goal expired mid-session and user is actively studying", async () => {
    const now = Date.now();
    // Goal created 24.5 hours ago, expired 30 minutes ago
    const expiredGoalCreatedAt = new Date(now - 24.5 * 3600 * 1000).toISOString();
    const expiredGoalExpiresAt = new Date(now - 0.5 * 3600 * 1000).toISOString();
    // Session started 1 hour ago (when goal was still active!)
    const sessionStartTime = new Date(now - 1 * 3600 * 1000).toISOString();

    const mockGoal: DailyGoal = {
      id: "goal-1",
      user_id: "user-123",
      created_at: expiredGoalCreatedAt,
      expires_at: expiredGoalExpiresAt,
      archived_at: null,
      is_locked: true,
      tasks: [
        { id: "task-1", task: "Physics Chapter 4", completed: false },
        { id: "task-2", task: "Solve 20 Calculus problems", completed: false },
      ],
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockGoal, error: null }),
            }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      useDailyGoals("user-123", sessionStartTime, true)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Goal must NOT be null, so StopHookModal can render tasks
    expect(result.current.activeGoal).not.toBeNull();
    expect(result.current.activeGoal?.id).toBe("goal-1");
    expect(result.current.activeGoal?.tasks).toHaveLength(2);
    // Countdown should indicate expired
    expect(result.current.countdown.isExpired).toBe(true);
    expect(result.current.countdown.formattedText).toBe("EXPIRED");
  });

  it("sets activeGoal to null if goal is expired and user is offline", async () => {
    const now = Date.now();
    const expiredGoalCreatedAt = new Date(now - 25 * 3600 * 1000).toISOString();
    const expiredGoalExpiresAt = new Date(now - 1 * 3600 * 1000).toISOString();

    const mockGoal: DailyGoal = {
      id: "goal-2",
      user_id: "user-123",
      created_at: expiredGoalCreatedAt,
      expires_at: expiredGoalExpiresAt,
      archived_at: null,
      is_locked: true,
      tasks: [
        { id: "task-1", task: "Chemistry Chapter 2", completed: true },
      ],
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockGoal, error: null }),
            }),
          }),
        }),
      }),
    });

    // User is offline: isSessionActive = false, sessionStartTime = null
    const { result } = renderHook(() =>
      useDailyGoals("user-123", null, false)
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Goal must be null so user is prompted to create a new 24-hour goal set
    expect(result.current.activeGoal).toBeNull();
    expect(result.current.countdown.isExpired).toBe(true);
  });
});
