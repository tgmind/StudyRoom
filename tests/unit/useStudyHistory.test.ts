import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useStudyHistory, deduplicateStudySessions } from "@/hooks/useStudyHistory";
import { StudySession } from "@/lib/supabase/types";

const mockFrom = vi.fn();
const mockRpc = vi.fn();

const mockClient = {
  from: mockFrom,
  rpc: mockRpc,
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mockClient,
}));

describe("useStudyHistory Hook", () => {
  const mockUserId = "user-123";
  const now = new Date();

  const currentWeekSession: StudySession = {
    id: "sess-current-1",
    user_id: mockUserId,
    start_time: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(),
    end_time: new Date(now.getTime() - 1 * 3600 * 1000).toISOString(),
    duration_minutes: 60,
    completed_tasks: [{ id: "t1", task: "Optics" }],
  };

  const pastSessionSummary = {
    id: "sess-past-1",
    duration_minutes: 90,
    start_time: new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
  };

  const pastFullSession: StudySession = {
    id: "sess-past-1",
    user_id: mockUserId,
    start_time: new Date(now.getTime() - 10 * 24 * 3600 * 1000).toISOString(),
    end_time: new Date(now.getTime() - (10 * 24 * 3600 - 5400) * 1000).toISOString(),
    duration_minutes: 90,
    completed_tasks: [{ id: "t2", task: "Organic" }],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches current week sessions and past summary on initial load", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "study_sessions") {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === "*") {
              // Current week query
              return {
                eq: vi.fn().mockReturnValue({
                  gte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [currentWeekSession],
                      error: null,
                    }),
                  }),
                }),
              };
            }
            // Lightweight summary query
            return {
              eq: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [pastSessionSummary],
                    error: null,
                  }),
                }),
              }),
            };
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useStudyHistory(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.currentWeekSessions).toHaveLength(1);
    expect(result.current.currentWeekSessions[0].id).toBe("sess-current-1");
    // Past sessions are NOT yet loaded in full (on-demand)
    expect(result.current.pastSessions).toHaveLength(0);
    expect(result.current.isPastLoaded).toBe(false);

    // Total summary includes both current week and earlier week summary
    expect(result.current.totalSummary.totalSessions).toBe(2);
    expect(result.current.totalSummary.totalMinutes).toBe(150);
    expect(result.current.totalSummary.pastWeeksCount).toBe(1);
    expect(result.current.totalSummary.pastWeeksMinutes).toBe(90);
  });

  it("fetches earlier week sessions on demand via fetchPastSessions", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "study_sessions") {
        return {
          select: vi.fn().mockImplementation((fields: string) => {
            if (fields === "*") {
              return {
                eq: vi.fn().mockImplementation(() => ({
                  gte: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [currentWeekSession],
                      error: null,
                    }),
                  }),
                  lt: vi.fn().mockReturnValue({
                    gte: vi.fn().mockReturnValue({
                      order: vi.fn().mockResolvedValue({
                        data: [pastFullSession],
                        error: null,
                      }),
                    }),
                  }),
                })),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                lt: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [pastSessionSummary],
                    error: null,
                  }),
                }),
              }),
            };
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useStudyHistory(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isPastLoaded).toBe(false);

    let success = false;
    await act(async () => {
      success = await result.current.fetchPastSessions();
    });

    expect(success).toBe(true);
    expect(result.current.isPastLoaded).toBe(true);
    expect(result.current.pastSessions).toHaveLength(1);
    expect(result.current.pastSessions[0].id).toBe("sess-past-1");
    expect(result.current.sessions).toHaveLength(2);
  });

  it("clears study history and resets state cleanly", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "study_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [currentWeekSession],
                  error: null,
                }),
              }),
              lt: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({
                  data: [pastSessionSummary],
                  error: null,
                }),
              }),
            }),
          }),
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useStudyHistory(mockUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.totalSummary.totalSessions).toBe(2);

    await act(async () => {
      await result.current.clearHistory();
    });

    expect(result.current.currentWeekSessions).toHaveLength(0);
    expect(result.current.pastSessions).toHaveLength(0);
    expect(result.current.totalSummary.totalSessions).toBe(0);
    expect(result.current.totalSummary.totalMinutes).toBe(0);
    expect(result.current.isPastLoaded).toBe(false);
  });

  it("groups lapsed goals under the day they were created (created_at), NOT when expired", async () => {
    const lapsedTestUserId = "user-lapsed-test-unique";
    // Goal created on Monday at 08:00 AM, expires on Tuesday at 04:00 AM (serverNow is Tuesday 05:00 AM)
    const mondayCreatedIso = new Date(Date.now() - 21 * 3600 * 1000).toISOString();
    const tuesdayExpiresIso = new Date(Date.now() - 1 * 3600 * 1000).toISOString();

    const mockLapsedGoal = {
      id: "goal-mon-1",
      user_id: lapsedTestUserId,
      tasks: [
        { id: "t1", task: "Read Physics Chapter 5", completed: false },
        { id: "t2", task: "Math Calculus Practice", completed: true },
      ],
      created_at: mondayCreatedIso,
      expires_at: tuesdayExpiresIso,
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === "study_sessions") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
              lt: vi.fn().mockReturnValue({
                gte: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "daily_goals") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockLapsedGoal], error: null }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const { result } = renderHook(() => useStudyHistory(lapsedTestUserId));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const currentWeekLapsed = result.current.currentWeekLapsedGoals;
    const dateKeys = Object.keys(currentWeekLapsed);
    expect(dateKeys.length).toBeGreaterThan(0);

    // Goal is inside the group for the day it was set (created_at), not expires_at
    const allLapsedWindows = Object.values(currentWeekLapsed).flat();
    expect(allLapsedWindows).toHaveLength(1);
    expect(allLapsedWindows[0].id).toBe("goal-mon-1");
    expect(allLapsedWindows[0].lapsedTasks).toHaveLength(1);
    expect(allLapsedWindows[0].lapsedTasks[0].id).toBe("t1");
    expect(allLapsedWindows[0].completedTasksCount).toBe(1);
  });

  describe("deduplicateStudySessions Resilience", () => {
    it("consolidates duplicate session attempts starting at the same time into a single max-duration session", () => {
      const startTime = "2026-09-18T11:39:00.000Z";
      const buggedSessions: StudySession[] = [
        {
          id: "offline_1740001",
          user_id: "user-123",
          start_time: startTime,
          end_time: "2026-09-18T11:45:00.000Z",
          duration_minutes: 6,
          break_minutes: 0,
          completed_tasks: [{ id: "t1", task: "Task 1" }],
        },
        {
          id: "offline_1740002",
          user_id: "user-123",
          start_time: startTime,
          end_time: "2026-09-18T11:42:00.000Z",
          duration_minutes: 3,
          break_minutes: 0,
          completed_tasks: [{ id: "t2", task: "Task 2" }],
        },
        {
          id: "offline_1740003",
          user_id: "user-123",
          start_time: startTime,
          end_time: "2026-09-18T11:40:00.000Z",
          duration_minutes: 1,
          break_minutes: 0,
          completed_tasks: [],
        },
        {
          id: "offline_1740004",
          user_id: "user-123",
          start_time: startTime,
          end_time: "2026-09-18T11:39:00.000Z",
          duration_minutes: 0,
          break_minutes: 0,
          completed_tasks: [],
        },
      ];

      const deduped = deduplicateStudySessions(buggedSessions);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].duration_minutes).toBe(6);
      expect(deduped[0].completed_tasks).toHaveLength(2);
      expect(deduped[0].completed_tasks?.map((t) => t.id)).toEqual(["t1", "t2"]);
    });

    it("prefers canonical server UUID over temporary offline ID", () => {
      const startTime = "2026-09-18T11:39:00.000Z";
      const sessions: StudySession[] = [
        {
          id: "offline_1740001",
          user_id: "user-123",
          start_time: startTime,
          end_time: "2026-09-18T11:45:00.000Z",
          duration_minutes: 6,
        },
        {
          id: "4892c906-8d59-4d64-a3f2-1d5b32f41851",
          user_id: "user-123",
          start_time: startTime,
          end_time: "2026-09-18T11:45:00.000Z",
          duration_minutes: 6,
        },
      ];

      const deduped = deduplicateStudySessions(sessions);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe("4892c906-8d59-4d64-a3f2-1d5b32f41851");
    });

    it("drops 0-minute ghost sessions with no tasks and 0 break, but preserves sessions with tasks or breaks", () => {
      const sessions: StudySession[] = [
        {
          id: "ghost-1",
          user_id: "user-123",
          start_time: "2026-09-18T10:00:00.000Z",
          end_time: "2026-09-18T10:00:00.000Z",
          duration_minutes: 0,
          break_minutes: 0,
          completed_tasks: [],
        },
        {
          id: "valid-task-0m",
          user_id: "user-123",
          start_time: "2026-09-18T11:00:00.000Z",
          end_time: "2026-09-18T11:00:30.000Z",
          duration_minutes: 0,
          break_minutes: 0,
          completed_tasks: [{ id: "t1", task: "Quick Goal Check" }],
        },
        {
          id: "valid-break-0m",
          user_id: "user-123",
          start_time: "2026-09-18T12:00:00.000Z",
          end_time: "2026-09-18T12:05:00.000Z",
          duration_minutes: 0,
          break_minutes: 5,
          completed_tasks: [],
        },
      ];

      const deduped = deduplicateStudySessions(sessions);
      expect(deduped).toHaveLength(2);
      expect(deduped.map((s) => s.id)).toEqual(["valid-break-0m", "valid-task-0m"]);
    });
  });
});
