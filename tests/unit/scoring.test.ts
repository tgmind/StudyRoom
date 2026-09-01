import { describe, it, expect } from "vitest";
import { calculateLeaderboardScore } from "@/lib/scoring/engine";

describe("Normalized 50/30/20 Leaderboard Scoring Engine", () => {
  it("calculates exact normalized 50/30/20 scores", () => {
    // User study mins = 600 (10h), max group mins = 600 (100% study score -> 50 pts)
    // Goal completion = 10 / 10 = 100% (100% goal score -> 30 pts)
    // Streak = 7 days (100% streak score -> 20 pts)
    // Total = 50 + 30 + 20 = 100.0
    const res = calculateLeaderboardScore(600, 600, 10, 10, 7);
    expect(res.composite_score).toBe(100.0);
    expect(res.study_hours_score).toBe(100.0);
    expect(res.goal_completion_score).toBe(100.0);
    expect(res.consistency_score).toBe(100.0);
  });

  it("handles partial scores correctly", () => {
    // User study mins = 300 (50% relative to 600 peak -> 25 pts out of 50)
    // Goal completion = 5 / 10 = 50% (50% goal score -> 15 pts out of 30)
    // Streak = 3.5 / 7 days (50% streak score -> 10 pts out of 20)
    // Total = 25 + 15 + 10 = 50.0
    const res = calculateLeaderboardScore(300, 600, 5, 10, 3.5);
    expect(res.composite_score).toBe(50.0);
  });

  it("caps components at 100% and handles zero tasks without crashing", () => {
    const res = calculateLeaderboardScore(800, 600, 0, 0, 10);
    expect(res.study_hours_score).toBe(100.0);
    expect(res.goal_completion_score).toBe(0.0);
    expect(res.consistency_score).toBe(100.0);
    expect(res.composite_score).toBe(70.0); // 50 + 0 + 20
  });
});
