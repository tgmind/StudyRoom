import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { RoomMissionCompanion } from "@/components/room/RoomMissionCompanion";
import { DailyGoal } from "@/lib/supabase/types";

describe("RoomMissionCompanion Component", () => {
  const mockGoal: DailyGoal = {
    id: "goal-1",
    user_id: "user-1",
    tasks: [
      {
        id: "t1",
        task: "Read Electrostatics Chapter 3 with in-depth numerical problem sets and derivation review",
        completed: false,
      },
      {
        id: "t2",
        task: "Short task completed",
        completed: true,
      },
    ],
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    is_locked: false,
    archived_at: null,
  };

  it("renders tasks with inspectable title attribute and proper text classes", () => {
    render(
      <RoomMissionCompanion
        activeGoal={mockGoal}
        isStudying={true}
        streakDays={5}
        weeklyStudySeconds={3600}
      />
    );

    const longTaskElement = screen.getByTitle(
      "Read Electrostatics Chapter 3 with in-depth numerical problem sets and derivation review"
    );
    expect(longTaskElement).toBeInTheDocument();
    expect(longTaskElement).toHaveClass("break-words");
    expect(longTaskElement).toHaveClass("select-text");
    expect(longTaskElement).not.toHaveClass("line-through");

    const completedTaskElement = screen.getByTitle("Short task completed");
    expect(completedTaskElement).toBeInTheDocument();
    expect(completedTaskElement).toHaveClass("line-through");
  });

  it("renders header stats correctly", () => {
    render(
      <RoomMissionCompanion
        activeGoal={mockGoal}
        isStudying={true}
        streakDays={5}
        weeklyStudySeconds={3600}
      />
    );

    expect(screen.getByText("Live Session Mission")).toBeInTheDocument();
    expect(screen.getByText("1/2 completed (50% discipline)")).toBeInTheDocument();
    expect(screen.getByText("5d streak")).toBeInTheDocument();
    expect(screen.getByText("1.0h this wk")).toBeInTheDocument();
  });

  it("links streak and weekly study volume to /streak", () => {
    render(
      <RoomMissionCompanion
        activeGoal={mockGoal}
        isStudying={false}
        streakDays={2}
        weeklyStudySeconds={27360} // 456 mins = 7.6h
      />
    );

    const streakLink = screen.getByText("2d streak").closest("a");
    expect(streakLink).toHaveAttribute("href", "/streak");

    const weeklyLink = screen.getByText("7.6h this wk").closest("a");
    expect(weeklyLink).toHaveAttribute("href", "/streak");
  });

  it("renders loading skeleton placeholders when streakLoading is true", () => {
    const { container } = render(
      <RoomMissionCompanion
        activeGoal={mockGoal}
        isStudying={false}
        streakLoading={true}
      />
    );

    const skeletonElements = container.querySelectorAll(".animate-pulse");
    expect(skeletonElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("0d streak")).not.toBeInTheDocument();
  });
});
