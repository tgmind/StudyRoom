import { describe, it, expect } from "vitest";
import {
  detectLiveRivalry,
  formatRivalryGap,
  getLiveMemberWeeklySeconds,
  MAX_RIVALRY_GAP_SECONDS,
} from "@/lib/time/rivalry";
import { UserProfile } from "@/lib/supabase/types";

describe("Live Study Rivalry Detection Engine", () => {
  const createMockMember = (
    id: string,
    displayName: string,
    status: "studying" | "break" | "offline",
    weeklySeconds: number,
    snapshotSeconds = 0,
    lastResumedAt: string | null = null
  ): UserProfile => ({
    id,
    display_name: displayName,
    avatar_url: null,
    current_status: status,
    current_focus: null,
    session_start_time: lastResumedAt,
    last_resumed_at: lastResumedAt,
    break_started_at: null,
    active_study_seconds_snapshot: snapshotSeconds,
    has_achiever_badge: false,
    created_at: "2026-09-01T00:00:00Z",
    weekly_study_seconds: weeklySeconds,
  });

  it("calculates live weekly study seconds correctly", () => {
    const fixedNow = new Date("2026-09-03T10:10:00.000Z");
    const member = createMockMember(
      "u1",
      "Alice",
      "studying",
      36000, // 10h past weekly
      0,
      "2026-09-03T10:00:00.000Z" // active 10 minutes (600s)
    );

    const totalLiveWeekly = getLiveMemberWeeklySeconds(member, fixedNow);
    expect(totalLiveWeekly).toBe(36000 + 600); // 36600s (10h 10m)
  });

  it("formats rivalry gaps cleanly and compactly", () => {
    expect(formatRivalryGap(45)).toBe("45s");
    expect(formatRivalryGap(125)).toBe("2m 5s");
    expect(formatRivalryGap(3540)).toBe("59m 0s");
    expect(formatRivalryGap(3600)).toBe("1h 0m");
  });

  it("detects a 2-member rivalry when gap is <= 1 hour (3600s)", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 34200); // 9.5h (gap = 30m = 1800s)

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).not.toBeNull();
    expect(rivalry?.isTrio).toBe(false);
    expect(rivalry?.rivalMembers).toHaveLength(2);
    expect(rivalry?.rivalMembers[0].id).toBe("u1");
    expect(rivalry?.rivalMembers[1].id).toBe("u2");
    expect(rivalry?.primaryGapSeconds).toBe(1800);
    expect(rivalry?.formattedGap).toBe("30m 0s");
  });

  it("returns null when gap exceeds 1 hour (> 3600s)", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 32300); // gap = 3700s (> 1h)

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("detects a 3-member rivalry when all 3 members span <= 1 hour", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 34500); // 9h 35m
    const memberC = createMockMember("u3", "Charlie", "studying", 33000); // 9h 10m (span = 50m <= 1h)

    const rivalry = detectLiveRivalry([memberA, memberB, memberC], fixedNow);
    expect(rivalry).not.toBeNull();
    expect(rivalry?.isTrio).toBe(true);
    expect(rivalry?.rivalMembers).toHaveLength(3);
    expect(rivalry?.rivalMembers.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("automatically readjusts from Trio to Pair when third member exceeds 1 hour", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 34500); // 9h 35m (gap = 25m <= 1h)
    const memberC = createMockMember("u3", "Charlie", "studying", 32000); // 8h 53m (span = 4000s > 1h)

    const rivalry = detectLiveRivalry([memberA, memberB, memberC], fixedNow);
    expect(rivalry).not.toBeNull();
    // Charlie dropped out because span > 1h; Alice & Bob remain in a 2-member duel
    expect(rivalry?.isTrio).toBe(false);
    expect(rivalry?.rivalMembers).toHaveLength(2);
    expect(rivalry?.rivalMembers.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("excludes offline members from qualifying for rivalry", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000);
    const memberB = createMockMember("u2", "Bob", "offline", 35500); // within 1h but offline!

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("formats tied gap as 'Tied (0s)'", () => {
    expect(formatRivalryGap(0)).toBe("Tied (0s)");
  });

  it("incorporates currentUserElapsedSeconds for current user", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    // Alice has 30,000s past weekly, but 2,000s elapsed locally in active session
    const memberA = createMockMember("u1", "Alice", "studying", 30000);
    const memberB = createMockMember("u2", "Bob", "studying", 31500);

    // Without local override: Alice 30,000 vs Bob 31,500 (gap 1,500s)
    const rivalryWithoutLocal = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalryWithoutLocal?.primaryGapSeconds).toBe(1500);

    // With local override for Alice: Alice = 30,000 + 2,000 = 32,000. Bob = 31,500. Gap = 500s!
    const rivalryWithLocal = detectLiveRivalry([memberA, memberB], fixedNow, "u1", 2000);
    expect(rivalryWithLocal?.primaryGapSeconds).toBe(500);
    expect(rivalryWithLocal?.rivalMembers[0].id).toBe("u1"); // Alice leads!
  });

  it("handles exact boundary crossing at 3600s vs 3601s", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000);

    // Exactly 3600s gap: qualified!
    const memberB3600 = createMockMember("u2", "Bob", "studying", 36000 - MAX_RIVALRY_GAP_SECONDS);
    const rivalry3600 = detectLiveRivalry([memberA, memberB3600], fixedNow);
    expect(rivalry3600).not.toBeNull();
    expect(rivalry3600?.primaryGapSeconds).toBe(3600);

    // Exactly 3601s gap: disqualified (dissolved)!
    const memberB3601 = createMockMember("u2", "Bob", "studying", 36000 - MAX_RIVALRY_GAP_SECONDS - 1);
    const rivalry3601 = detectLiveRivalry([memberA, memberB3601], fixedNow);
    expect(rivalry3601).toBeNull();
  });

  it("freezes study time when rival is on break, remaining in rivalry if within 1 hour", () => {
    const fixedNow = new Date("2026-09-03T10:30:00.000Z");
    // Alice is studying: past 36,000s + active 1,800s (since 10:00) = 37,800s
    const memberA = createMockMember("u1", "Alice", "studying", 36000, 0, "2026-09-03T10:00:00.000Z");

    // Bob went on break at 10:20 with 1,200s active study accrued in snapshot
    const memberB = createMockMember(
      "u2",
      "Bob",
      "break",
      35000, // past weekly
      1200,  // accrued snapshot
      "2026-09-03T10:00:00.000Z"
    );
    memberB.break_started_at = "2026-09-03T10:20:00.000Z";

    // Bob's weekly time = 35,000 + 1,200 = 36,200s (frozen at break start!)
    const liveBobWeekly = getLiveMemberWeeklySeconds(memberB, fixedNow);
    expect(liveBobWeekly).toBe(36200);

    // Alice = 37,800. Bob = 36,200. Gap = 1,600s <= 3600s -> rivalry active!
    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).not.toBeNull();
    expect(rivalry?.primaryGapSeconds).toBe(1600);
  });

  it("automatically dissolves rivalry when studying rival pulls ahead > 1 hour while other is on break", () => {
    const fixedNow = new Date("2026-09-03T11:05:00.000Z");
    // Alice studied for 65 minutes (3,900s). Weekly = 36,000 + 3,900 = 39,900s
    const memberA = createMockMember("u1", "Alice", "studying", 36000, 0, "2026-09-03T10:00:00.000Z");

    // Bob took a break at 10:10 with only 600s accrued. Weekly = 35,600 + 600 = 36,200s
    const memberB = createMockMember(
      "u2",
      "Bob",
      "break",
      35600,
      600,
      "2026-09-03T10:00:00.000Z"
    );
    memberB.break_started_at = "2026-09-03T10:10:00.000Z";

    // Gap = 39,900 - 36,200 = 3,700s > 3,600s -> rivalry dissolves immediately!
    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("disqualifies a member whose break has expired (>= 1 hour) from rivalry", () => {
    // 61 minutes after Bob started break
    const fixedNow = new Date("2026-09-03T11:01:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000, 0, "2026-09-03T10:00:00.000Z");

    const memberB = createMockMember(
      "u2",
      "Bob",
      "break",
      36000,
      600,
      "2026-09-03T10:00:00.000Z"
    );
    memberB.break_started_at = "2026-09-03T10:00:00.000Z"; // 61 minutes ago!

    // Bob's break is expired -> effective status is 'offline'
    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("resumes weekly accumulation when rival resumes from break", () => {
    const fixedNow = new Date("2026-09-03T10:35:00.000Z");
    // Bob had 1,200s snapshot from before break, and resumed at 10:30 (active 5m = 300s since resume)
    const memberB = createMockMember(
      "u2",
      "Bob",
      "studying",
      35000,
      1200,
      "2026-09-03T10:30:00.000Z" // last_resumed_at
    );
    memberB.break_started_at = null;

    // Total session elapsed = 1,200 (snapshot) + 300 (resumed) = 1,500s
    // Total weekly = 35,000 + 1,500 = 36,500s
    const liveBobWeekly = getLiveMemberWeeklySeconds(memberB, fixedNow);
    expect(liveBobWeekly).toBe(36500);
  });
});

