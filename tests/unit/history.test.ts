import { describe, it, expect } from "vitest";
import { validateGoalTasks } from "@/lib/validation/schemas";
import { formatMinutesToHours, formatSessionTime, formatSessionDate, getWeekStartTimestamp } from "@/lib/time/format";
import { GoalTask, StudySession } from "@/lib/supabase/types";

describe("Goal Appending & Study History Logic", () => {
  it("validates appending new tasks without deleting existing tasks", () => {
    const existingTasks: GoalTask[] = [
      { id: "t1", task: "Math Practice", completed: false },
    ];

    const newRawTasks = ["Physics PYQs", "Chemistry Revision"];
    const validation = validateGoalTasks(newRawTasks);
    expect(validation.isValid).toBe(true);

    const appendedTasks: GoalTask[] = [
      ...existingTasks,
      ...validation.value.map((t, idx) => ({
        id: `t-new-${idx}`,
        task: t,
        completed: false,
      })),
    ];

    expect(appendedTasks.length).toBe(3);
    expect(appendedTasks[0].task).toBe("Math Practice");
    expect(appendedTasks[1].task).toBe("Physics PYQs");
    expect(appendedTasks[2].task).toBe("Chemistry Revision");
  });

  it("calculates total study session history aggregates accurately", () => {
    const sampleHistory: StudySession[] = [
      {
        id: "s1",
        user_id: "u1",
        start_time: "2026-09-01T10:00:00Z",
        end_time: "2026-09-01T11:30:00Z",
        duration_minutes: 90,
        completed_tasks: [{ id: "t1", task: "Calculus" }],
      },
      {
        id: "s2",
        user_id: "u1",
        start_time: "2026-09-01T14:00:00Z",
        end_time: "2026-09-01T15:00:00Z",
        duration_minutes: 60,
        completed_tasks: [],
      },
    ];

    const totalMinutes = sampleHistory.reduce((acc, s) => acc + s.duration_minutes, 0);
    expect(totalMinutes).toBe(150);
    expect(formatMinutesToHours(totalMinutes)).toBe("2.5h");
  });

  it("formats session times accurately in 12-hour AM/PM for Gorakhpur, UP (Asia/Kolkata)", () => {
    // UTC 07:39:00 -> 1:09 PM IST (07:39 + 05:30 = 13:09)
    expect(formatSessionTime("2026-09-02T07:39:00Z", "Asia/Kolkata")).toBe("1:09 PM");

    // UTC 08:58:00 -> 2:28 PM IST (08:58 + 05:30 = 14:28)
    expect(formatSessionTime("2026-09-02T08:58:00Z", "Asia/Kolkata")).toBe("2:28 PM");

    // UTC 09:33:00 -> 3:03 PM IST (09:33 + 05:30 = 15:03)
    expect(formatSessionTime("2026-09-02T09:33:00Z", "Asia/Kolkata")).toBe("3:03 PM");

    // UTC 10:33:00 -> 4:03 PM IST (10:33 + 05:30 = 16:03)
    expect(formatSessionTime("2026-09-02T10:33:00Z", "Asia/Kolkata")).toBe("4:03 PM");

    // Morning: UTC 03:45:00 -> 9:15 AM IST (03:45 + 05:30 = 09:15)
    expect(formatSessionTime("2026-09-03T03:45:00Z", "Asia/Kolkata")).toBe("9:15 AM");

    // Late Night: UTC 18:15:00 -> 11:45 PM IST (18:15 + 05:30 = 23:45)
    expect(formatSessionTime("2026-09-02T18:15:00Z", "Asia/Kolkata")).toBe("11:45 PM");

    // Post-Midnight: UTC 18:45:00 -> 12:15 AM IST (18:45 + 05:30 = 00:15 next day)
    expect(formatSessionTime("2026-09-02T18:45:00Z", "Asia/Kolkata")).toBe("12:15 AM");
  });

  it("categorizes Today, Yesterday, and past dates accurately based on Gorakhpur, UP calendar boundaries", () => {
    // Reference now: Sep 3, 2026 at 2:01 PM IST (08:31 UTC)
    const mockNow = new Date("2026-09-03T08:31:32Z");

    // Session yesterday afternoon: Sep 2 at 1:09 PM IST (07:39 UTC)
    expect(formatSessionDate("2026-09-02T07:39:00Z", mockNow, "Asia/Kolkata")).toBe("Yesterday");

    // Session yesterday late afternoon: Sep 2 at 3:03 PM IST (09:33 UTC)
    expect(formatSessionDate("2026-09-02T09:33:00Z", mockNow, "Asia/Kolkata")).toBe("Yesterday");

    // Session today morning: Sep 3 at 9:00 AM IST (03:30 UTC)
    expect(formatSessionDate("2026-09-03T03:30:00Z", mockNow, "Asia/Kolkata")).toBe("Today");

    // Session just after midnight Sep 3 in IST (Sep 2 18:45 UTC): must be Today in Gorakhpur
    expect(formatSessionDate("2026-09-02T18:45:00Z", mockNow, "Asia/Kolkata")).toBe("Today");

    // Past session 2 days ago: Sep 1 at 2:00 PM IST
    expect(formatSessionDate("2026-09-01T08:30:00Z", mockNow, "Asia/Kolkata")).toBe("Tue, Sep 1");
  });

  it("partitions history sessions into current week vs past weeks across Monday boundary", () => {
    // Reference now: Monday, Sep 7, 2026 at 10:00 AM IST
    const mondayMorning = new Date("2026-09-07T04:30:00Z");
    const weekStartMs = getWeekStartTimestamp(mondayMorning, "Asia/Kolkata");

    const sampleSessions: StudySession[] = [
      // Past Sunday (Sep 6, 2026 at 8:00 PM IST = 14:30 UTC): Before Monday weekStartMs
      {
        id: "sess-past-sunday",
        user_id: "u1",
        start_time: "2026-09-06T14:30:00Z",
        end_time: "2026-09-06T15:30:00Z",
        duration_minutes: 60,
        completed_tasks: [],
      },
      // Past Friday (Sep 4, 2026 at 5:00 PM IST = 11:30 UTC): Before Monday weekStartMs
      {
        id: "sess-past-friday",
        user_id: "u1",
        start_time: "2026-09-04T11:30:00Z",
        end_time: "2026-09-04T12:30:00Z",
        duration_minutes: 60,
        completed_tasks: [],
      },
      // New Monday (Sep 7, 2026 at 8:00 AM IST = 02:30 UTC): At/After Monday weekStartMs
      {
        id: "sess-new-monday",
        user_id: "u1",
        start_time: "2026-09-07T02:30:00Z",
        end_time: "2026-09-07T03:30:00Z",
        duration_minutes: 60,
        completed_tasks: [],
      },
    ];

    const currentWeekSessions: StudySession[] = [];
    const pastWeekSessions: StudySession[] = [];

    for (const s of sampleSessions) {
      const isCurrentWeek = new Date(s.start_time).getTime() >= weekStartMs;
      if (isCurrentWeek) {
        currentWeekSessions.push(s);
      } else {
        pastWeekSessions.push(s);
      }
    }

    // Total 3-month sessions must remain 3 in the header
    expect(sampleSessions.length).toBe(3);

    // Current week occupying the screen should have only the 1 Monday session
    expect(currentWeekSessions.length).toBe(1);
    expect(currentWeekSessions[0].id).toBe("sess-new-monday");

    // Past weeks should have the 2 older sessions ready to be collapsed
    expect(pastWeekSessions.length).toBe(2);
    expect(pastWeekSessions.map((s) => s.id)).toEqual(["sess-past-sunday", "sess-past-friday"]);
  });
});
