import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StopHookModal } from "@/components/session/StopHookModal";
import { BreakGoalUpdateModal } from "@/components/session/BreakGoalUpdateModal";
import { SessionLimitModal } from "@/components/session/SessionLimitModal";
import { DailyGoal } from "@/lib/supabase/types";

describe("Mid-Session Goal Expiration & Graceful Completion Integration Audit", () => {
  const now = Date.now();
  const midSessionExpiredGoal: DailyGoal = {
    id: "goal-mid-expired",
    user_id: "u123",
    tasks: [
      { id: "task-1", task: "Organic Chemistry Reactions", completed: false },
      { id: "task-2", task: "Biochemistry Flashcards", completed: false },
      { id: "task-3", task: "Already Finished Chapter", completed: true },
    ],
    created_at: new Date(now - 25 * 3600 * 1000).toISOString(),
    expires_at: new Date(now - 30 * 60 * 1000).toISOString(), // Expired 30m ago mid-session
    is_locked: true,
    archived_at: null,
  };

  describe("StopHookModal Audit", () => {
    it("displays 'Window ended mid-session' badge and allows checking off tasks", async () => {
      const onConfirmFinish = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <StopHookModal
          isOpen={true}
          onClose={onClose}
          onConfirmFinish={onConfirmFinish}
          activeGoal={midSessionExpiredGoal}
          elapsedSeconds={5400} // 1h 30m
        />
      );

      // Verify the contextual reassurance badge
      expect(screen.getByText(/Window ended mid-session/i)).toBeInTheDocument();

      // Verify tasks are visible
      expect(screen.getByText("Organic Chemistry Reactions")).toBeInTheDocument();
      expect(screen.getByText("Biochemistry Flashcards")).toBeInTheDocument();
      expect(screen.getByText("Already Finished Chapter")).toBeInTheDocument();

      // Check off Task 1
      const task1Element = screen.getByText("Organic Chemistry Reactions");
      await act(async () => {
        fireEvent.click(task1Element);
      });

      // Save Goals & Finish button should appear with count 1
      const saveBtn = screen.getByRole("button", { name: /Save Goals & Finish \(1\)/i });
      expect(saveBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(onConfirmFinish).toHaveBeenCalledWith(["task-1"]);
      expect(onClose).toHaveBeenCalled();
    });

    it("allows ending session without goals even if goal expired mid-session", async () => {
      const onConfirmFinish = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <StopHookModal
          isOpen={true}
          onClose={onClose}
          onConfirmFinish={onConfirmFinish}
          activeGoal={midSessionExpiredGoal}
          elapsedSeconds={5400}
        />
      );

      const endWithoutGoalsBtn = screen.getByRole("button", { name: /End Without Goals/i });
      await act(async () => {
        fireEvent.click(endWithoutGoalsBtn);
      });

      expect(onConfirmFinish).toHaveBeenCalledWith([]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("BreakGoalUpdateModal Audit", () => {
    it("displays 'Window ended mid-session' badge and submits checked goals after break", async () => {
      const onConfirmSaveGoals = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <BreakGoalUpdateModal
          isOpen={true}
          onClose={onClose}
          onConfirmSaveGoals={onConfirmSaveGoals}
          activeGoal={midSessionExpiredGoal}
          savedStudySeconds={7200}
        />
      );

      expect(screen.getByText(/Window ended mid-session/i)).toBeInTheDocument();
      expect(screen.getByText("Organic Chemistry Reactions")).toBeInTheDocument();

      // Toggle Task 2
      const task2Element = screen.getByText("Biochemistry Flashcards");
      await act(async () => {
        fireEvent.click(task2Element);
      });

      const saveGoalsBtn = screen.getByRole("button", { name: /Save Goals \(1\)/i });
      await act(async () => {
        fireEvent.click(saveGoalsBtn);
      });

      expect(onConfirmSaveGoals).toHaveBeenCalledWith(["task-2"]);
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("SessionLimitModal Audit", () => {
    it("displays 'Window ended mid-session' badge and handles 3-hour limit save cleanly", async () => {
      const onConfirmSaveGoals = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <SessionLimitModal
          isOpen={true}
          onClose={onClose}
          onConfirmSaveGoals={onConfirmSaveGoals}
          activeGoal={midSessionExpiredGoal}
          savedStudySeconds={10800}
        />
      );

      expect(screen.getByText(/Window ended mid-session/i)).toBeInTheDocument();

      // Toggle Task 1
      const task1 = screen.getByText("Organic Chemistry Reactions");
      await act(async () => {
        fireEvent.click(task1);
      });

      const saveBtn = screen.getByRole("button", { name: /Save Completed Goals/i });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(onConfirmSaveGoals).toHaveBeenCalledWith(["task-1"]);
      expect(onClose).toHaveBeenCalled();
    });
  });
});
