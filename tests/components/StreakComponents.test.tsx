import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { StreakHero } from "@/components/streak/StreakHero";
import { StreakHeatmap } from "@/components/streak/StreakHeatmap";
import { ConsistencyMetrics } from "@/components/streak/ConsistencyMetrics";
import { DayDetailModal } from "@/components/streak/DayDetailModal";
import { HeatmapDay, ConsistencyStats } from "@/lib/scoring/streak";

describe("Streak UI Components", () => {
  const mockStats: ConsistencyStats = {
    currentStreak: 5,
    bestStreak: 12,
    weeklyTotalMinutes: 240,
    weeklyQualifiedDays: 4,
    weeklyConsistencyRate: 57,
    dailyAverageMinutes: 60,
    totalSessionsCount: 4,
    activeDaysCount: 4,
    todayMinutes: 45,
    todayQualified: true,
    todayMinutesRemaining: 0,
    timeUntilMidnight: "3h 15m",
  };

  const mockDays: HeatmapDay[] = [
    {
      dateISO: "2026-08-31",
      dayName: "Mon",
      dayNumber: 31,
      monthName: "Aug",
      activeStudyMinutes: 60,
      sessionCount: 2,
      isToday: false,
      isPast: true,
      isFuture: false,
      isQualified: true,
      intensityLevel: 2,
      sessions: [
        {
          id: "s1",
          user_id: "u1",
          start_time: "2026-08-31T10:00:00Z",
          end_time: "2026-08-31T11:00:00Z",
          duration_minutes: 60,
        },
      ],
    },
    {
      dateISO: "2026-09-01",
      dayName: "Tue",
      dayNumber: 1,
      monthName: "Sep",
      activeStudyMinutes: 45,
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
  ];

  it("renders StreakHero with streak count, best record, and secured status", () => {
    render(<StreakHero stats={mockStats} />);

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Days Streak")).toBeInTheDocument();
    expect(screen.getByText(/Best:/i)).toBeInTheDocument();
    expect(screen.getByText(/12 Days/i)).toBeInTheDocument();
    expect(screen.getByText(/Streak Secured Today!/i)).toBeInTheDocument();
    expect(screen.getByText(/3h 15m/i)).toBeInTheDocument();
  });

  it("renders StreakHeatmap with all 7 days and handles day selection", () => {
    const handleSelectDay = vi.fn();

    render(
      <StreakHeatmap
        days={mockDays}
        selectedDay={null}
        onSelectDay={handleSelectDay}
      />
    );

    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(screen.getByText("Tue")).toBeInTheDocument();
    expect(screen.getByText("Wed")).toBeInTheDocument();
    expect(screen.getByText("Thu")).toBeInTheDocument();
    expect(screen.getByText("Fri")).toBeInTheDocument();
    expect(screen.getByText("Sat")).toBeInTheDocument();
    expect(screen.getByText("Sun")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();

    // Verify 7-column horizontal layout is guaranteed via inline grid-template-columns
    const gridContainer = screen.getByText("Mon").closest(".grid");
    expect(gridContainer).toHaveStyle({
      gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    });

    // Click Monday
    const mondayBtn = screen.getByText("Mon").closest("button");
    expect(mondayBtn).not.toBeNull();
    fireEvent.click(mondayBtn!);
    expect(handleSelectDay).toHaveBeenCalledWith(mockDays[0]);
  });

  it("renders ConsistencyMetrics with all 6 data-driven cards without fake text", () => {
    render(<ConsistencyMetrics stats={mockStats} />);

    expect(screen.getByText(/Consistency Rate/i)).toBeInTheDocument();
    expect(screen.getByText("57%")).toBeInTheDocument();
    expect(screen.getByText(/Weekly Volume/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Sessions/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Goal Met/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Afternoon Sprint/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/General Study/i)).not.toBeInTheDocument();
  });

  it("renders DayDetailModal with session breakdown and closes properly", () => {
    const handleClose = vi.fn();

    render(<DayDetailModal day={mockDays[0]} onClose={handleClose} />);

    expect(screen.getByText(/Mon, Aug 31/i)).toBeInTheDocument();
    expect(screen.getByText(/Streak Qualified/i)).toBeInTheDocument();
    expect(screen.getByText(/Session #1/i)).toBeInTheDocument();
    expect(screen.getByText(/Close Breakdown/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Close Breakdown/i));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("renders DayDetailModal with live session in progress when today is active", () => {
    const todayActiveMock: HeatmapDay = {
      dateISO: "2026-09-02",
      dayName: "Wed",
      dayNumber: 2,
      monthName: "Sep",
      activeStudyMinutes: 25,
      sessionCount: 1,
      isToday: true,
      isPast: false,
      isFuture: false,
      isQualified: false,
      intensityLevel: 1,
      sessions: [],
    };

    render(<DayDetailModal day={todayActiveMock} onClose={vi.fn()} />);

    expect(screen.getByText(/Live Session In Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Active timer contributing to today's streak/i)).toBeInTheDocument();
  });
});
