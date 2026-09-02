import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BreakGoalUpdateModal } from "@/components/session/BreakGoalUpdateModal";
import { DailyGoal } from "@/lib/supabase/types";

describe("BreakGoalUpdateModal Component", () => {
  const mockGoal: DailyGoal = {
    id: "goal-1",
    user_id: "user-1",
    tasks: [
      { id: "task-1", task: "Complete Chapter 4 Physics", completed: false },
      { id: "task-2", task: "Solve 10 Calculus Problems", completed: false },
      { id: "task-3", task: "Read Organic Chemistry", completed: true },
    ],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    archived_at: null,
    is_locked: false,
  };

  it("renders the break goal update modal with task checklist and saved study time", () => {
    render(
      <BreakGoalUpdateModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmSaveGoals={vi.fn()}
        activeGoal={mockGoal}
        savedStudySeconds={3600} // 1 hour
      />
    );

    expect(screen.getByText("Update Your Goals")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Did you accomplish any goals during your study session before the break? Checked tasks will be recorded in your rolling 24-hour goal set."
      )
    ).toBeInTheDocument();

    expect(screen.getByText("Complete Chapter 4 Physics")).toBeInTheDocument();
    expect(screen.getByText("Solve 10 Calculus Problems")).toBeInTheDocument();
    expect(screen.getByText("Read Organic Chemistry")).toBeInTheDocument();
    expect(screen.getAllByText("Done").length).toBeGreaterThanOrEqual(1);
  });

  it("toggles tasks and calls onConfirmSaveGoals with checked task IDs", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <BreakGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={1800}
      />
    );

    // Click on the first task to check it
    fireEvent.click(screen.getByText("Complete Chapter 4 Physics"));

    // Save Goals button should now show count of 1
    const saveButton = screen.getByText("Save Goals (1)");
    expect(saveButton).toBeInTheDocument();

    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(["task-1"]);
      expect(handleClose).toHaveBeenCalled();
    });
  });

  it("calls onConfirmSaveGoals with empty array when skipping goals", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <BreakGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={1800}
      />
    );

    fireEvent.click(screen.getByText("Skip Goals"));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith([]);
      expect(handleClose).toHaveBeenCalled();
    });
  });
});
