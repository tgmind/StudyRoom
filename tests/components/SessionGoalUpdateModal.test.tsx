import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionGoalUpdateModal } from "@/components/session/SessionGoalUpdateModal";
import { DailyGoal } from "@/lib/supabase/types";

describe("SessionGoalUpdateModal Component", () => {
  const mockGoal: DailyGoal = {
    id: "goal-1",
    user_id: "user-1",
    tasks: [
      { id: "t1", task: "Review Differential Equations", completed: false },
      { id: "t2", task: "Solve 10 Physics Problems", completed: true },
    ],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 72000000).toISOString(),
    is_locked: false,
    archived_at: null,
  };

  it("renders manual stop variant with study time and goal tasks", () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <SessionGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={5400}
        reason="manual_stop"
      />
    );

    expect(screen.getByText("Finish Your Study Session")).toBeInTheDocument();
    expect(screen.getByText("Review Differential Equations")).toBeInTheDocument();
    expect(screen.getByText("Solve 10 Physics Problems")).toBeInTheDocument();
  });

  it("renders 3-hour limit variant", () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <SessionGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={10800}
        reason="session_limit"
      />
    );

    expect(screen.getByText("3-Hour Session Completed")).toBeInTheDocument();
    expect(screen.getByText(/study sessions are capped at 3 hours/i)).toBeInTheDocument();
  });

  it("renders 1-hour break expired variant", () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn();

    render(
      <SessionGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={3600}
        reason="break_expired"
      />
    );

    expect(screen.getByText("1-Hour Break Limit Exceeded")).toBeInTheDocument();
    expect(screen.getByText(/Session ended after 1-hour break/i)).toBeInTheDocument();
  });

  it("allows toggling task completion and clicking Save Goals", async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <SessionGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={3600}
        reason="manual_stop"
      />
    );

    // Click on the uncompleted task checkbox
    const taskItem = screen.getByText("Review Differential Equations");
    fireEvent.click(taskItem);

    // Click Save Goals
    const saveBtn = screen.getByRole("button", { name: /Save Goals/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(["t1"]);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  it("calls onClose when End Without Goals is clicked", async () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <SessionGoalUpdateModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSaveGoals={handleSave}
        activeGoal={mockGoal}
        savedStudySeconds={3600}
        reason="manual_stop"
      />
    );

    const skipBtn = screen.getByText("End Without Goals");
    fireEvent.click(skipBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith([]);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });
});
