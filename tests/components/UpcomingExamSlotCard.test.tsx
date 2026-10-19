import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  UpcomingExamSlotCard,
  findNearestUpcomingExam,
  analyzeExamSlots,
} from "@/components/room/UpcomingExamSlotCard";
import * as useExamPlansModule from "@/hooks/useExamPlans";
import * as clockSyncModule from "@/lib/time/clockSync";
import * as preferenceModule from "@/hooks/useUpcomingExamCardPreference";
import { ExamPlanWithSlots, PreparationSlot } from "@/lib/supabase/types";

describe("UpcomingExamSlotCard Component & Calculations", () => {
  // Fixed reference date: 2026-10-19T12:00:00Z (Asia/Kolkata date is 2026-10-19)
  const fixedNow = new Date("2026-10-19T12:00:00Z");
  const todayISO = "2026-10-19";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(clockSyncModule, "getServerNow").mockReturnValue(fixedNow);
    vi.spyOn(preferenceModule, "useUpcomingExamCardPreference").mockReturnValue({
      showRoomUpcomingCard: true,
      setShowRoomUpcomingCard: vi.fn(),
      toggleShowRoomUpcomingCard: vi.fn(),
      isUpdating: false,
    });
  });

  const createMockPlan = (
    id: string,
    examName: string,
    examDate: string,
    sortOrder: number = 0,
    slots: PreparationSlot[] = [],
    createdAt: string = "2026-10-01T00:00:00Z"
  ): ExamPlanWithSlots => ({
    id,
    user_id: "user-123",
    exam_name: examName,
    exam_date: examDate,
    description: "Target exam",
    show_in_streaks: true,
    is_locked: false,
    sort_order: sortOrder,
    created_at: createdAt,
    updated_at: createdAt,
    slots,
  });

  const createMockSlot = (
    id: string,
    planId: string,
    title: string,
    startDate: string,
    endDate: string,
    category: string = "syllabus",
    sortOrder: number = 0,
    description?: string
  ): PreparationSlot => ({
    id,
    plan_id: planId,
    user_id: "user-123",
    title,
    start_date: startDate,
    end_date: endDate,
    category,
    color: "#3b82f6",
    sort_order: sortOrder,
    description: description || null,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
  });

  // =========================================================================
  // Section A: Data and Selection Unit Tests
  // =========================================================================

  it("1. Missing user ID renders nothing", () => {
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { container } = render(
      <UpcomingExamSlotCard userId={undefined} isTimerActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("2. Planner loading state with empty cache renders nothing (no false flash)", () => {
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [],
      loading: true,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { container } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("3. No exams configured renders nothing", () => {
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { container } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("4. All exams in the past renders nothing", () => {
    const pastPlan = createMockPlan("p1", "Past Exam", "2026-08-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [pastPlan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { container } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("5. Exam scheduled today displays TODAY and exam day label", () => {
    const todayPlan = createMockPlan("p1", "Today Exam", "2026-10-19");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [todayPlan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    expect(screen.getByText("Today Exam")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-number")).toHaveTextContent("TODAY");
    expect(screen.getByTestId("countdown-label")).toHaveTextContent("exam day");
  });

  it("6. Exam scheduled in the future displays days remaining with alarming typography", () => {
    // 2026-10-19 to 2026-10-29 = 10 days
    const futurePlan = createMockPlan("p1", "SSC CGL", "2026-10-29");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [futurePlan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    expect(screen.getByText("SSC CGL")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-number")).toHaveTextContent("10");
    expect(screen.getByTestId("countdown-label")).toHaveTextContent("days remaining");
    expect(screen.getByText("Exam: 29/10/2026")).toBeInTheDocument();
  });

  it("7. Multiple exams: selects nearest eligible exam", () => {
    const plans = [
      createMockPlan("p1", "Far Future Exam", "2027-07-01"),
      createMockPlan("p2", "Nearest Future Exam", "2026-11-15"),
      createMockPlan("p3", "Past Exam", "2026-09-01"),
    ];

    const result = findNearestUpcomingExam(plans, todayISO);
    expect(result).not.toBeNull();
    expect(result?.nearestExam.exam_name).toBe("Nearest Future Exam");
    expect(result?.daysRemaining).toBe(27);
  });

  it("8. Two exams with identical dates: confirms deterministic tie-breaking via sort_order", () => {
    const plans = [
      createMockPlan("p2", "Second Priority", "2027-01-01", 1),
      createMockPlan("p1", "First Priority", "2027-01-01", 0),
    ];

    const result = findNearestUpcomingExam(plans, todayISO);
    expect(result).not.toBeNull();
    expect(result?.nearestExam.exam_name).toBe("First Priority");
  });

  it("9. Invalid or malformed exam dates are safely ignored without crashing", () => {
    const plans = [
      createMockPlan("p-bad", "Bad Date Exam", "invalid-date"),
      createMockPlan("p-bad2", "Impossible Leap Date", "2026-02-29"),
      createMockPlan("p-good", "Good Exam", "2026-12-01"),
    ];

    const result = findNearestUpcomingExam(plans, todayISO);
    expect(result).not.toBeNull();
    expect(result?.nearestExam.exam_name).toBe("Good Exam");
  });

  // =========================================================================
  // Section B: Active Slot Analysis Unit Tests
  // =========================================================================

  it("10. Active preparation slot covering today is recognized", () => {
    const slots = [
      createMockSlot("s1", "p1", "Syllabus Phase", "2026-10-14", "2026-11-14", "syllabus"),
    ];

    const analysis = analyzeExamSlots(slots, todayISO, "2027-01-01");
    expect(analysis.state).toBe("active");
    expect(analysis.activeSlot?.title).toBe("Syllabus Phase");
    expect(analysis.phaseNumber).toBe(1);
    expect(analysis.phaseTotalDays).toBe(32); // 14 Oct to 14 Nov = 32 days
    expect(analysis.phaseRemainingDays).toBe(26); // 19 Oct to 14 Nov = 26 days
  });

  it("11. Future preparation slot before prep starts is marked upcoming", () => {
    const slots = [
      createMockSlot("s1", "p1", "Upcoming Syllabus", "2026-11-01", "2026-11-30"),
    ];

    const analysis = analyzeExamSlots(slots, todayISO, "2027-01-01");
    expect(analysis.state).toBe("upcoming");
    expect(analysis.upcomingSlot?.title).toBe("Upcoming Syllabus");
    expect(analysis.upcomingDaysUntil).toBe(13); // 19 Oct to 1 Nov = 13 days
  });

  it("12. Gap between earlier completed slot and future slot is marked gap", () => {
    const slots = [
      createMockSlot("s1", "p1", "Completed Phase", "2026-09-01", "2026-10-10"),
      createMockSlot("s2", "p1", "Revision Phase", "2026-11-01", "2026-11-30"),
    ];

    const analysis = analyzeExamSlots(slots, todayISO, "2027-01-01");
    expect(analysis.state).toBe("gap");
    expect(analysis.upcomingSlot?.title).toBe("Revision Phase");
    expect(analysis.upcomingDaysUntil).toBe(13);
  });

  it("13. No slots configured evaluates to state none", () => {
    const analysis = analyzeExamSlots([], todayISO, "2027-01-01");
    expect(analysis.state).toBe("none");
    expect(analysis.activeSlot).toBeNull();
  });

  it("14. Invalid slot date ranges are safely filtered out", () => {
    const slots = [
      createMockSlot("s-bad", "p1", "End Before Start", "2026-10-25", "2026-10-10"),
      createMockSlot("s-bad2", "p1", "Invalid Format", "not-a-date", "2026-10-20"),
      createMockSlot("s-valid", "p1", "Valid Slot", "2026-10-15", "2026-10-25"),
    ];

    const analysis = analyzeExamSlots(slots, todayISO, "2027-01-01");
    expect(analysis.state).toBe("active");
    expect(analysis.activeSlot?.title).toBe("Valid Slot");
  });

  it("15. Multiple overlapping slots deterministically select the first sorted slot", () => {
    const slots = [
      createMockSlot("s2", "p1", "Second Slot", "2026-10-15", "2026-10-25", "revision", 1),
      createMockSlot("s1", "p1", "First Slot", "2026-10-15", "2026-10-25", "syllabus", 0),
    ];

    const analysis = analyzeExamSlots(slots, todayISO, "2027-01-01");
    expect(analysis.state).toBe("active");
    expect(analysis.activeSlot?.title).toBe("First Slot");
  });

  // =========================================================================
  // Section C: Session Visibility and Animation Container Tests
  // =========================================================================

  it("16. The card container is visible when timer is offline (isTimerActive = false)", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    const container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container).toHaveAttribute("aria-hidden", "false");
    expect(container.className).toContain("opacity-100");
    expect(container.className).toContain("pointer-events-auto");
  });

  it("17. The card enters the collapsed hidden state when studying begins (isTimerActive = true)", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={true} />);
    const container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container.className).toContain("opacity-0");
    expect(container.className).toContain("max-h-0");
    expect(container.className).toContain("pointer-events-none");
  });

  it("18. The card remains hidden during break (isTimerActive = true)", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { rerender } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={true} />
    );
    let container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container.className).toContain("max-h-0");

    // Still true when break continues
    rerender(<UpcomingExamSlotCard userId="user-123" isTimerActive={true} />);
    container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container).toHaveAttribute("aria-hidden", "true");
  });

  it("19. The card smoothly reappears when the session returns to offline", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { rerender } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={true} />
    );
    let container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container.className).toContain("opacity-0");

    // Session stops
    rerender(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container.className).toContain("opacity-100");
    expect(container).toHaveAttribute("aria-hidden", "false");
  });

  it("20. Rapid status changes do not leave the card stuck in an invalid state", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { rerender } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} />
    );
    // rapid toggle
    rerender(<UpcomingExamSlotCard userId="user-123" isTimerActive={true} />);
    rerender(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    rerender(<UpcomingExamSlotCard userId="user-123" isTimerActive={true} />);
    rerender(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);

    const container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container.className).toContain("opacity-100");
    expect(container).toHaveAttribute("aria-hidden", "false");
  });

  it("21. Start Studying and Stop controls are independent and not obstructed by the card", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    // Render when collapsed
    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={true} />);
    const container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container.className).toContain("pointer-events-none");
  });

  // =========================================================================
  // Section D: UI and Accessibility Tests
  // =========================================================================

  it("22. Long exam titles are displayed with truncate class", () => {
    const longTitlePlan = createMockPlan(
      "p1",
      "Combined Graduate Level Examination For Group B & C Non-Technical Staff 2027",
      "2027-07-01"
    );
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [longTitlePlan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    const heading = screen.getByRole("heading", { level: 3 });
    expect(heading.className).toContain("truncate");
  });

  it("23. The Planner navigation link routes to /planner", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/planner");
    expect(link).toHaveAttribute("aria-label");
  });

  it("24. Empty states return null and leave no unwanted gaps", () => {
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { container } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("25. Essential content remains accessible without hover", () => {
    const slots = [
      createMockSlot("s1", "p1", "Syllabus Phase", "2026-10-14", "2026-11-14", "syllabus"),
    ];
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01", 0, slots);
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    expect(screen.getByText("SSC CGL")).toBeVisible();
    expect(screen.getByText("Phase #1")).toBeVisible();
    expect(screen.getByText("Syllabus Coverage")).toBeVisible();
    expect(screen.getByText("Exam: 01/07/2027")).toBeVisible();
  });

  it("26. Reduced-motion styling is applied via motion-reduce:transition-none", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    const container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container.className).toContain("motion-reduce:transition-none");
  });

  // =========================================================================
  // Section F: Cross-Device Toggle Setting & Layout Safety Tests
  // =========================================================================

  it("27. Card returns null when showCard prop is explicitly false", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    const { container } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} showCard={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("28. Card returns null when user disabled setting via useUpcomingExamCardPreference", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    vi.spyOn(preferenceModule, "useUpcomingExamCardPreference").mockReturnValue({
      showRoomUpcomingCard: false,
      setShowRoomUpcomingCard: vi.fn(),
      toggleShowRoomUpcomingCard: vi.fn(),
      isUpdating: false,
    });

    const { container } = render(
      <UpcomingExamSlotCard userId="user-123" isTimerActive={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("29. Card renders normally when setting is enabled (default true)", () => {
    const plan = createMockPlan("p1", "UPSC CSE Prelims", "2027-05-25");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    expect(screen.getByText("UPSC CSE Prelims")).toBeInTheDocument();
  });

  it("30. Container uses max-h-52 when idle to guarantee no text clipping", () => {
    const plan = createMockPlan("p1", "SSC CGL", "2027-07-01");
    vi.spyOn(useExamPlansModule, "useExamPlans").mockReturnValue({
      plans: [plan],
      loading: false,
      actionLoading: false,
      error: null,
      insights: {} as any,
      fetchPlans: vi.fn(),
      createExamPlan: vi.fn(),
      updateExamPlan: vi.fn(),
      deleteExamPlan: vi.fn(),
      toggleLockPlan: vi.fn(),
      toggleStreaksVisibility: vi.fn(),
      reorderPlans: vi.fn(),
      addSlot: vi.fn(),
      updateSlot: vi.fn(),
      deleteSlot: vi.fn(),
    });

    render(<UpcomingExamSlotCard userId="user-123" isTimerActive={false} />);
    const container = screen.getByTestId("upcoming-exam-slot-card-container");
    expect(container.className).toContain("max-h-52");
  });
});
