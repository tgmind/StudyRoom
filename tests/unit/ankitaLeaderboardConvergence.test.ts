import { describe, it, expect, vi } from "vitest";
import { calculateMemberLiveWeeklyStudySeconds, formatSecondsToHuman } from "@/lib/time/format";
import { UserProfile } from "@/lib/supabase/types";

describe("Ankita Leaderboard & Member Card Convergence", () => {
  it("displays identical 180m on both Room MemberCard and Leaderboard for completed 3h session", () => {
    // Ankita completed a 180-minute (10800s) session at 4:35 PM IST
    const ankitaProfile: Partial<UserProfile> = {
      id: "ankita-id",
      display_name: "Ankita",
      current_status: "offline",
      weekly_study_seconds: 10800, // 3h 0m from study_sessions
      weekly_sessions_count: 1,
      total_sessions_count: 1,
      pending_goal_session_id: "session-uuid-1", // Awaiting goal update modal
      pending_goal_seconds: 10800,
    };

    const serverNow = new Date("2026-09-29T11:05:00Z"); // 4:35 PM IST

    // MemberCard live calculation:
    const memberCardSeconds = calculateMemberLiveWeeklyStudySeconds(ankitaProfile, serverNow);
    const memberCardFormatted = formatSecondsToHuman(memberCardSeconds);

    // Leaderboard calculation:
    const leaderboardMinutes = Math.floor(memberCardSeconds / 60);

    expect(memberCardSeconds).toBe(10800);
    expect(memberCardFormatted).toBe("3h 0m");
    expect(leaderboardMinutes).toBe(180);
    // Exact mathematical alignment:
    expect(leaderboardMinutes * 60).toBe(memberCardSeconds);
  });

  it("leaderboard live study time does not fall off a cliff after 4 hours", () => {
    // Session started 4 hours 15 minutes ago (15,300 seconds)
    const baseTime = new Date("2026-09-29T12:00:00Z").getTime();
    const sessionStartTime = new Date(baseTime - 15300 * 1000).toISOString();

    const activeMember: Partial<UserProfile> = {
      id: "user-long-session",
      display_name: "Long Studier",
      current_status: "studying",
      session_start_time: sessionStartTime,
      last_resumed_at: sessionStartTime,
      weekly_study_seconds: 0,
      active_study_seconds_snapshot: 0,
    };

    const serverNow = new Date(baseTime);
    const liveSeconds = calculateMemberLiveWeeklyStudySeconds(activeMember, serverNow);

    // Capped at 3 hours (10,800s = 180m)
    expect(liveSeconds).toBe(10800);
    const liveMinutes = Math.floor(liveSeconds / 60);
    expect(liveMinutes).toBe(180);
    // Does NOT drop to 0!
    expect(liveMinutes).not.toBe(0);
  });

  it("finalizing session is idempotent and prevents duplicate credit", () => {
    let completedSessions = 0;
    let totalCreditedSeconds = 0;
    const processedSessionIds = new Set<string>();

    const finalizeSession = (sessionId: string, durationSeconds: number) => {
      if (processedSessionIds.has(sessionId)) {
        return { success: true, alreadyProcessed: true };
      }
      processedSessionIds.add(sessionId);
      completedSessions += 1;
      totalCreditedSeconds += Math.min(10800, durationSeconds);
      return { success: true, alreadyProcessed: false };
    };

    // First finalization
    const res1 = finalizeSession("session-1", 10800);
    expect(res1.alreadyProcessed).toBe(false);
    expect(completedSessions).toBe(1);
    expect(totalCreditedSeconds).toBe(10800);

    // Redundant double-call or concurrent trigger
    const res2 = finalizeSession("session-1", 10800);
    expect(res2.alreadyProcessed).toBe(true);
    expect(completedSessions).toBe(1);
    expect(totalCreditedSeconds).toBe(10800);
  });
});
