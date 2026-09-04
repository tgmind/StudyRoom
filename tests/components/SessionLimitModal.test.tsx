import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SessionLimitModal } from "@/components/session/SessionLimitModal";
import { DailyGoal } from "@/lib/supabase/types";

describe("SessionLimitModal Component (3-Hour Session Limit)", () => {
  const mockGoal: DailyGoal = {
    id: "goal-1",
    user_id: "user-123",
    is_locked: false,
    archived_at: null,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    tasks: [
      { id: "task-1", task: "Complete Chapter 5 Exercises", completed: false },
      { id: "task-2", task: "Review Quantum Mechanics Notes", completed: false },
      { id: "task-3", task: "Earlier Completed Assignment", completed: true },
    ],
  };

  it("renders 3-hour completion title, subtitle, and formatted duration 03:00:00", () => {
    render(
      <SessionLimitModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmSaveGoals={vi.fn()}
        activeGoal={mockGoal}
        savedStudySeconds={10800}
      />
    );

    expect(screen.getByText("3-Hour Session Completed")).toBeDefined();
    expect(screen.getByText("Study session reached the 3-hour maximum limit")).toBeDefined();
    expect(screen.getByText("03:00:00")).toBeDefined();
    expect(screen.getByText(/study sessions are capped at 3 hours/i)).toBeDefined();
  });

  it("allows selecting goals and submitting them via onConfirmSaveGoals", async () => {
    const onConfirmSaveGoalsMock = vi.fn().mockResolvedValue(undefined);
    const onCloseMock = vi.fn();

    render(
      <SessionLimitModal
        isOpen={true}
        onClose={onCloseMock}
        onConfirmSaveGoals={onConfirmSaveGoalsMock}
        activeGoal={mockGoal}
        savedStudySeconds={10800}
      />
    );

    // Verify tasks are shown
    expect(screen.getByText("Complete Chapter 5 Exercises")).toBeDefined();
    expect(screen.getByText("Review Quantum Mechanics Notes")).toBeDefined();

    // Click on the first incomplete task
    const task1Button = screen.getByText("Complete Chapter 5 Exercises").closest("button");
    expect(task1Button).not.toBeNull();
    act(() => {
      fireEvent.click(task1Button!);
    });

    // The primary action button now says "Save Completed Goals"
    const saveButton = screen.getByRole("button", { name: /Save Completed Goals/i });
    expect(saveButton).toBeDefined();

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(onConfirmSaveGoalsMock).toHaveBeenCalledWith(["task-1"]);
  });

  it("handles skipping goals properly", async () => {
    const onConfirmSaveGoalsMock = vi.fn().mockResolvedValue(undefined);
    const onCloseMock = vi.fn();

    render(
      <SessionLimitModal
        isOpen={true}
        onClose={onCloseMock}
        onConfirmSaveGoals={onConfirmSaveGoalsMock}
        activeGoal={mockGoal}
        savedStudySeconds={10800}
      />
    );

    const skipButton = screen.getByRole("button", { name: /Skip Goals/i });
    await act(async () => {
      fireEvent.click(skipButton);
    });

    expect(onConfirmSaveGoalsMock).toHaveBeenCalledWith([]);
  });
});
