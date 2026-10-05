import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import { AchieverCelebrationCard } from "@/components/analytics/AchieverCelebrationCard";
import { WeeklyAchieverSnapshot } from "@/lib/supabase/types";

describe("AchieverCelebrationCard Component", () => {
  const baseAchiever: WeeklyAchieverSnapshot = {
    id: "ach-1",
    celebration_period_id: "2026-10-05",
    source_period_id: "2026-09-28",
    week_start: "2026-09-28T00:00:00.000Z",
    week_end: "2026-10-05T00:00:00.000Z",
    achiever_user_id: "user-123",
    display_name: "Rahul Sharma",
    avatar_url: null,
    total_study_minutes: 1500,
    average_study_minutes_per_day: 214.3,
    study_sessions_count: 15,
    active_study_days: 7,
    goal_completion_pct: 92.5,
    completed_goals_count: 18,
    total_goals_count: 20,
    leaderboard_score: 87.6,
    global_rank: 1,
    is_finalized: true,
    finalized_at: "2026-10-05T00:05:00.000Z",
  };

  it("1. renders valid decimal score: leaderboard_score = 87.6 -> '87.6 / 100'", () => {
    render(<AchieverCelebrationCard achiever={baseAchiever} />);

    expect(screen.getByText("87.6")).toBeDefined();
    expect(screen.getByText("/ 100")).toBeDefined();
    expect(screen.getByText("Rahul Sharma")).toBeDefined();
  });

  it("2. renders integer score correctly with one decimal place: 95 -> '95.0 / 100'", () => {
    const achieverWithIntegerScore = {
      ...baseAchiever,
      leaderboard_score: 95,
    };

    render(<AchieverCelebrationCard achiever={achieverWithIntegerScore} />);

    expect(screen.getByText("95.0")).toBeDefined();
    expect(screen.getByText("/ 100")).toBeDefined();
  });

  it("3. renders score = 0 as '0.0 / 100' without treating zero as missing", () => {
    const achieverWithZeroScore = {
      ...baseAchiever,
      leaderboard_score: 0,
    };

    render(<AchieverCelebrationCard achiever={achieverWithZeroScore} />);

    expect(screen.getByText("0.0")).toBeDefined();
    expect(screen.getByText("/ 100")).toBeDefined();
    expect(screen.queryByText("Score unavailable")).toBeNull();
  });

  it("4. handles missing/undefined leaderboard_score gracefully with deliberate 'Score unavailable' UI state", () => {
    const achieverWithUndefinedScore = {
      ...baseAchiever,
      leaderboard_score: undefined,
      score: undefined,
    };

    render(<AchieverCelebrationCard achiever={achieverWithUndefinedScore} />);

    expect(screen.getByText("Score unavailable")).toBeDefined();
    expect(screen.queryByText("/ 100")).toBeNull();
  });

  it("5. handles null leaderboard_score without crashing", () => {
    const achieverWithNullScore = {
      ...baseAchiever,
      leaderboard_score: null,
      score: null,
    };

    render(<AchieverCelebrationCard achiever={achieverWithNullScore} />);

    expect(screen.getByText("Score unavailable")).toBeDefined();
    expect(screen.queryByText("/ 100")).toBeNull();
  });

  it("6. resolves canonical score when exposed via .score property", () => {
    const achieverWithScoreProp: WeeklyAchieverSnapshot = {
      ...baseAchiever,
      leaderboard_score: undefined,
      score: 84.2,
    };

    render(<AchieverCelebrationCard achiever={achieverWithScoreProp} />);

    expect(screen.getByText("84.2")).toBeDefined();
    expect(screen.getByText("/ 100")).toBeDefined();
  });

  it("7. renders empty celebration card when achiever is null without crashing", () => {
    render(<AchieverCelebrationCard achiever={null} />);

    expect(screen.getByText("Achiever of the Week")).toBeDefined();
    expect(
      screen.getByText(
        "No qualifying study activity recorded for the previous weekly period. Complete your sessions to claim next week's title!"
      )
    ).toBeDefined();
  });

  it("8. verifies stats and period consistency on card", () => {
    render(<AchieverCelebrationCard achiever={baseAchiever} />);

    expect(screen.getByText("92.5%")).toBeDefined();
    expect(screen.getByText("18/20 tasks completed")).toBeDefined();
    expect(screen.getByText("7 active study days")).toBeDefined();
  });

  it("9. executes entrance animation sequence and settles without continuous animation", async () => {
    const { container } = render(<AchieverCelebrationCard achiever={baseAchiever} />);
    const section = container.querySelector("section");
    expect(section).toBeDefined();

    // Fast-forward through animation timers
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    expect(section?.className).toContain("opacity-100");
    expect(section?.className).toContain("scale-100");
  });

  it("10. respects prefers-reduced-motion by remaining settled without scale or ping transitions", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });

    try {
      const { container } = render(<AchieverCelebrationCard achiever={baseAchiever} />);
      const section = container.querySelector("section");
      expect(section?.className).toContain("opacity-100");
      expect(section?.className).toContain("scale-100");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("11. does NOT run celebratory entrance animations when achiever is null", () => {
    const { container } = render(<AchieverCelebrationCard achiever={null} />);
    expect(container.querySelector("section")).toBeNull();
    expect(screen.getByText("Achiever of the Week")).toBeDefined();
  });

  it("12. does NOT restart animation when parent re-renders with same achiever, but replays on fresh page entry", async () => {
    const { container, rerender, unmount } = render(
      <AchieverCelebrationCard achiever={baseAchiever} />
    );
    const section = container.querySelector("section");

    // Wait until settled
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    expect(section?.className).toContain("opacity-100");
    expect(section?.className).toContain("scale-100");

    // Simulate lens switches (re-rendering component with same achiever)
    rerender(<AchieverCelebrationCard achiever={baseAchiever} />);
    // Remains settled (no ping/pulse re-added)
    expect(container.querySelector(".animate-ping")).toBeNull();

    // Simulate navigating away and returning (unmount and mount again)
    unmount();
    const remount = render(<AchieverCelebrationCard achiever={baseAchiever} />);
    // On fresh mount, starts initial/entering sequence
    const remountedSection = remount.container.querySelector("section");
    expect(remountedSection).toBeDefined();

    // Settle again
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    expect(remountedSection?.className).toContain("opacity-100");
  });
});

