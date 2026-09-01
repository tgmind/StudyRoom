import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { StopHookModal } from "@/components/session/StopHookModal";
import { DailyGoal } from "@/lib/supabase/types";

describe("StopHookModal Component", () => {
  const dummyGoal: DailyGoal = {
    id: "g1",
    user_id: "u1",
    tasks: [
      { id: "t1", task: "Finish Chapter 1", completed: false },
      { id: "t2", task: "Solve 20 PYQs", completed: true },
    ],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400000).toISOString(),
    is_locked: true,
    archived_at: null,
  };

  it("renders tasks and completion progress", () => {
    render(
      <StopHookModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmFinish={vi.fn()}
        activeGoal={dummyGoal}
        elapsedSeconds={3600}
      />
    );

    expect(screen.getByText(/Finish Your Study Session/i)).toBeInTheDocument();
    expect(screen.getByText("Finish Chapter 1")).toBeInTheDocument();
    expect(screen.getByText("Solve 20 PYQs")).toBeInTheDocument();
  });

  it("triggers onConfirmFinish with updated task selections", () => {
    const onFinishMock = vi.fn();
    render(
      <StopHookModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmFinish={onFinishMock}
        activeGoal={dummyGoal}
        elapsedSeconds={3600}
      />
    );

    // Toggle Task 1 ("Finish Chapter 1")
    const task1Element = screen.getByText("Finish Chapter 1");
    fireEvent.click(task1Element);

    const finishButton = screen.getByText("Finish Session");
    fireEvent.click(finishButton);

    expect(onFinishMock).toHaveBeenCalledWith(["t1"]);
  });
});
