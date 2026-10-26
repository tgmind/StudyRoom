import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { useState, useEffect } from "react";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { AddGoalModal } from "@/components/goals/AddGoalModal";
import { Modal } from "@/components/ui/Modal";

describe("AddGoalModal & Modal Comprehensive Focus, Reconciliation & Mobile Interaction Suite", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("A. Input Focus & Component Lifecycle", () => {
    it("renders the expected initial input and opens the modal properly", () => {
      const handleClose = vi.fn();
      const handleConfirm = vi.fn();

      render(
        <AddGoalModal
          isOpen={true}
          onClose={handleClose}
          onConfirmAdd={handleConfirm}
        />
      );

      expect(screen.getByRole("heading", { name: /Add Goals to 20-Hour Window/i })).toBeDefined();
      expect(screen.getByText(/Append additional tasks to your current active 20-hour commitment window/i)).toBeDefined();

      const inputs = screen.getAllByPlaceholderText(/New Task/i);
      expect(inputs.length).toBe(1);
    });

    it("preserves input DOM element identity across typing and parent ticking re-renders", () => {
      function SimulatedActiveGoalsPage() {
        const [seconds, setSeconds] = useState(72000);
        const [isOpen, setIsOpen] = useState(true);

        useEffect(() => {
          const timer = setInterval(() => {
            setSeconds((s) => s - 1);
          }, 1000);
          return () => clearInterval(timer);
        }, []);

        return (
          <div>
            <span>Countdown: {seconds}</span>
            <AddGoalModal
              isOpen={isOpen}
              onClose={() => setIsOpen(false)}
              onConfirmAdd={async () => {}}
            />
          </div>
        );
      }

      render(<SimulatedActiveGoalsPage />);

      // Let initial focus timer advance
      act(() => {
        vi.advanceTimersByTime(60);
      });

      const initialInput = screen.getByPlaceholderText(/New Task/i) as HTMLInputElement;

      // Type into the input
      fireEvent.change(initialInput, { target: { value: "Review 15 Physics flashcards" } });
      expect(initialInput.value).toBe("Review 15 Physics flashcards");

      // Advance multiple seconds of active-window ticking
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Query the input again
      const currentInput = screen.getByPlaceholderText(/New Task/i) as HTMLInputElement;

      // Strict DOM reference equality: DOM element must NOT be remounted or replaced!
      expect(currentInput).toBe(initialInput);
      expect(currentInput.value).toBe("Review 15 Physics flashcards");
    });

    it("retains input focus through ordinary parent re-renders and does not steal focus", () => {
      function ParentHarness() {
        const [tick, setTick] = useState(0);

        return (
          <div>
            <button data-testid="re-render-trigger" onClick={() => setTick((t) => t + 1)}>
              Tick {tick}
            </button>
            <AddGoalModal
              isOpen={true}
              onClose={() => {}}
              onConfirmAdd={async () => {}}
            />
          </div>
        );
      }

      render(<ParentHarness />);

      act(() => {
        vi.advanceTimersByTime(60);
      });

      const input = screen.getByPlaceholderText(/New Task/i) as HTMLInputElement;
      input.focus();
      expect(document.activeElement).toBe(input);

      // Track blur events
      const blurSpy = vi.fn();
      input.addEventListener("blur", blurSpy);

      // Trigger multiple parent re-renders
      const trigger = screen.getByTestId("re-render-trigger");
      fireEvent.click(trigger);
      fireEvent.click(trigger);

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(document.activeElement).toBe(input);
      expect(blurSpy).not.toHaveBeenCalled();
    });

    it("viewport resize event does not remount the input or reset text", () => {
      render(
        <AddGoalModal
          isOpen={true}
          onClose={() => {}}
          onConfirmAdd={async () => {}}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      const input = screen.getByPlaceholderText(/New Task/i) as HTMLInputElement;
      fireEvent.change(input, { target: { value: "Solve 10 Calculus problems" } });

      // Simulate mobile keyboard opening triggering window resize
      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      const inputAfterResize = screen.getByPlaceholderText(/New Task/i) as HTMLInputElement;
      expect(inputAfterResize).toBe(input);
      expect(inputAfterResize.value).toBe("Solve 10 Calculus problems");
    });

    it("closing the modal intentionally still works via cancel button and X button", () => {
      const handleClose = vi.fn();

      const { rerender } = render(
        <AddGoalModal
          isOpen={true}
          onClose={handleClose}
          onConfirmAdd={async () => {}}
        />
      );

      // Cancel button
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);

      // Close X button
      const closeXBtn = screen.getByRole("button", { name: "Close dialog" });
      fireEvent.click(closeXBtn);
      expect(handleClose).toHaveBeenCalledTimes(2);

      // Rerender as closed
      rerender(
        <AddGoalModal
          isOpen={false}
          onClose={handleClose}
          onConfirmAdd={async () => {}}
        />
      );

      expect(screen.queryByRole("heading", { name: /Add Goals to 20-Hour Window/i })).toBeNull();
    });
  });

  describe("B. Multiple-Task Behavior & Dynamic List Reconciliation", () => {
    it("allows adding a second task while keeping the first task intact", () => {
      render(
        <AddGoalModal
          isOpen={true}
          onClose={() => {}}
          onConfirmAdd={async () => {}}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      const initialInputs = screen.getAllByPlaceholderText(/New Task/i) as HTMLInputElement[];
      const firstInput = initialInputs[0];

      // Enter first goal
      fireEvent.change(firstInput, { target: { value: "Biology: Chapter 4 notes" } });
      expect(firstInput.value).toBe("Biology: Chapter 4 notes");

      // Click "Add Another Task"
      const addBtn = screen.getByRole("button", { name: /Add Another Task/i });
      fireEvent.click(addBtn);

      const updatedInputs = screen.getAllByPlaceholderText(/New Task/i) as HTMLInputElement[];
      expect(updatedInputs.length).toBe(2);

      // First input is the same DOM element and retained its value
      expect(updatedInputs[0]).toBe(firstInput);
      expect(updatedInputs[0].value).toBe("Biology: Chapter 4 notes");

      // Enter second goal
      const secondInput = updatedInputs[1];
      fireEvent.change(secondInput, { target: { value: "Chemistry: 30 stoichiometry MCQs" } });
      expect(secondInput.value).toBe("Chemistry: 30 stoichiometry MCQs");

      // First goal is still intact
      expect(updatedInputs[0].value).toBe("Biology: Chapter 4 notes");
    });

    it("automatically transfers focus to the newly added task input", () => {
      render(
        <AddGoalModal
          isOpen={true}
          onClose={() => {}}
          onConfirmAdd={async () => {}}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      const addBtn = screen.getByRole("button", { name: /Add Another Task/i });
      fireEvent.click(addBtn);

      const inputs = screen.getAllByPlaceholderText(/New Task/i) as HTMLInputElement[];
      expect(inputs.length).toBe(2);

      // Focus should be automatically set to the new input (index 1)
      expect(document.activeElement).toBe(inputs[1]);
    });

    it("respects the maximum limit of 5 tasks in AddGoalModal", () => {
      render(
        <AddGoalModal
          isOpen={true}
          onClose={() => {}}
          onConfirmAdd={async () => {}}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      // Add up to 5 tasks
      for (let i = 1; i < 5; i++) {
        const addBtn = screen.getByRole("button", { name: /Add Another Task/i });
        fireEvent.click(addBtn);
      }

      const inputs = screen.getAllByPlaceholderText(/New Task/i);
      expect(inputs.length).toBe(5);

      // "Add Another Task" button should disappear after reaching 5 tasks
      expect(screen.queryByRole("button", { name: /Add Another Task/i })).toBeNull();
    });
  });

  describe("C. Validation & Active Window Integrity Submission", () => {
    it("validates empty tasks and displays validation error without calling onConfirmAdd", async () => {
      const handleConfirm = vi.fn();

      render(
        <AddGoalModal
          isOpen={true}
          onClose={() => {}}
          onConfirmAdd={handleConfirm}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      // Submit with empty task
      const submitBtn = screen.getByRole("button", { name: /Append to Active Window/i });
      fireEvent.click(submitBtn);

      expect(handleConfirm).not.toHaveBeenCalled();
      expect(screen.getByText(/At least one non-empty task is required/i)).toBeDefined();
    });

    it("submits valid cleaned tasks and resets state upon successful submission", async () => {
      const handleClose = vi.fn();
      const handleConfirm = vi.fn().mockResolvedValue(undefined);

      render(
        <AddGoalModal
          isOpen={true}
          onClose={handleClose}
          onConfirmAdd={handleConfirm}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      const inputs = screen.getAllByPlaceholderText(/New Task/i) as HTMLInputElement[];
      fireEvent.change(inputs[0], { target: { value: "Organic Chemistry 25 questions" } });

      const submitBtn = screen.getByRole("button", { name: /Append to Active Window/i });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(handleConfirm).toHaveBeenCalledWith(["Organic Chemistry 25 questions"]);
      expect(handleClose).toHaveBeenCalled();
    });

    it("displays error message if onConfirmAdd throws an error", async () => {
      const handleClose = vi.fn();
      const handleConfirm = vi.fn().mockRejectedValue(new Error("Active window expired"));

      render(
        <AddGoalModal
          isOpen={true}
          onClose={handleClose}
          onConfirmAdd={handleConfirm}
        />
      );

      act(() => {
        vi.advanceTimersByTime(60);
      });

      const inputs = screen.getAllByPlaceholderText(/New Task/i) as HTMLInputElement[];
      fireEvent.change(inputs[0], { target: { value: "Task that fails" } });

      const submitBtn = screen.getByRole("button", { name: /Append to Active Window/i });
      await act(async () => {
        fireEvent.click(submitBtn);
      });

      expect(handleConfirm).toHaveBeenCalled();
      expect(handleClose).not.toHaveBeenCalled();
      expect(screen.getByText("Active window expired")).toBeDefined();
    });
  });
});
