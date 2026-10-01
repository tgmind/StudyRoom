import { describe, it, expect } from "vitest";
import { UserProfile } from "@/lib/supabase/types";
import {
  calculateLeaderboardScore,
  computeLiveLeaderboardMap,
} from "@/lib/scoring/engine";
import {
  detectLiveRivalries,
  canFormRankClashPair,
  canFormStudyTimePair,
} from "@/lib/time/rivalry";

describe("StudyRoom — Leaderboard & Rivalry Arena Scoring Convergence", () => {
  // Exact values extracted from user screenshots:
  // Tung Tung (Rank #1): 26h 51m (1611m), 19/19 goals, 3d streak -> 88.6 pts
  // Ritesh (Rank #2): 15h 14m (914m), 12/15 goals, 4d streak -> 63.8 pts
  // Aditya (Rank #3): 16h 44m (1004m), 5/7 goals, 4d streak -> 57.2 pts
  // Subodh (Rank #4): 12h 3m (723m), 5/8 goals, 3d streak -> 44.5 pts
  // Raunak (Rank #5): 10h 13m (613m), 2/3 goals, 3d streak -> 38.0 pts
  // Pallavi (Rank #6): 7h 39m (459m), 5/7 goals, 3d streak -> 37.4 pts
  const maxStudyMinutes = 1611;
  const maxCompleted = 19;

  const createProductionMembers = (): UserProfile[] => [
    {
      id: "user-tungtung",
      display_name: "Tung Tung",
      avatar_url: null,
      current_status: "offline",
      session_start_time: null,
      current_focus: null,
      has_achiever_badge: false,
      weekly_study_seconds: 1611 * 60,
      total_study_minutes: 1611,
      completed_tasks: 19,
      total_tasks: 19,
      streak_days: 3,
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "user-ritesh",
      display_name: "Ritesh",
      avatar_url: null,
      current_status: "offline",
      session_start_time: null,
      current_focus: null,
      has_achiever_badge: false,
      weekly_study_seconds: 914 * 60,
      total_study_minutes: 914,
      completed_tasks: 12,
      total_tasks: 15,
      streak_days: 4,
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "user-aditya",
      display_name: "Aditya",
      avatar_url: null,
      current_status: "offline",
      session_start_time: null,
      current_focus: null,
      has_achiever_badge: true,
      weekly_study_seconds: 1004 * 60,
      total_study_minutes: 1004,
      completed_tasks: 5,
      total_tasks: 7,
      streak_days: 4,
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "user-subodh",
      display_name: "Subodh",
      avatar_url: null,
      current_status: "studying",
      session_start_time: "2026-10-01T11:30:00.000Z",
      current_focus: null,
      has_achiever_badge: false,
      weekly_study_seconds: 723 * 60,
      total_study_minutes: 723,
      completed_tasks: 5,
      total_tasks: 8,
      streak_days: 3,
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "user-raunak",
      display_name: "Raunak",
      avatar_url: null,
      current_status: "offline",
      session_start_time: null,
      current_focus: null,
      has_achiever_badge: false,
      weekly_study_seconds: 613 * 60,
      total_study_minutes: 613,
      completed_tasks: 2,
      total_tasks: 3,
      streak_days: 3,
      created_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "user-pallavi",
      display_name: "Pallavi",
      avatar_url: null,
      current_status: "studying",
      session_start_time: "2026-10-01T11:45:00.000Z",
      current_focus: null,
      has_achiever_badge: false,
      weekly_study_seconds: 459 * 60,
      total_study_minutes: 459,
      completed_tasks: 5,
      total_tasks: 7,
      streak_days: 3,
      created_at: "2026-09-01T00:00:00.000Z",
    },
  ];

  it("calculates exact 50/30/20 Dual-Pillar scores matching production leaderboard screenshot", () => {
    // Subodh: 723m, 5/8 tasks, 3-day streak -> 44.5 pts
    const subodhScore = calculateLeaderboardScore(723, maxStudyMinutes, 5, 8, 3, maxCompleted);
    expect(subodhScore.composite_score).toBe(44.5);
    expect(subodhScore.study_hours_score).toBe(44.9);
    expect(subodhScore.goal_completion_score).toBe(45.0);
    expect(subodhScore.consistency_score).toBe(42.9);

    // Raunak: 613m, 2/3 tasks, 3-day streak -> 38.0 pts
    const raunakScore = calculateLeaderboardScore(613, maxStudyMinutes, 2, 3, 3, maxCompleted);
    expect(raunakScore.composite_score).toBe(38.0);
    expect(raunakScore.study_hours_score).toBe(38.1);
    expect(raunakScore.goal_completion_score).toBe(34.7);
    expect(raunakScore.consistency_score).toBe(42.9);

    // Pallavi: 459m, 5/7 tasks, 3-day streak -> 37.4 pts
    const pallaviScore = calculateLeaderboardScore(459, maxStudyMinutes, 5, 7, 3, maxCompleted);
    expect(pallaviScore.composite_score).toBe(37.4);
    expect(pallaviScore.study_hours_score).toBe(28.5);
    expect(pallaviScore.goal_completion_score).toBe(48.6);
    expect(pallaviScore.consistency_score).toBe(42.9);

    // Score gap between Subodh and Pallavi is exactly 7.1 pts
    const gap = Math.round((subodhScore.composite_score - pallaviScore.composite_score) * 10) / 10;
    expect(gap).toBe(7.1);
  });

  it("computes live leaderboard map with correct authoritative ranks and converged scores", () => {
    const members = createProductionMembers();
    // Neutralize live session elapsed time for static baseline comparison
    const staticNow = new Date("2026-10-01T11:30:00.000Z");
    const liveMap = computeLiveLeaderboardMap(members, staticNow);

    const subodhLive = liveMap.get("user-subodh");
    const raunakLive = liveMap.get("user-raunak");
    const pallaviLive = liveMap.get("user-pallavi");

    expect(subodhLive).toBeDefined();
    expect(subodhLive?.liveScore).toBe(44.5);
    expect(subodhLive?.liveRank).toBe(4);

    expect(raunakLive).toBeDefined();
    expect(raunakLive?.liveScore).toBe(38.0);
    expect(raunakLive?.liveRank).toBe(5);

    expect(pallaviLive).toBeDefined();
    expect(pallaviLive?.liveScore).toBe(37.4);
    expect(pallaviLive?.liveRank).toBe(6);
  });

  it("proves Subodh and Pallavi match in RANK_CLASH mode with 7.1 pts gap", () => {
    const members = createProductionMembers();
    const staticNow = new Date("2026-10-01T11:30:00.000Z");
    const liveMap = computeLiveLeaderboardMap(members, staticNow);

    // Enrich active members (Subodh and Pallavi) with live scores and ranks
    const activeMembers = members
      .filter((m) => m.current_status === "studying")
      .map((m) => ({
        ...m,
        leaderboard_score: liveMap.get(m.id)?.liveScore,
        leaderboard_rank: liveMap.get(m.id)?.liveRank,
      }));

    // Verify distance and proximity
    const subodhCand = {
      member: activeMembers.find((m) => m.id === "user-subodh")!,
      weeklySeconds: 723 * 60,
    };
    const pallaviCand = {
      member: activeMembers.find((m) => m.id === "user-pallavi")!,
      weeklySeconds: 459 * 60,
    };

    // Cannot form STUDY_TIME pair because 4.4h gap >> 10m threshold
    expect(canFormStudyTimePair(subodhCand, pallaviCand)).toBe(false);

    // Correctly forms RANK_CLASH pair because distance = |4 - 6| = 2 and gap 7.1 <= 8.0 pts
    expect(canFormRankClashPair(subodhCand, pallaviCand)).toBe(true);

    const rivalries = detectLiveRivalries(activeMembers, staticNow);
    expect(rivalries).toHaveLength(1);

    const r = rivalries[0];
    expect(r.mode).toBe("RANK_CLASH");
    expect(r.isTrio).toBe(false);
    expect(r.rivalMembers[0].id).toBe("user-subodh");
    expect(r.rivalMembers[0].display_name).toBe("Subodh");
    expect(r.rivalMembers[1].id).toBe("user-pallavi");
    expect(r.rivalMembers[1].display_name).toBe("Pallavi");
    expect(r.leaderScore).toBe(44.5);
    expect(r.scoreGap).toBe(7.1);
    expect(r.formattedGap).toBe("7.1 pts");
  });

  it("ticks score live as study time advances during an active session", () => {
    const members = createProductionMembers();
    const sessionStart = new Date("2026-10-01T12:00:00.000Z");

    // Member starts studying at sessionStart with 723m baseline
    members.find((m) => m.id === "user-subodh")!.session_start_time = sessionStart.toISOString();

    // At session start: 723m -> 44.5 pts
    const mapT0 = computeLiveLeaderboardMap(members, sessionStart);
    const scoreT0 = mapT0.get("user-subodh")?.liveScore;
    expect(scoreT0).toBe(44.5);

    // After 60 minutes of live studying (now 13:00): Subodh has 723 + 60 = 783m
    const t60 = new Date("2026-10-01T13:00:00.000Z");
    const mapT60 = computeLiveLeaderboardMap(members, t60);
    const subodhT60 = mapT60.get("user-subodh");

    // Study minutes increased to 783
    expect(subodhT60?.liveStudyMinutes).toBe(783);
    // Score increased from 44.5 due to additional study hours pillar
    expect(subodhT60?.liveScore).toBeGreaterThan(44.5!);
    expect(subodhT60?.studyHoursScore).toBeGreaterThan(44.9);
  });

  it("updates live composite score immediately when daily_goals are completed", () => {
    const members = createProductionMembers();
    const staticNow = new Date("2026-10-01T11:30:00.000Z");

    const mapBefore = computeLiveLeaderboardMap(members, staticNow);
    expect(mapBefore.get("user-subodh")?.liveScore).toBe(44.5);

    // User checks off 2 more goals (completed_tasks: 5 -> 7)
    const updatedMembers = members.map((m) =>
      m.id === "user-subodh" ? { ...m, completed_tasks: 7 } : m
    );

    const mapAfter = computeLiveLeaderboardMap(updatedMembers, staticNow);
    const subodhAfter = mapAfter.get("user-subodh");

    // Composite score increases from 44.5 to 49.9
    expect(subodhAfter?.liveScore).toBe(49.9);
    expect(subodhAfter?.goalScore).toBe(63.0);
  });
});
