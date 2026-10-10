import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PlannerPage from "@/app/planner/page";
import * as useAuthModule from "@/hooks/useAuth";
import * as useExamPlansModule from "@/hooks/useExamPlans";
import { ExamPlanWithSlots } from "@/lib/supabase/types";

vi.mock("@/components/navigation/TopHeader", () => ({
  TopHeader: () => <header data-testid="top-header">Header</header>,
}));

vi.mock("@/components/navigation/BottomNav", () => ({
  BottomNav: () => <nav data-testid="bottom-nav">BottomNav</nav>,
}));

describe("PlannerPage Component", () => {
  const mockUser = { id: "user-123", email: "student@example.com" };
  const mockProfile = {
    id: "user-123",
    display_name: "Student",
    avatar_url: null,
    current_status: "offline" as const,
    current_focus: null,
    session_start_time: null,
    has_achiever_badge: false,
    created_at: "",
  };

  const mockPlans: ExamPlanWithSlots[] = [
    {
      id: "plan-1",
      user_id: "user-123",
      exam_name: "SSC CGL",
      exam_date: "2027-07-10",
      description: "Tier 1 Target",
      show_in_streaks: true,
      is_locked: false,
      sort_order: 0,
      created_at: "",
      updated_at: "",
      slots: [
        {
          id: "slot-1",
          plan_id: "plan-1",
          user_id: "user-123",
          title: "Syllabus Covering",
          start_date: "2027-02-01",
          end_date: "2027-02-28",
          category: "syllabus",
          color: "#3b82f6",
          sort_order: 0,
          created_at: "",
          updated_at: "",
        },
      ],
    },
  ];

  const mockCreateExamPlan = vi.fn().mockResolvedValue(undefined);
  const mockUpdateExamPlan = vi.fn().mockResolvedValue(undefined);
  const mockDeleteExamPlan = vi.fn().mockResolvedValue(undefined);
  const mockToggleLockPlan = vi.fn().mockResolvedValue(undefined);
  const mockToggleStreaksVisibility = vi.fn().mockResolvedValue(undefined);
  const mockReorderPlans = vi.fn().mockResolvedValue(undefined);
  const mockAddSlot = vi.fn().mockResolvedValue(undefined);
  const mockUpdateSlot = vi.fn().mockResolvedValue(undefined);
  const mockDeleteSlot = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(useAuthModule, "useAuth").mockReturnValue({
      user: mockUser as any,
      profile: mockProfile,
      loading: false,
      error: null,
      signOut: vi.fn().mockResolvedValue(undefined),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      updateProfileOptimistic: vi.fn(),
    });

    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: mockPlans,
      loading: false,
      actionLoading: false,
      error: null,
      insights: {
        totalPlans: 1,
        activeExamsCount: 1,
        nearestExam: {
          planId: "plan-1",
          examName: "SSC CGL",
          examDate: "2027-07-10",
          daysRemaining: 274,
        },
        totalScheduledDays: 28,
        configuredSlotsCount: 1,
        lockedPlansCount: 0,
        editablePlansCount: 1,
        streaksVisiblePlansCount: 1,
      },
      fetchPlans: vi.fn(),
      createExamPlan: mockCreateExamPlan,
      updateExamPlan: mockUpdateExamPlan,
      deleteExamPlan: mockDeleteExamPlan,
      toggleLockPlan: mockToggleLockPlan,
      toggleStreaksVisibility: mockToggleStreaksVisibility,
      reorderPlans: mockReorderPlans,
      addSlot: mockAddSlot,
      updateSlot: mockUpdateSlot,
      deleteSlot: mockDeleteSlot,
    });
  });

  it("renders page header, planning insights, and exam cards", () => {
    render(<PlannerPage />);

    expect(screen.getByText("Exam Study Planner")).toBeInTheDocument();
    expect(screen.getByText("1 Active Exam")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Days")).toBeInTheDocument();
    expect(screen.getAllByText("SSC CGL").length).toBeGreaterThan(0);
    expect(screen.getByText(/Planned Slots/i)).toBeInTheDocument();
  });

  it("renders empty state when user has no exam plans", () => {
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {
        totalPlans: 0,
        activeExamsCount: 0,
        nearestExam: null,
        totalScheduledDays: 0,
        configuredSlotsCount: 0,
        lockedPlansCount: 0,
        editablePlansCount: 0,
        streaksVisiblePlansCount: 0,
      },
      fetchPlans: vi.fn(),
      createExamPlan: mockCreateExamPlan,
      updateExamPlan: mockUpdateExamPlan,
      deleteExamPlan: mockDeleteExamPlan,
      toggleLockPlan: mockToggleLockPlan,
      toggleStreaksVisibility: mockToggleStreaksVisibility,
      reorderPlans: mockReorderPlans,
      addSlot: mockAddSlot,
      updateSlot: mockUpdateSlot,
      deleteSlot: mockDeleteSlot,
    });

    render(<PlannerPage />);

    expect(screen.getByText(/No Exam Plans Yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Create Your First Plan/i })).toBeInTheDocument();
  });

  it("opens create exam plan modal on button click", () => {
    render(<PlannerPage />);

    const createBtn = screen.getByRole("button", { name: /Create Exam Plan/i });
    fireEvent.click(createBtn);

    expect(screen.getByRole("heading", { name: /Create Exam Plan/i })).toBeInTheDocument();
  });

  it("expands an exam card and reveals slots, calendar toggle, and lock controls", () => {
    render(<PlannerPage />);

    const expandBtn = screen.getByRole("button", { name: /Expand plan/i });
    fireEvent.click(expandBtn);

    // Section A
    expect(screen.getByText(/Exam Details/i)).toBeInTheDocument();
    expect(screen.getByText("Tier 1 Target")).toBeInTheDocument();

    // Section B (slots)
    expect(screen.getByRole("heading", { name: /Preparation Slots/i })).toBeInTheDocument();
    expect(screen.getByText("Syllabus Covering")).toBeInTheDocument();

    // Section C (Streaks visibility)
    expect(screen.getByText(/Show Calendar in Streaks/i)).toBeInTheDocument();

    // Section D (Lock / Unlock)
    expect(screen.getByRole("button", { name: /Lock Plan/i })).toBeInTheDocument();
  });

  it("calls toggleLockPlan when Lock Plan button is clicked", () => {
    render(<PlannerPage />);

    const expandBtn = screen.getByRole("button", { name: /Expand plan/i });
    fireEvent.click(expandBtn);

    const lockBtn = screen.getByRole("button", { name: /Lock Plan/i });
    fireEvent.click(lockBtn);

    expect(mockToggleLockPlan).toHaveBeenCalledWith("plan-1", false);
  });

  it("calls toggleStreaksVisibility when switch is toggled", () => {
    render(<PlannerPage />);

    const expandBtn = screen.getByRole("button", { name: /Expand plan/i });
    fireEvent.click(expandBtn);

    const switchBtn = screen.getByRole("switch");
    fireEvent.click(switchBtn);

    expect(mockToggleStreaksVisibility).toHaveBeenCalledWith("plan-1", true);
  });
});
