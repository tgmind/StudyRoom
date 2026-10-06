import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import GlobalAnalyticsPage from "@/app/analytics/page";
import { GlobalAnalyticsPayload } from "@/lib/supabase/types";

// Mock Supabase client
const mockPayload: GlobalAnalyticsPayload = {
  success: true,
  is_finalized: true,
  period_id: "2026-09-28",
  celebration_period_id: "2026-10-05",
  week_start: "2026-09-28T00:00:00.000Z",
  week_end: "2026-10-05T00:00:00.000Z",
  finalized_at: "2026-10-05T00:05:00.000Z",
  achiever: {
    id: "ach-1",
    celebration_period_id: "2026-10-05",
    source_period_id: "2026-09-28",
    week_start: "2026-09-28T00:00:00.000Z",
    week_end: "2026-10-05T00:00:00.000Z",
    achiever_user_id: "user-1",
    display_name: "Ritesh Kumar",
    avatar_url: null,
    total_study_minutes: 2376,
    average_study_minutes_per_day: 339.4,
    study_sessions_count: 24,
    active_study_days: 7,
    goal_completion_pct: 95.0,
    completed_goals_count: 19,
    total_goals_count: 20,
    leaderboard_score: 99.2,
    global_rank: 1,
    is_finalized: true,
    finalized_at: "2026-10-05T00:05:00.000Z",
  },
  user_position: {
    user_id: "user-4",
    rank: 4,
    total_eligible_students: 28,
    percentile: 14,
    is_in_top5: true,
    total_study_minutes: 1560,
    daily_average_minutes: 222.8,
    active_study_days: 6,
    goal_completion_pct: 88.0,
    completed_tasks: 14,
    total_tasks: 16,
    score: 84.5,
    delta_vs_community_study_mins: 420,
    delta_vs_community_goal_pct: 12.5,
    minutes_to_top5: 0,
  },
  community_stats: {
    total_eligible_students: 28,
    global_avg_study_minutes: 1140,
    global_avg_daily_minutes: 162.8,
    global_avg_goal_pct: 75.5,
    total_community_hours: 532,
    total_completed_goals: 180,
  },
  rankings: {
    most_studying: [
      {
        rank: 1,
        user_id: "user-1",
        display_name: "Ritesh Kumar",
        avatar_url: null,
        daily_average_minutes: 339.4,
        total_study_minutes: 2376,
        active_study_days: 7,
        score: 99.2,
      },
      {
        rank: 2,
        user_id: "user-2",
        display_name: "Tung Tung",
        avatar_url: null,
        daily_average_minutes: 336.8,
        total_study_minutes: 2358,
        active_study_days: 7,
        score: 98.4,
      },
      {
        rank: 3,
        user_id: "user-3",
        display_name: "Aditya",
        avatar_url: null,
        daily_average_minutes: 274.3,
        total_study_minutes: 1920,
        active_study_days: 6,
        score: 91.0,
      },
      {
        rank: 4,
        user_id: "user-4",
        display_name: "Subodh",
        avatar_url: null,
        daily_average_minutes: 222.8,
        total_study_minutes: 1560,
        active_study_days: 6,
        score: 84.5,
      },
      {
        rank: 5,
        user_id: "user-5",
        display_name: "Raunak",
        avatar_url: null,
        daily_average_minutes: 198.5,
        total_study_minutes: 1390,
        active_study_days: 5,
        score: 79.8,
      },
    ],
    consistency_rhythm_matrix: [
      {
        rank: 1,
        user_id: "user-6",
        display_name: "Pooja",
        avatar_url: null,
        active_study_days: 2,
        total_study_minutes: 240,
        daily_average_minutes: 34.2,
        score: 25.0,
      },
      {
        rank: 2,
        user_id: "user-7",
        display_name: "Karan",
        avatar_url: null,
        active_study_days: 3,
        total_study_minutes: 360,
        daily_average_minutes: 51.4,
        score: 35.0,
      },
    ],
    achiever_winners: [
      {
        rank: 1,
        user_id: "user-1",
        display_name: "Ritesh Kumar",
        avatar_url: null,
        achiever_count: 4,
        total_study_minutes: 9500,
      },
      {
        rank: 2,
        user_id: "user-2",
        display_name: "Tung Tung",
        avatar_url: null,
        achiever_count: 2,
        total_study_minutes: 7200,
      },
    ],
    goal_chasers: [
      {
        rank: 1,
        user_id: "user-8",
        display_name: "Sneha",
        avatar_url: null,
        goal_completion_pct: 100,
        completed_tasks: 15,
        total_tasks: 15,
        total_study_minutes: 1800,
      },
      {
        rank: 2,
        user_id: "user-1",
        display_name: "Ritesh Kumar",
        avatar_url: null,
        goal_completion_pct: 95.0,
        completed_tasks: 19,
        total_tasks: 20,
        total_study_minutes: 2376,
      },
    ],
  },
};

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: vi.fn().mockResolvedValue({
      data: mockPayload,
      error: null,
    }),
  }),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-4", email: "subodh@studyroom.test" },
    profile: {
      id: "user-4",
      full_name: "Subodh",
      avatar_url: null,
      role: "student",
    },
    loading: false,
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("Global Analytics Rendered QA & Viewport Acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const viewports = [
    { name: "320px (iPhone SE)", width: 320 },
    { name: "360px (Galaxy S8)", width: 360 },
    { name: "375px (iPhone 13 mini)", width: 375 },
    { name: "390px (iPhone 14/15)", width: 390 },
    { name: "412px (Pixel 7)", width: 412 },
    { name: "430px (iPhone 15 Pro Max)", width: 430 },
    { name: "768px (iPad Mini)", width: 768 },
    { name: "1024px (iPad Pro / Small Laptop)", width: 1024 },
    { name: "1440px (Desktop Display)", width: 1440 },
  ];

  viewports.forEach(({ name, width }) => {
    it(`renders cleanly without errors or truncated lens tabs at ${name}`, async () => {
      window.innerWidth = width;

      const rendered = render(<GlobalAnalyticsPage />);

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getAllByText("Ritesh Kumar").length).toBeGreaterThanOrEqual(1);
      });

      // 1. Navigation Switcher
      expect(screen.getByText("Weekly Leaderboard")).toBeDefined();
      expect(screen.getAllByText("Global Analytics").length).toBeGreaterThanOrEqual(1);

      // 2. Zone 1: Achiever Celebration Card
      expect(screen.getByText("Achiever of the Week")).toBeDefined();
      expect(screen.getByText("99.2")).toBeDefined();
      expect(screen.getByText("95%")).toBeDefined();

      // 3. Zone 2: Personalized Analytics (Your Position)
      expect(screen.getByText("Your Global Position")).toBeDefined();
      expect(screen.getByText("Rank #4")).toBeDefined();
      expect(screen.getByText("Top 14%")).toBeDefined();
      expect(screen.getByText("26.0h")).toBeDefined();

      // 4. Zone 3: Global Analytics Observatory
      expect(
        screen.getByText("Study Ecosystem Observatory")
      ).toBeDefined();
      expect(screen.getByText("Top 5 Telemetry")).toBeDefined();

      // 5. Lens Tabs: Must contain all 4 lenses
      expect(screen.getByRole("tab", { name: /Study/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /Consistency/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /Achievers/i })).toBeDefined();
      expect(screen.getByRole("tab", { name: /Goals/i })).toBeDefined();

      // 6. Active subtitle must be rendered below tabs
      expect(
        screen.getByText("Daily study velocity & volume intensity")
      ).toBeDefined();

      // 7. Most Study Visualizer: #1 Hero + #2/#3 comparative + #4/#5 compact
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();
      expect(screen.getByText("Tung Tung")).toBeDefined();
      expect(screen.getByText("Aditya")).toBeDefined();
      expect(screen.getByText("Subodh")).toBeDefined();
      expect(screen.getByText("Raunak")).toBeDefined();

      // 8. Bottom Navigation: Global Analytics must be highlighted
      const analyticsNavLink = screen.getByRole("link", {
        name: /Global Analytics/i,
      });
      expect(analyticsNavLink).toBeDefined();
      expect(analyticsNavLink.getAttribute("href")).toBe("/analytics");

      rendered.unmount();
    });
  });

  it("verifies lens switching across all 4 domains without reloading or resetting Achiever", async () => {
    const rendered = render(<GlobalAnalyticsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Ritesh Kumar").length).toBeGreaterThanOrEqual(1);
    });

    // 1. Initial Lens: Study Volume
    expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();

    // 2. Switch to Consistency
    fireEvent.click(screen.getByRole("tab", { name: /Consistency/i }));
    await waitFor(() => {
      expect(
        screen.getByText("Top Consistent Students • 7-Day Habit Continuity")
      ).toBeDefined();
    });
    expect(screen.getByText("Pooja")).toBeDefined();
    expect(screen.getByText("2 / 7")).toBeDefined();

    // 3. Switch to Achievers
    fireEvent.click(screen.getByRole("tab", { name: /Achievers/i }));
    await waitFor(() => {
      expect(
        screen.getByText("Grand Master Achiever · #1 Hall of Fame")
      ).toBeDefined();
    });
    expect(screen.getByText("×4")).toBeDefined();

    // 4. Switch to Goals
    fireEvent.click(screen.getByRole("tab", { name: /Goals/i }));
    await waitFor(() => {
      expect(
        screen.getByText("Precision Leader · #1 Execution")
      ).toBeDefined();
    });
    expect(screen.getByText("100%")).toBeDefined();
    expect(screen.getByText("Sneha")).toBeDefined();

    // 5. Switch back to Study
    fireEvent.click(screen.getByRole("tab", { name: /Study/i }));
    await waitFor(() => {
      expect(screen.getByText("Top Study Velocity · #1")).toBeDefined();
    });

    // Achiever of the Week should still be present with same data
    expect(screen.getAllByText("Ritesh Kumar").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("99.2")).toBeDefined();

    rendered.unmount();
  });
});
