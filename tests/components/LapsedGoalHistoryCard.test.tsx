import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { LapsedGoalHistoryCard } from "@/components/goals/LapsedGoalHistoryCard";
import { LapsedGoalWindow } from "@/hooks/useStudyHistory";

describe("LapsedGoalHistoryCard Component", () => {
  const mockLapsedGoal: LapsedGoalWindow = {
    id: "lapsed-1",
    created_at: "2026-09-14T03:00:00Z", // 8:30 AM IST
    expires_at: "2026-09-14T04:09:00Z", // 9:39 AM IST
    totalTasksCount: 3,
    completedTasksCount: 1,
    lapsedTasks: [
      { id: "task-1", task: "Table", completed: false },
      { id: "task-2", task: "English", completed: false },
    ],
  };

  it("renders Lapsed Goals badge and task count correctly", () => {
    render(<LapsedGoalHistoryCard lapsedGoal={mockLapsedGoal} />);

    expect(screen.getByText("Lapsed Goals")).toBeDefined();
    expect(screen.getByText("2 tasks unfinished")).toBeDefined();
  });

  it("renders ending date and time without any set time", () => {
    render(<LapsedGoalHistoryCard lapsedGoal={mockLapsedGoal} />);

    // Should include Ended with date and time
    expect(screen.getByText(/Ended Sep 14, 9:39 AM/i)).toBeDefined();

    // Must NOT contain "Set" time
    expect(screen.queryByText(/Set 8:30/i)).toBeNull();
    expect(screen.queryByText(/Set 9:39/i)).toBeNull();
  });

  it("renders lapsed task chips with strikethrough decoration", () => {
    render(<LapsedGoalHistoryCard lapsedGoal={mockLapsedGoal} />);

    expect(screen.getByText("Table")).toBeDefined();
    expect(screen.getByText("English")).toBeDefined();
    expect(screen.getByText("Lapsed:")).toBeDefined();
  });

  it("handles single task singular label correctly", () => {
    const singleTaskGoal: LapsedGoalWindow = {
      ...mockLapsedGoal,
      lapsedTasks: [{ id: "task-1", task: "Physics", completed: false }],
    };
    render(<LapsedGoalHistoryCard lapsedGoal={singleTaskGoal} />);

    expect(screen.getByText("1 task unfinished")).toBeDefined();
  });
});
