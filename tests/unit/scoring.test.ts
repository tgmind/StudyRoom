import { describe, it, expect } from "vitest";
import { calculateLeaderboardScore } from "@/lib/scoring/engine";

describe("Normalized 50/30/20 Leaderboard Scoring Engine (Proposal 1 Dual-Pillar Goal Index)", () => {
  it("calculates exact normalized 50/30/20 scores for maximum achievement", () => {
    // User study mins = 600 (10h), max group mins = 600 (100% study score -> 50 pts)
    // Goal completion = 15 / 15 (100% volume, 100% discipline -> 30 pts)
    // Streak = 7 days (100% streak score -> 20 pts)
    // Total = 50 + 30 + 20 = 100.0
    const res = calculateLeaderboardScore(600, 600, 15, 15, 7, 15);
    expect(res.composite_score).toBe(100.0);
    expect(res.study_hours_score).toBe(100.0);
    expect(res.goal_completion_score).toBe(100.0);
    expect(res.consistency_score).toBe(100.0);
    expect(res.volume_score).toBe(100.0);
    expect(res.discipline_score).toBe(100.0);
  });

  it("CRITICAL: ensures student completing 4/6 goals decisively beats student completing 1/1 goal", () => {
    // Both students study same hours and have same streak
    // Max group completed tasks is 6
    const studentA_gamer = calculateLeaderboardScore(300, 600, 1, 1, 3, 6);
    const studentB_striver = calculateLeaderboardScore(300, 600, 4, 6, 3, 6);

    // Student A (1 set, 1 done):
    // Volume: (1 / 6) * 100 = 16.7%
    // Discipline: (1 / 3) * 100 = 33.3% (3-task minimum commitment benchmark prevents gaming)
    // Goal Score: 0.6 * 16.67 + 0.4 * 33.33 = 23.3% -> 7.0 pts out of 30
    expect(studentA_gamer.goal_completion_score).toBe(23.3);

    // Student B (6 set, 4 done):
    // Volume: (4 / 6) * 100 = 66.7%
    // Discipline: (4 / 6) * 100 = 66.7%
    // Goal Score: 0.6 * 66.67 + 0.4 * 66.67 = 66.7% -> 20.0 pts out of 30
    expect(studentB_striver.goal_completion_score).toBe(66.7);

    // Student B decisively beats Student A in goal component and overall score!
    expect(studentB_striver.goal_completion_score).toBeGreaterThan(studentA_gamer.goal_completion_score);
    expect(studentB_striver.composite_score).toBeGreaterThan(studentA_gamer.composite_score);
    // Difference is ~13.0 leaderboard points
    expect(studentB_striver.composite_score - studentA_gamer.composite_score).toBeCloseTo(13.0, 0);
  });

  it("rewards the full-week achiever (20 set, 16 done) with high volume and discipline", () => {
    // Target is capped at 15
    const res = calculateLeaderboardScore(600, 600, 16, 20, 7, 16);
    expect(res.volume_score).toBe(100.0); // 16/15 capped at 100%
    expect(res.discipline_score).toBe(80.0); // 16/20 = 80%
    // Goal score = 0.6 * 100 + 0.4 * 80 = 92.0%
    expect(res.goal_completion_score).toBe(92.0);
    // 50 (hours) + 0.3 * 92 (27.6) + 20 (streak) = 97.6
    expect(res.composite_score).toBe(97.6);
  });

  it("handles partial scores correctly across all three components", () => {
    // User study mins = 300 (50% relative to 600 peak -> 25 pts out of 50)
    // Streak = 3.5 / 7 days (50% streak score -> 10 pts out of 20)
    // Completed 3/6 tasks with target 6:
    // Volume: 3/6 = 50%, Discipline: 3/6 = 50% -> Goal Score = 50% (15 pts out of 30)
    // Total = 25 + 15 + 10 = 50.0
    const res = calculateLeaderboardScore(300, 600, 3, 6, 3.5, 6);
    expect(res.study_hours_score).toBe(50.0);
    expect(res.goal_completion_score).toBe(50.0);
    expect(res.consistency_score).toBe(50.0);
    expect(res.composite_score).toBe(50.0);
  });

  it("caps components at 100% and handles zero tasks safely without crashing", () => {
    const res = calculateLeaderboardScore(800, 600, 0, 0, 10);
    expect(res.study_hours_score).toBe(100.0);
    expect(res.goal_completion_score).toBe(0.0);
    expect(res.consistency_score).toBe(100.0);
    expect(res.composite_score).toBe(70.0); // 50 + 0 + 20
  });

  it("dynamically bounds weekly target between 3 and 15 tasks", () => {
    // If group has 0 completed tasks, target is at least 3
    const resLow = calculateLeaderboardScore(100, 100, 1, 3, 1, 0);
    expect(resLow.volume_score).toBeCloseTo(33.3, 1);

    // If group has 50 completed tasks, target is capped at 15
    const resHigh = calculateLeaderboardScore(100, 100, 15, 15, 1, 50);
    expect(resHigh.volume_score).toBe(100.0);
  });
});
