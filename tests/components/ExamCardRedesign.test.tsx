import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExamCard } from "@/components/planner/ExamCard";
import { ExamPlanWithSlots } from "@/lib/supabase/types";

describe("ExamCard Redesign", () => {
  const mockPlan: ExamPlanWithSlots = {
    id: "plan-1",
    user_id: "user-1",
    exam_name: "UPSC Civil Services Prelims",
    exam_date: "2027-05-23",
    description: "General Studies Paper 1 and CSAT target",
    show_in_streaks: true,
    is_locked: false,
    sort_order: 0,
    created_at: "2026-10-09T00:00:00Z",
    updated_at: "2026-10-09T00:00:00Z",
    slots: [
      {
        id: "slot-1",
        plan_id: "plan-1",
        user_id: "user-1",
        title: "Polity & Governance",
        start_date: "2027-01-01",
        end_date: "2027-01-31",
        category: "syllabus",
        color: "#3b82f6",
        sort_order: 0,
        created_at: "2026-10-09T00:00:00Z",
        updated_at: "2026-10-09T00:00:00Z",
      },
    ],
  };

  const defaultProps = {
    plan: mockPlan,
    index: 0,
    totalPlans: 2,
    onEditExam: vi.fn(),
    onDeleteExam: vi.fn(),
    onToggleLock: vi.fn(),
    onToggleStreaksVisibility: vi.fn(),
    onAddSlot: vi.fn(),
    onEditSlot: vi.fn(),
    onDeleteSlot: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
  };

  it("renders collapsed card with academic icon, title, priority #1, and countdown badge", () => {
    render(<ExamCard {...defaultProps} />);

    expect(screen.getByText("UPSC Civil Services Prelims")).toBeInTheDocument();
    expect(screen.getByText("Priority #1")).toBeInTheDocument();
    expect(screen.getAllByText(/remaining|today|completed/i).length).toBeGreaterThan(0);
    // Indian date format in metadata row
    expect(screen.getByText(/23\/05\/2027/)).toBeInTheDocument();
    expect(screen.getByText("1 slot")).toBeInTheDocument();
    expect(screen.getByText("In Streaks")).toBeInTheDocument();
  });

  it("renders planned slots progress bar and scheduled days fraction", () => {
    render(<ExamCard {...defaultProps} />);

    expect(screen.getByText("Planned Slots")).toBeInTheDocument();
    expect(screen.getByText(/\d+ of \d+ days/)).toBeInTheDocument();
  });

  it("expands to reveal workspace sections upon clicking expand toggle", () => {
    render(<ExamCard {...defaultProps} />);

    const expandBtn = screen.getByRole("button", { name: /Expand plan/i });
    fireEvent.click(expandBtn);

    expect(screen.getByText("Exam Details")).toBeInTheDocument();
    expect(screen.getByText("General Studies Paper 1 and CSAT target")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Preparation Slots/i })).toBeInTheDocument();
    expect(screen.getByText("Polity & Governance")).toBeInTheDocument();
    expect(screen.getByText(/Show Calendar in Streaks/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Lock Plan/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delete Plan/i })).toBeInTheDocument();
  });

  it("triggers onToggleLock and onToggleStreaksVisibility callbacks", () => {
    render(<ExamCard {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Expand plan/i }));

    const lockBtn = screen.getByRole("button", { name: /Lock Plan/i });
    fireEvent.click(lockBtn);
    expect(defaultProps.onToggleLock).toHaveBeenCalledWith(mockPlan);

    const switchBtn = screen.getByRole("switch");
    fireEvent.click(switchBtn);
    expect(defaultProps.onToggleStreaksVisibility).toHaveBeenCalledWith(mockPlan);
  });

  it("triggers onDeleteExam when Delete Plan button is clicked in expanded state", () => {
    render(<ExamCard {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Expand plan/i }));

    const deleteBtn = screen.getByRole("button", { name: /Delete Plan/i });
    fireEvent.click(deleteBtn);
    expect(defaultProps.onDeleteExam).toHaveBeenCalledWith(mockPlan);
  });

  it("triggers onMoveDown when priority move down button is clicked", () => {
    render(<ExamCard {...defaultProps} />);

    const moveDownBtn = screen.getByRole("button", { name: /Move Down/i });
    fireEvent.click(moveDownBtn);

    expect(defaultProps.onMoveDown).toHaveBeenCalled();
  });
});
