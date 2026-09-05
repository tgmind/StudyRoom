import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import StreakPage from "@/app/streak/page";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "test-user-123" },
    profile: {
      id: "test-user-123",
      display_name: "Alex",
      avatar_url: null,
      current_status: "offline",
      has_achiever_badge: true,
    },
    loading: false,
  }),
}));


vi.mock("@/hooks/useUserStreak", () => ({
  useUserStreak: () => ({
    loading: false,
    error: null,
    heatmapDays: [
      {
        dateISO: "2026-08-31",
        dayName: "Mon",
        dayNumber: 31,
        monthName: "Aug",
        activeStudyMinutes: 60,
        sessionCount: 1,
        isToday: false,
        isPast: true,
        isFuture: false,
        isQualified: true,
        intensityLevel: 2,
        sessions: [],
      },
      {
        dateISO: "2026-09-01",
        dayName: "Tue",
        dayNumber: 1,
        monthName: "Sep",
        activeStudyMinutes: 30,
        sessionCount: 1,
        isToday: false,
        isPast: true,
        isFuture: false,
        isQualified: true,
        intensityLevel: 2,
        sessions: [],
      },
      {
        dateISO: "2026-09-02",
        dayName: "Wed",
        dayNumber: 2,
        monthName: "Sep",
        activeStudyMinutes: 45,
        sessionCount: 1,
        isToday: true,
        isPast: false,
        isFuture: false,
        isQualified: true,
        intensityLevel: 2,
        sessions: [],
      },
      {
        dateISO: "2026-09-03",
        dayName: "Thu",
        dayNumber: 3,
        monthName: "Sep",
        activeStudyMinutes: 0,
        sessionCount: 0,
        isToday: false,
        isPast: false,
        isFuture: true,
        isQualified: false,
        intensityLevel: 0,
        sessions: [],
      },
      {
        dateISO: "2026-09-04",
        dayName: "Fri",
        dayNumber: 4,
        monthName: "Sep",
        activeStudyMinutes: 0,
        sessionCount: 0,
        isToday: false,
        isPast: false,
        isFuture: true,
        isQualified: false,
        intensityLevel: 0,
        sessions: [],
      },
      {
        dateISO: "2026-09-05",
        dayName: "Sat",
        dayNumber: 5,
        monthName: "Sep",
        activeStudyMinutes: 0,
        sessionCount: 0,
        isToday: false,
        isPast: false,
        isFuture: true,
        isQualified: false,
        intensityLevel: 0,
        sessions: [],
      },
      {
        dateISO: "2026-09-06",
        dayName: "Sun",
        dayNumber: 6,
        monthName: "Sep",
        activeStudyMinutes: 0,
        sessionCount: 0,
        isToday: false,
        isPast: false,
        isFuture: true,
        isQualified: false,
        intensityLevel: 0,
        sessions: [],
      },
    ],
    stats: {
      currentStreak: 3,
      bestStreak: 7,
      weeklyTotalMinutes: 135,
      weeklyQualifiedDays: 3,
      weeklyConsistencyRate: 43,
      dailyAverageMinutes: 45,
      totalSessionsCount: 3,
      activeDaysCount: 3,
      todayMinutes: 45,
      todayQualified: true,
      todayMinutesRemaining: 0,
      timeUntilMidnight: "5h 20m",
    },
    selectedDay: null,
    setSelectedDay: vi.fn(),
  }),
}));

describe("StreakPage Integration", () => {
  it("renders full streak page with header, heatmap, and analytics", () => {
    render(<StreakPage />);

    expect(screen.getByText("Study Consistency & Streak")).toBeInTheDocument();
    expect(screen.getByText("Weekly Study Heatmap")).toBeInTheDocument();
    expect(screen.getByText("Consistency Reports & Analytics")).toBeInTheDocument();
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    expect(screen.getByText("Days Streak")).toBeInTheDocument();
  });
});
