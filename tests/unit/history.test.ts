import { describe, it, expect } from "vitest";
import { validateGoalTasks } from "@/lib/validation/schemas";
import { formatMinutesToHours } from "@/lib/time/format";
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
        focus_tag: "Math",
        completed_tasks: [{ id: "t1", task: "Calculus" }],
      },
      {
        id: "s2",
        user_id: "u1",
        start_time: "2026-09-01T14:00:00Z",
        end_time: "2026-09-01T15:00:00Z",
        duration_minutes: 60,
        focus_tag: "Physics",
        completed_tasks: [],
      },
    ];

    const totalMinutes = sampleHistory.reduce((acc, s) => acc + s.duration_minutes, 0);
    expect(totalMinutes).toBe(150);
    expect(formatMinutesToHours(totalMinutes)).toBe("2.5h");
  });
});
