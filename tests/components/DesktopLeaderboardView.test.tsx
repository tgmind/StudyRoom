import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DesktopLeaderboardView } from "@/components/presentation/desktop/DesktopLeaderboardView";
import { LeaderboardEntry } from "@/lib/supabase/types";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-123" },
    profile: { display_name: "Test User" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/leaderboard",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("DesktopLeaderboardView Component", () => {
  const dummyEntries: LeaderboardEntry[] = [
    {
      user_id: "u1",
      display_name: "Leader One",
      avatar_url: null,
      score: 95.5,
      total_study_minutes: 1800,
      total_tasks: 10,
      completed_tasks: 10,
      goal_completion_pct: 100,
      streak_days: 7,
      has_achiever_badge: true,
      current_status: "offline",
    },
  ];

  it("constrains the main container with max-w-6xl 2xl:max-w-7xl mx-auto to prevent horizontal over-stretching on ultrawide displays", () => {
    const { container } = render(
      <DesktopLeaderboardView
        profile={null}
        user={{ id: "u1" }}
        entries={dummyEntries}
        loading={false}
        error={null}
        userEntry={dummyEntries[0]}
        userRank={1}
        isModalOpen={false}
        setIsModalOpen={vi.fn()}
      />
    );

    const main = container.querySelector("main");
    expect(main).toBeInTheDocument();
    expect(main).toHaveClass("max-w-6xl");
    expect(main).toHaveClass("mx-auto");
  });

  it("renders unified split screen with Weekly Leaderboard on the left and Global Analytics on the right", () => {
    render(
      <DesktopLeaderboardView
        profile={null}
        user={{ id: "u1" }}
        entries={dummyEntries}
        loading={false}
        error={null}
        userEntry={dummyEntries[0]}
        userRank={1}
        isModalOpen={false}
        setIsModalOpen={vi.fn()}
      />
    );

    // Unified Header
    expect(screen.getByRole("heading", { name: "Rankings & Global Analytics" })).toBeInTheDocument();
    expect(screen.getByText("LIVE SPLIT VIEW")).toBeInTheDocument();

    // Left Wing: Leaderboard
    const leftSection = screen.getByRole("region", { name: "Weekly Leaderboard" });
    expect(leftSection).toBeInTheDocument();
    expect(screen.getByText(/Community Rankings/i)).toBeInTheDocument();
    expect(screen.getByText("Leader One")).toBeInTheDocument();

    // Right Wing: Global Analytics
    const rightSection = screen.getByRole("region", { name: "Global Analytics Observatory" });
    expect(rightSection).toBeInTheDocument();
  });

  it("renders user streak badge linking to /streak when user rank > 1", () => {
    const nonRankOneEntry: LeaderboardEntry = {
      ...dummyEntries[0],
      user_id: "u2",
      display_name: "Leader Two",
      streak_days: 4,
    };

    render(
      <DesktopLeaderboardView
        profile={null}
        user={{ id: "u1" }}
        entries={[dummyEntries[0], nonRankOneEntry]}
        loading={false}
        error={null}
        userEntry={nonRankOneEntry}
        userRank={2}
        isModalOpen={false}
        setIsModalOpen={vi.fn()}
      />
    );

    const streakLink = screen.getByText("4d streak").closest("a");
    expect(streakLink).toBeInTheDocument();
    expect(streakLink).toHaveAttribute("href", "/streak");
  });
});
