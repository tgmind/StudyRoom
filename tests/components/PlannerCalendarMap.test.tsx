import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlannerCalendarMap } from "@/components/streak/PlannerCalendarMap";
import { ExamPlanWithSlots } from "@/lib/supabase/types";

describe("PlannerCalendarMap Component", () => {
  it("renders empty state with link to planner when no plans are enabled for streaks", () => {
    render(<PlannerCalendarMap plans={[]} />);

    expect(
      screen.getByText(/No exam plans enabled for Streaks/i)
    ).toBeInTheDocument();
    const plannerLink = screen.getByRole("link", { name: /Open Study Planner/i });
    expect(plannerLink).toBeInTheDocument();
    expect(plannerLink).toHaveAttribute("href", "/planner");
  });

  it("renders empty state when plans exist but show_in_streaks is false for all of them", () => {
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "Hidden Exam",
        exam_date: "2027-07-10",
        show_in_streaks: false,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [],
      },
    ];

    render(<PlannerCalendarMap plans={plans} />);

    expect(
      screen.getByText(/No exam plans enabled for Streaks/i)
    ).toBeInTheDocument();
  });

  it("renders calendar map for enabled exam plan with slots, legend, and exam day marker", () => {
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "SSC CGL",
        exam_date: "2026-10-25",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "slot-1",
            plan_id: "plan-1",
            user_id: "user-1",
            title: "Syllabus Covering",
            start_date: "2026-10-10",
            end_date: "2026-10-18",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
          {
            id: "slot-2",
            plan_id: "plan-1",
            user_id: "user-1",
            title: "Mock Tests",
            start_date: "2026-10-20",
            end_date: "2026-10-24",
            category: "mock_tests",
            color: "#f97316",
            sort_order: 1,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ];

    render(<PlannerCalendarMap plans={plans} />);

    // Header & Plan Details
    expect(
      screen.getByText(/Exam Preparation Calendar/i)
    ).toBeInTheDocument();
    expect(screen.getByText("SSC CGL")).toBeInTheDocument();

    // Legend displays complete slot titles without cell truncation
    expect(screen.getByText("Syllabus Covering")).toBeInTheDocument();
    expect(screen.getByText("Mock Tests")).toBeInTheDocument();
    expect(screen.getByText("Exam Day")).toBeInTheDocument();

    // Inspect date: click on the exam day button (day 25)
    const examDayBtn = screen.getByRole("button", { name: /25/i });
    expect(examDayBtn).toBeInTheDocument();
    fireEvent.click(examDayBtn);

    // Detail inspector displays target exam day
    expect(screen.getByText(/Target Examination Day/i)).toBeInTheDocument();
  });

  it("renders exam chips when multiple plans are visible and allows switching between them", () => {
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "Plan A",
        exam_date: "2026-11-10",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s1",
            plan_id: "plan-1",
            user_id: "user-1",
            title: "Slot A1",
            start_date: "2026-11-01",
            end_date: "2026-11-05",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      {
        id: "plan-2",
        user_id: "user-1",
        exam_name: "Plan B",
        exam_date: "2026-12-15",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 1,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s2",
            plan_id: "plan-2",
            user_id: "user-1",
            title: "Slot B1",
            start_date: "2026-12-01",
            end_date: "2026-12-10",
            category: "revision",
            color: "#a855f7",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ];

    render(<PlannerCalendarMap plans={plans} />);

    expect(screen.getByRole("button", { name: /Plan A/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plan B/i })).toBeInTheDocument();

    // Click on Plan B
    fireEvent.click(screen.getByRole("button", { name: /Plan B/i }));

    // Legend updates to Plan B's slot
    expect(screen.getByText("Slot B1")).toBeInTheDocument();
  });

  it("renders legend with Streak (30m+) and Streak Missed markers, and handles unscheduled past days", () => {
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "UPSC 2027",
        exam_date: "2027-05-23",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [],
      },
    ];

    render(<PlannerCalendarMap plans={plans} />);

    // Legend displays Streak and Streak Missed markers
    expect(screen.getByText("Streak (30m+)")).toBeInTheDocument();
    expect(screen.getByText("Streak Missed")).toBeInTheDocument();

    // Past day (e.g. day 1 of the current month) can be inspected
    const day1Btns = screen.getAllByRole("button", { name: /^1\b/ });
    const day1Btn = day1Btns[0];
    expect(day1Btn).toBeInTheDocument();
    expect(day1Btn).toHaveAttribute("aria-label", expect.stringContaining("Streak Missed"));
    fireEvent.click(day1Btn);

    // Inspector indicates Streak Missed
    expect(screen.getByText(/Streak Missed \(0m \/ 30m\)/i)).toBeInTheDocument();
  });

  it("renders translucent green tick for streak-qualified days and displays Streak Qualified in inspector", () => {
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "UPSC 2027",
        exam_date: "2027-05-23",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s1",
            plan_id: "plan-1",
            user_id: "user-1",
            title: "Phase 1",
            start_date: "2026-10-01",
            end_date: "2026-10-15",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ];

    const dailySummaries = [
      { dateISO: "2026-10-02", activeStudyMinutes: 45 },
    ];

    render(<PlannerCalendarMap plans={plans} dailySummaries={dailySummaries} />);

    // Inspect the qualified day (Oct 2)
    const day2Btns = screen.getAllByRole("button", { name: /^2\b/ });
    const day2Btn = day2Btns[0];
    expect(day2Btn).toBeInTheDocument();
    // The accessible label includes "Streak Qualified"
    expect(day2Btn).toHaveAttribute("aria-label", expect.stringContaining("Streak Qualified"));

    fireEvent.click(day2Btn);

    // Inspector shows Streak Qualified badge with active minutes
    expect(screen.getByText(/Streak Qualified \(45m\)/i)).toBeInTheDocument();
  });

  it("renders red cross for missed streak days in the past and displays Streak Missed in inspector", () => {
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "UPSC 2027",
        exam_date: "2027-05-23",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s1",
            plan_id: "plan-1",
            user_id: "user-1",
            title: "Phase 1",
            start_date: "2026-10-01",
            end_date: "2026-10-05",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ];

    // Day 3 was scheduled in the past but user had 0 study minutes
    const dailySummaries = [
      { dateISO: "2026-10-03", activeStudyMinutes: 0 },
    ];

    render(<PlannerCalendarMap plans={plans} dailySummaries={dailySummaries} />);

    const day3Btns = screen.getAllByRole("button", { name: /^3\b/ });
    const day3Btn = day3Btns[0];
    expect(day3Btn).toBeInTheDocument();
    expect(day3Btn).toHaveAttribute("aria-label", expect.stringContaining("Streak Missed"));

    fireEvent.click(day3Btn);

    // Inspector displays Streak Missed badge
    expect(screen.getByText(/Streak Missed \(0m \/ 30m\)/i)).toBeInTheDocument();
  });

  it("renders red cross for unscheduled past days without study (e.g. Sat 3 Oct) and marks Streak Missed", () => {
    // Phase 1 starts on Oct 5; Oct 3 has no slots and no study minutes
    const plans: ExamPlanWithSlots[] = [
      {
        id: "plan-1",
        user_id: "user-1",
        exam_name: "UPSC 2027",
        exam_date: "2027-05-23",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s1",
            plan_id: "plan-1",
            user_id: "user-1",
            title: "Phase 1",
            start_date: "2026-10-05",
            end_date: "2026-10-15",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
    ];

    render(<PlannerCalendarMap plans={plans} dailySummaries={[]} />);

    // Day 3 (e.g. Sat 3 Oct) is in the past, unslotted, and without 30m study
    const day3Btns = screen.getAllByRole("button", { name: /^3\b/ });
    const day3Btn = day3Btns[0];
    expect(day3Btn).toBeInTheDocument();
    expect(day3Btn).toHaveAttribute("aria-label", expect.stringContaining("Streak Missed"));

    fireEvent.click(day3Btn);
    expect(screen.getByText(/Streak Missed \(0m \/ 30m\)/i)).toBeInTheDocument();
    expect(screen.getByText(/No preparation slot scheduled for this date/i)).toBeInTheDocument();
  });
});
