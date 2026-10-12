import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  UserGlobalPosition,
  getStandingPillInfo,
} from "@/components/analytics/UserGlobalPosition";
import {
  UserGlobalPosition as UserGlobalPositionType,
  GlobalCommunityStats,
} from "@/lib/supabase/types";

describe("getStandingPillInfo unit calculations", () => {
  it("classifies user as 'Last' when rank equals total eligible students (> 1)", () => {
    // 7 students, rank 7 (as in real user report)
    const result7 = getStandingPillInfo(7, 7, 100);
    expect(result7.type).toBe("last");
    expect(result7.label).toBe("Last");

    // 10 students, rank 10
    const result10 = getStandingPillInfo(10, 10, 100);
    expect(result10.type).toBe("last");
    expect(result10.label).toBe("Last");

    // 2 students, rank 2
    const result2 = getStandingPillInfo(2, 2, 100);
    expect(result2.type).toBe("last");
    expect(result2.label).toBe("Last");
  });

  it("handles single-student cohort (rank 1 of 1) as Top 1%, not Last", () => {
    const single = getStandingPillInfo(1, 1, 1);
    expect(single.type).toBe("top");
    expect(single.label).toBe("Top 1%");
  });

  it("computes complementary 'Last xx%' when user is not in top 70% and not the last student", () => {
    // Rank 5 of 7 (percentile 72 -> 100 - 72 = 28%)
    const rank5of7 = getStandingPillInfo(5, 7, 72);
    expect(rank5of7.type).toBe("last_percentile");
    expect(rank5of7.label).toBe("Last 28%");
    expect(rank5of7.percentileValue).toBe(28);

    // Rank 6 of 7 (percentile 86 -> 100 - 86 = 14%)
    const rank6of7 = getStandingPillInfo(6, 7, 86);
    expect(rank6of7.type).toBe("last_percentile");
    expect(rank6of7.label).toBe("Last 14%");
    expect(rank6of7.percentileValue).toBe(14);

    // Rank 8 of 10 (percentile 80 -> 100 - 80 = 20%)
    const rank8of10 = getStandingPillInfo(8, 10, 80);
    expect(rank8of10.type).toBe("last_percentile");
    expect(rank8of10.label).toBe("Last 20%");
    expect(rank8of10.percentileValue).toBe(20);

    // Rank 71 of 100 (percentile 71 -> 100 - 71 = 29%)
    const rank71of100 = getStandingPillInfo(71, 100, 71);
    expect(rank71of100.type).toBe("last_percentile");
    expect(rank71of100.label).toBe("Last 29%");

    // Near-bottom user in a massive cohort (percentile 100, but rank 999 of 1000)
    // Ensures we never render "Last 0%"
    const nearBottom = getStandingPillInfo(999, 1000, 100);
    expect(nearBottom.type).toBe("last_percentile");
    expect(nearBottom.label).toBe("Last 1%");
    expect(nearBottom.percentileValue).toBe(1);
  });

  it("computes standard 'Top xx%' when user is within top 70%", () => {
    // Exactly at 70% boundary
    const boundary = getStandingPillInfo(7, 10, 70);
    expect(boundary.type).toBe("top");
    expect(boundary.label).toBe("Top 70%");

    // Rank 4 of 28 (percentile 14)
    const rank4of28 = getStandingPillInfo(4, 28, 14);
    expect(rank4of28.type).toBe("top");
    expect(rank4of28.label).toBe("Top 14%");

    // Rank 1 of 100 (percentile 1)
    const rank1of100 = getStandingPillInfo(1, 100, 1);
    expect(rank1of100.type).toBe("top");
    expect(rank1of100.label).toBe("Top 1%");
  });

  it("calculates effective percentile dynamically if percentile prop is zero or invalid", () => {
    // rank 8 of 10 -> ceil(8/10 * 100) = 80% -> Last 20%
    const computedFromRank = getStandingPillInfo(8, 10, 0);
    expect(computedFromRank.type).toBe("last_percentile");
    expect(computedFromRank.label).toBe("Last 20%");
  });
});

describe("UserGlobalPosition Component UI Rendering", () => {
  const mockCommunityStats: GlobalCommunityStats = {
    total_eligible_students: 7,
    global_avg_study_minutes: 1872,
    global_avg_daily_minutes: 270,
    global_avg_goal_pct: 79.3,
    total_community_hours: 218,
    total_completed_goals: 120,
  };

  it("renders 'Last' with reddish dramatic design when user is Rank #7 of 7", () => {
    const userLastPosition: UserGlobalPositionType = {
      user_id: "last-user",
      rank: 7,
      total_eligible_students: 7,
      percentile: 100,
      total_study_minutes: 1536,
      daily_average_minutes: 220,
      active_study_days: 6,
      completed_tasks: 9,
      total_tasks: 17,
      goal_completion_pct: 52.9,
      score: 65.4,
      is_in_top5: false,
      minutes_to_top5: 336,
      delta_vs_community_study_mins: -336,
      delta_vs_community_goal_pct: -26.4,
    };

    render(
      <UserGlobalPosition
        userPosition={userLastPosition}
        communityStats={mockCommunityStats}
        isLoggedIn={true}
      />
    );

    // Must show Rank #7 and / 7
    expect(screen.getByText("Rank #7")).toBeDefined();
    expect(screen.getByText("/ 7")).toBeDefined();

    // Must NOT say "Top 100%"
    expect(screen.queryByText("Top 100%")).toBeNull();

    // Must display "Last"
    const standingPill = screen.getByTestId("user-standing-pill");
    expect(standingPill).toBeDefined();
    expect(screen.getByText("Last")).toBeDefined();

    // Verify reddish dramatic styling classes
    expect(standingPill.className).toContain("text-rose-200");
    expect(standingPill.className).toContain("border-rose-500/60");
    expect(standingPill.className).toContain("from-rose-950/90");
    expect(standingPill.className).toContain("shadow-[0_0_14px_rgba(244,63,94,0.35)]");
  });

  it("renders 'Last 28%' with warning style when user is Rank #5 of 7 (percentile 72)", () => {
    const userRank5Position: UserGlobalPositionType = {
      user_id: "user-5",
      rank: 5,
      total_eligible_students: 7,
      percentile: 72,
      total_study_minutes: 1600,
      daily_average_minutes: 230,
      active_study_days: 5,
      completed_tasks: 10,
      total_tasks: 15,
      goal_completion_pct: 66.7,
      score: 72.0,
      is_in_top5: false,
      minutes_to_top5: 120,
      delta_vs_community_study_mins: -272,
      delta_vs_community_goal_pct: -12.6,
    };

    render(
      <UserGlobalPosition
        userPosition={userRank5Position}
        communityStats={mockCommunityStats}
        isLoggedIn={true}
      />
    );

    expect(screen.getByText("Rank #5")).toBeDefined();
    expect(screen.queryByText("Top 72%")).toBeNull();
    expect(screen.getByText("Last 28%")).toBeDefined();

    const standingPill = screen.getByTestId("user-standing-pill");
    expect(standingPill.className).toContain("text-orange-300");
    expect(standingPill.className).toContain("border-orange-500/30");
  });

  it("renders 'Top 14%' with sky blue style when user is in the top 70%", () => {
    const userTopPosition: UserGlobalPositionType = {
      user_id: "user-4",
      rank: 4,
      total_eligible_students: 28,
      percentile: 14,
      total_study_minutes: 2400,
      daily_average_minutes: 340,
      active_study_days: 7,
      completed_tasks: 20,
      total_tasks: 22,
      goal_completion_pct: 90.9,
      score: 94.0,
      is_in_top5: true,
      minutes_to_top5: 0,
      delta_vs_community_study_mins: 528,
      delta_vs_community_goal_pct: 11.6,
    };

    render(
      <UserGlobalPosition
        userPosition={userTopPosition}
        communityStats={mockCommunityStats}
        isLoggedIn={true}
      />
    );

    expect(screen.getByText("Rank #4")).toBeDefined();
    expect(screen.getByText("Top 14%")).toBeDefined();

    const standingPill = screen.getByTestId("user-standing-pill");
    expect(standingPill.className).toContain("text-sky-300");
    expect(standingPill.className).toContain("border-sky-500/30");
  });

  it("renders sign-in message when not logged in", () => {
    render(
      <UserGlobalPosition
        userPosition={null}
        communityStats={mockCommunityStats}
        isLoggedIn={false}
      />
    );

    expect(
      screen.getByText("Sign In to View Your Global Standing")
    ).toBeDefined();
  });

  it("renders single thin inner white boundary with outer border removed", () => {
    const userTopPosition: UserGlobalPositionType = {
      user_id: "user-4",
      rank: 4,
      total_eligible_students: 28,
      percentile: 14,
      total_study_minutes: 2400,
      daily_average_minutes: 340,
      active_study_days: 7,
      completed_tasks: 20,
      total_tasks: 22,
      goal_completion_pct: 90.9,
      score: 94.0,
      is_in_top5: true,
      minutes_to_top5: 0,
      delta_vs_community_study_mins: 528,
      delta_vs_community_goal_pct: 11.6,
    };

    render(
      <UserGlobalPosition
        userPosition={userTopPosition}
        communityStats={mockCommunityStats}
        isLoggedIn={true}
      />
    );

    // Outer boundary on section: removed
    const section = screen.getByRole("region", {
      name: "Your Global Position and Benchmark Comparison",
    });
    expect(section.className).not.toContain("border-2");
    expect(section.className).not.toContain("border-white");

    // Inner boundary: thin white border with concentric radius preserved
    const innerBorder = screen.getByTestId("personalized-analytics-inner-border");
    expect(innerBorder).toBeDefined();
    expect(innerBorder.className).toContain("border");
    expect(innerBorder.className).toContain("border-white/60");
    expect(innerBorder.className).toContain("inset-1");
    expect(innerBorder.className).toContain("rounded-[20px]");
  });
});
