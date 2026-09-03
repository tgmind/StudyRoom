import { describe, it, expect } from "vitest";
import {
  detectLiveRivalry,
  detectLiveRivalries,
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

  describe("Multiple Concurrent Rivalries", () => {
    it("detects two independent rivalries and orders them descending by leader study time", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Rivalry 1: Alice (20h = 72000s) and Bob (19.5h = 70200s) -> gap 1800s <= 3600s
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 70200);

      // Rivalry 2: Charlie (12h = 43200s) and David (11.5h = 41400s) -> gap 1800s <= 3600s
      const memberC = createMockMember("u3", "Charlie", "studying", 43200);
      const memberD = createMockMember("u4", "David", "studying", 41400);

      // Standalone non-rival member: Emma (5h = 18000s)
      const memberE = createMockMember("u5", "Emma", "studying", 18000);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD, memberE], fixedNow);

      expect(rivalries).toHaveLength(2);

      // Top rivalry: Alice vs Bob
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u1", "u2"]);
      expect(rivalries[0].leaderWeeklySeconds).toBe(72000);
      expect(rivalries[0].primaryGapSeconds).toBe(1800);

      // Second rivalry below it: Charlie vs David
      expect(rivalries[1].rivalMembers.map((m) => m.id)).toEqual(["u3", "u4"]);
      expect(rivalries[1].leaderWeeklySeconds).toBe(43200);
      expect(rivalries[1].primaryGapSeconds).toBe(1800);
    });

    it("enforces mutual exclusivity so members are not duplicated in multiple rivalries", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // All 4 members are close: Alice (20h), Bob (19.8h), Charlie (19.5h), David (19.3h)
      // Trio rule: Alice, Bob, Charlie form Trio (span 30m <= 1h)
      // David is left over; cannot steal members from the existing rivalry
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 71280);
      const memberC = createMockMember("u3", "Charlie", "studying", 70200);
      const memberD = createMockMember("u4", "David", "studying", 69480);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD], fixedNow);

      expect(rivalries).toHaveLength(1);
      expect(rivalries[0].isTrio).toBe(true);
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);

      // Member D is NOT in any rivalry
      const allRivalIds = new Set(rivalries.flatMap((r) => r.rivalMembers.map((m) => m.id)));
      expect(allRivalIds.has("u4")).toBe(false);
    });

    it("handles 1 trio rivalry and 1 pair rivalry simultaneously", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Trio: A (25h), B (24.7h), C (24.3h) -> span 42m <= 1h
      const memberA = createMockMember("u1", "Alice", "studying", 90000);
      const memberB = createMockMember("u2", "Bob", "studying", 88920);
      const memberC = createMockMember("u3", "Charlie", "studying", 87480);

      // Pair: D (10h), E (9.5h) -> gap 30m <= 1h
      const memberD = createMockMember("u4", "David", "studying", 36000);
      const memberE = createMockMember("u5", "Emma", "studying", 34200);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD, memberE], fixedNow);

      expect(rivalries).toHaveLength(2);
      expect(rivalries[0].isTrio).toBe(true);
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);

      expect(rivalries[1].isTrio).toBe(false);
      expect(rivalries[1].rivalMembers.map((m) => m.id)).toEqual(["u4", "u5"]);
    });

    it("dissolves one rivalry independently when its gap exceeds 1h, keeping the other active", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Group 1: Alice (20h) and Bob (18.5h) -> gap 1.5h (5400s > 3600s) -> DISSOLVED!
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 66600);

      // Group 2: Charlie (12h) and David (11.8h) -> gap 12m (720s <= 3600s) -> ACTIVE!
      const memberC = createMockMember("u3", "Charlie", "studying", 43200);
      const memberD = createMockMember("u4", "David", "studying", 42480);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD], fixedNow);

      // Only Group 2 qualifies
      expect(rivalries).toHaveLength(1);
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u3", "u4"]);
    });
  });
});

