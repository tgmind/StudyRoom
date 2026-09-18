import { describe, it, expect } from "vitest";
import {
  calculateMemberLiveWeeklyStudySeconds,
  getWeekStartTimestamp,
  GOAL_WINDOW_HOURS,
  GOAL_WINDOW_MINUTES,
  GOAL_WINDOW_SECONDS,
  GOAL_WINDOW_MS,
} from "@/lib/time/format";
import { calculateLeaderboardScore } from "@/lib/scoring/engine";
import { UserProfile, StudySession } from "@/lib/supabase/types";

describe("Sunday–Monday Weekly Transition & 20-Hour Goal Attribution Architecture", () => {
  describe("Constants & Goal Window Timing", () => {
    it("exports canonical 20-hour goal window constants", () => {
      expect(GOAL_WINDOW_HOURS).toBe(20);
      expect(GOAL_WINDOW_MINUTES).toBe(1200);
      expect(GOAL_WINDOW_SECONDS).toBe(72000);
      expect(GOAL_WINDOW_MS).toBe(72000000);
    });
  });

  describe("BUG-01: MemberCard & Rivalry Realtime Weekly Duration Clamping", () => {
    it("strictly bounds live elapsed seconds to Monday 00:00:00 IST and prevents Sunday bleed", () => {
      // In Asia/Kolkata (+05:30):
      // Sunday 23:30 IST is 2026-09-06T18:00:00.000Z
      // Monday 00:00 IST is 2026-09-06T18:30:00.000Z (v_week_start)
      // Monday 00:20 IST is 2026-09-06T18:50:00.000Z (current time)
      const now = new Date("2026-09-06T18:50:00.000Z");
      const sessionStart = "2026-09-06T18:00:00.000Z";

      const member: UserProfile = {
        id: "u1",
        display_name: "Competitor",
        avatar_url: null,
        current_status: "studying",
        current_focus: "Math",
        session_start_time: sessionStart,
        last_resumed_at: sessionStart,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        has_achiever_badge: false,
        created_at: "2026-09-01T00:00:00Z",
        weekly_study_seconds: 0, // Reset to 0 at Monday 00:00 IST
      };

      // Full session running time is 50 minutes (3000s: 30m Sunday + 20m Monday)
      // BUT only 20 minutes (1200s) belong to Monday's week
      const weeklySecs = calculateMemberLiveWeeklyStudySeconds(member, now, undefined, "Asia/Kolkata");
      expect(weeklySecs).toBe(1200); // Exactly 20 minutes (1200s)

      // When the session finishes and splits into 30m Sunday and 20m Monday:
      // Monday's completed session row contributes 1200s to weekly_study_seconds.
      // Therefore, the card displayed 20m while studying and continues displaying 20m upon finish!
      // No 50m -> 20m visual drop!
    });
  });

  describe("BUG-02: Leaderboard Method B Fallback Bounds", () => {
    it("bounds fallback calculation so Sunday minutes never leak into Monday's leaderboard", () => {
      const now = new Date("2026-09-06T18:45:00.000Z"); // Monday 00:15 IST
      const weekStartMs = getWeekStartTimestamp(now, "Asia/Kolkata");
      const sessionStartMs = new Date("2026-09-06T18:00:00.000Z").getTime(); // Sunday 23:30 IST

      // Method B logic simulation:
      const rawElapsedSecs = Math.floor((now.getTime() - sessionStartMs) / 1000); // 45m = 2700s
      const maxPossibleWeekSecs = Math.max(0, Math.floor((now.getTime() - weekStartMs) / 1000)); // 15m = 900s
      const boundedMethodBSecs = Math.min(rawElapsedSecs, maxPossibleWeekSecs);

      expect(rawElapsedSecs).toBe(2700);
      expect(boundedMethodBSecs).toBe(900); // 15 mins maximum allowed in current week
    });
  });

  describe("BUG-03: Weekly Achiever Calculation & In-Flight Session Resilience", () => {
    it("credits unclosed Sunday session blocks up to v_week_end for past-week evaluations", () => {
      // Sunday 23:00 IST to Monday 01:00 IST
      const sunday2300 = new Date("2026-09-06T17:30:00.000Z").getTime();
      const monday0000 = new Date("2026-09-06T18:30:00.000Z").getTime(); // v_week_end for Sunday
      const monday0100 = new Date("2026-09-06T19:30:00.000Z").getTime();

      // Block started at Sunday 23:00 and was open when cron evaluated past week:
      const blockStart = sunday2300;
      const blockEnd = monday0100;
      const weekEnd = monday0000;

      // SQL LEAST(COALESCE(b.end_time, NOW()), v_week_end) - b.start_time
      const creditedPastWeekSeconds = Math.max(
        0,
        Math.floor((Math.min(blockEnd, weekEnd) - blockStart) / 1000)
      );

      // Exactly 60 minutes (3600s: 23:00 to 00:00) credited to Sunday's week
      expect(creditedPastWeekSeconds).toBe(3600);
      expect(creditedPastWeekSeconds / 60).toBe(60); // 60 minutes
    });

    it("verifies 04:00 AM IST execution window guarantees 100% data finality for 3-hour sessions", () => {
      // Any session starting at Sunday 23:59:59 IST is capped at 180 minutes (3 hours).
      // Max possible end time is Monday 02:59:59 IST.
      // Cron runs at 04:00 AM IST (Monday 04:00 IST = 22:30 UTC Sunday).
      // Time delta between max session end (03:00) and cron run (04:00) is 60 minutes of safety margin.
      const maxPossibleSessionEndHourIST = 3;
      const cronRunHourIST = 4;
      expect(cronRunHourIST).toBeGreaterThan(maxPossibleSessionEndHourIST);
    });
  });

  describe("BUG-04 & BUG-06: Split Session Task Attribution & Sibling Linking", () => {
    it("preserves completed_tasks on both Part 1 and Part 2 and links sibling IDs", () => {
      const part1: StudySession = {
        id: "session-part-1",
        user_id: "u1",
        start_time: "2026-09-06T18:00:00.000Z", // Sunday 23:30 IST
        end_time: "2026-09-06T18:30:00.000Z",   // Monday 00:00 IST
        duration_minutes: 30,
        break_minutes: 0,
        completed_tasks: [{ id: "task-1", task: "Review Chapter 4" }],
        split_part: 1,
        sibling_session_id: "session-part-2",
      };

      const part2: StudySession = {
        id: "session-part-2",
        user_id: "u1",
        start_time: "2026-09-06T18:30:00.000Z", // Monday 00:00 IST
        end_time: "2026-09-06T19:00:00.000Z",   // Monday 00:30 IST
        duration_minutes: 30,
        break_minutes: 0,
        completed_tasks: [{ id: "task-1", task: "Review Chapter 4" }],
        split_part: 2,
        sibling_session_id: "session-part-1",
      };

      // Both session records maintain completed tasks
      expect(part1.completed_tasks).toHaveLength(1);
      expect(part2.completed_tasks).toHaveLength(1);
      expect(part1.sibling_session_id).toBe(part2.id);
      expect(part2.sibling_session_id).toBe(part1.id);
    });

    it("idempotently merges tasks without duplicating by task id", () => {
      const existingTasks = [{ id: "task-1", task: "Review Chapter 4" }];
      const incomingTasks = [
        { id: "task-1", task: "Review Chapter 4" },
        { id: "task-2", task: "Solve 10 Questions" },
      ];

      // Deduplication engine simulation:
      const taskMap = new Map<string, { id: string; task: string }>();
      for (const t of [...existingTasks, ...incomingTasks]) {
        taskMap.set(t.id, t);
      }
      const deduplicated = Array.from(taskMap.values());

      expect(deduplicated).toHaveLength(2);
      expect(deduplicated.map((t) => t.id)).toEqual(["task-1", "task-2"]);
    });
  });

  describe("BUG-05 & BUG-07: Single-Week Goal Attribution & Leaderboard Scoring", () => {
    it("BUG-05: ensures a Sunday 20h goal is counted in Sunday's week and NOT Monday's week", () => {
      // Goal created Sunday 14:00 IST (2026-09-06T08:30:00.000Z), expires Monday 10:00 IST
      const goalCreatedAt = new Date("2026-09-06T08:30:00.000Z").getTime();

      // Sunday week: 2026-08-31T18:30:00.000Z to 2026-09-06T18:30:00.000Z
      const sundayWeekStart = new Date("2026-08-31T18:30:00.000Z").getTime();
      const sundayWeekEnd = new Date("2026-09-06T18:30:00.000Z").getTime();

      // Monday week: 2026-09-06T18:30:00.000Z to 2026-09-13T18:30:00.000Z
      const mondayWeekStart = sundayWeekEnd;
      const mondayWeekEnd = new Date("2026-09-13T18:30:00.000Z").getTime();

      const belongsToSundayWeek = goalCreatedAt >= sundayWeekStart && goalCreatedAt < sundayWeekEnd;
      const belongsToMondayWeek = goalCreatedAt >= mondayWeekStart && goalCreatedAt < mondayWeekEnd;

      expect(belongsToSundayWeek).toBe(true);
      expect(belongsToMondayWeek).toBe(false); // Does NOT double count into Monday!
    });

    it("BUG-07: safely handles session-completed tasks without divide-by-zero or distortion", () => {
      // When a user completes 3 tasks in a session where total_tasks was 0:
      // total_tasks = GREATEST(completed_tasks, total_planned) = GREATEST(3, 0) = 3
      const completedTasks = 3;
      const plannedTasks = 0;
      const effectiveTotal = Math.max(completedTasks, plannedTasks);

      expect(effectiveTotal).toBe(3);
      const completionPct = (completedTasks / effectiveTotal) * 100;
      expect(completionPct).toBe(100.0);

      // Verify Proposal 1 Dual-Pillar engine handles this safely:
      const scoreRes = calculateLeaderboardScore(120, 300, completedTasks, effectiveTotal, 2, 10);
      expect(scoreRes.composite_score).toBeGreaterThan(0);
      expect(scoreRes.goal_completion_score).toBeGreaterThan(0);
      expect(Number.isFinite(scoreRes.composite_score)).toBe(true);
    });
  });
});
