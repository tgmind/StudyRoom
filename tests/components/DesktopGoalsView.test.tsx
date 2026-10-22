import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DesktopGoalsView } from "@/components/presentation/desktop/DesktopGoalsView";
import { UserProfile, DailyGoal } from "@/lib/supabase/types";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "user-123" },
    profile: { display_name: "Test User" },
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/goals",
  useRouter: () => ({ push: vi.fn() }),
}));

describe("DesktopGoalsView Component", () => {
  const dummyProps = {
    profile: null,
    activeGoal: null,
    countdown: {
      remainingSeconds: 0,
      formattedText: "Expired",
      isExpired: true,
    },
    loading: false,
    actionLoading: false,
    isCreateModalOpen: false,
    setIsCreateModalOpen: vi.fn(),
    isAddModalOpen: false,
    setIsAddModalOpen: vi.fn(),
    isGuideModalOpen: false,
    setIsGuideModalOpen: vi.fn(),
    handleCreateGoals: vi.fn().mockResolvedValue(undefined),
    handleAddGoals: vi.fn().mockResolvedValue(undefined),
  };

  it("renders balanced two-column desktop workspace with active goal on left and accountability guide on right", () => {
    render(<DesktopGoalsView {...dummyProps} />);

    // Header title
    expect(screen.getByText("Rolling 20-Hour Accountability Goals")).toBeInTheDocument();

    // Right Column: Embedded Accountability Guide
    expect(screen.getByText("Accountability Principles")).toBeInTheDocument();
    expect(screen.getByText("Continuous 20-Hour Clock")).toBeInTheDocument();
    expect(screen.getByText("Append-Only Discipline")).toBeInTheDocument();
    expect(screen.getByText("30% Leaderboard Contribution")).toBeInTheDocument();
    expect(screen.getByText("Recommended Strategy")).toBeInTheDocument();

    // Left Column: Active goal create button or empty card
    expect(screen.getAllByText("+ Create 20-Hour Goals").length).toBeGreaterThan(0);
  });

  it("renders two-column skeleton placeholders when loading is true", () => {
    const { container } = render(<DesktopGoalsView {...dummyProps} loading={true} />);

    const pulseElements = container.querySelectorAll(".animate-pulse");
    // At least 2 skeletons (one for 7-col, one for 5-col)
    expect(pulseElements.length).toBeGreaterThanOrEqual(2);
  });

  it("opens create goal modal when create button is clicked", () => {
    const setIsCreateModalOpen = vi.fn();
    render(
      <DesktopGoalsView
        {...dummyProps}
        setIsCreateModalOpen={setIsCreateModalOpen}
      />
    );

    const createBtns = screen.getAllByText("+ Create 20-Hour Goals");
    fireEvent.click(createBtns[0]);
    expect(setIsCreateModalOpen).toHaveBeenCalledWith(true);
  });
});
