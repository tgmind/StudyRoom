import { describe, it, expect } from "vitest";
import {
  detectLiveRivalry,
  detectLiveRivalries,
  formatRivalryGap,
  getLiveMemberWeeklySeconds,
  MAX_RIVALRY_GAP_SECONDS,
  MIN_RIVALRY_WEEKLY_SECONDS,
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
    expect(formatRivalryGap(540)).toBe("9m 0s");
    expect(formatRivalryGap(600)).toBe("10m 0s");
  });

  it("disqualifies members with less than 3 hours total weekly study time", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    // Alice = 2h 30m (9000s), Bob = 2h 25m (8700s). Gap = 5m <= 10m, but both < 3h (10800s)!
    const memberA = createMockMember("u1", "Alice", "studying", 9000);
    const memberB = createMockMember("u2", "Bob", "studying", 8700);

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("detects a 2-member rivalry when gap is <= 10 minutes (600s) and weekly time >= 3 hours", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h >= 3h
    const memberB = createMockMember("u2", "Bob", "studying", 35700); // 9h 55m (gap = 5m = 300s <= 600s)

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).not.toBeNull();
    expect(rivalry?.isTrio).toBe(false);
    expect(rivalry?.rivalMembers).toHaveLength(2);
    expect(rivalry?.rivalMembers[0].id).toBe("u1");
    expect(rivalry?.rivalMembers[1].id).toBe("u2");
    expect(rivalry?.primaryGapSeconds).toBe(300);
    expect(rivalry?.formattedGap).toBe("5m 0s");
  });

  it("returns null when gap exceeds 10 minutes (> 600s)", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 35300); // gap = 700s (> 10m)

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("detects a 3-member rivalry when all 3 members span <= 10 minutes (600s)", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 35800); // gap = 200s
    const memberC = createMockMember("u3", "Charlie", "studying", 35500); // span = 500s <= 600s

    const rivalry = detectLiveRivalry([memberA, memberB, memberC], fixedNow);
    expect(rivalry).not.toBeNull();
    expect(rivalry?.isTrio).toBe(true);
    expect(rivalry?.rivalMembers).toHaveLength(3);
    expect(rivalry?.rivalMembers.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("automatically readjusts from Trio to Pair when third member exceeds 10 minutes", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000); // 10h
    const memberB = createMockMember("u2", "Bob", "studying", 35800); // gap = 200s <= 600s
    const memberC = createMockMember("u3", "Charlie", "studying", 35300); // span = 700s > 600s

    const rivalry = detectLiveRivalry([memberA, memberB, memberC], fixedNow);
    expect(rivalry).not.toBeNull();
    // Charlie dropped out because span > 10m; Alice & Bob remain in a 2-member duel
    expect(rivalry?.isTrio).toBe(false);
    expect(rivalry?.rivalMembers).toHaveLength(2);
    expect(rivalry?.rivalMembers.map((m) => m.id)).toEqual(["u1", "u2"]);
  });

  it("excludes offline members from qualifying for rivalry", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000);
    const memberB = createMockMember("u2", "Bob", "offline", 35800); // within 10m but offline!

    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("formats tied gap as 'Tied (0s)'", () => {
    expect(formatRivalryGap(0)).toBe("Tied (0s)");
  });

  it("incorporates currentUserElapsedSeconds for current user", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 30000);
    const memberB = createMockMember("u2", "Bob", "studying", 30400);

    // With local override for Alice: Alice = 30,000 + 500 = 30,500. Bob = 30,400. Gap = 100s!
    const rivalryWithLocal = detectLiveRivalry([memberA, memberB], fixedNow, "u1", 500);
    expect(rivalryWithLocal?.primaryGapSeconds).toBe(100);
    expect(rivalryWithLocal?.rivalMembers[0].id).toBe("u1"); // Alice leads!
  });

  it("handles exact boundary crossing at 600s vs 601s", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    const memberA = createMockMember("u1", "Alice", "studying", 36000);

    // Exactly 600s gap: qualified!
    const memberB600 = createMockMember("u2", "Bob", "studying", 36000 - MAX_RIVALRY_GAP_SECONDS);
    const rivalry600 = detectLiveRivalry([memberA, memberB600], fixedNow);
    expect(rivalry600).not.toBeNull();
    expect(rivalry600?.primaryGapSeconds).toBe(600);

    // Exactly 601s gap: disqualified (dissolved)!
    const memberB601 = createMockMember("u2", "Bob", "studying", 36000 - MAX_RIVALRY_GAP_SECONDS - 1);
    const rivalry601 = detectLiveRivalry([memberA, memberB601], fixedNow);
    expect(rivalry601).toBeNull();
  });

  it("freezes study time when rival is on break, remaining in rivalry if within 10 minutes", () => {
    const fixedNow = new Date("2026-09-03T10:05:00.000Z");
    // Alice is studying: past 36,000s + active 300s (since 10:00) = 36,300s
    const memberA = createMockMember("u1", "Alice", "studying", 36000, 0, "2026-09-03T10:00:00.000Z");

    // Bob went on break at 10:02 with 120s active study accrued in snapshot
    const memberB = createMockMember(
      "u2",
      "Bob",
      "break",
      36000, // past weekly
      120,   // accrued snapshot
      "2026-09-03T10:00:00.000Z"
    );
    memberB.break_started_at = "2026-09-03T10:02:00.000Z";

    // Bob's weekly time = 36,000 + 120 = 36,120s (frozen at break start!)
    const liveBobWeekly = getLiveMemberWeeklySeconds(memberB, fixedNow);
    expect(liveBobWeekly).toBe(36120);

    // Alice = 36,300. Bob = 36,120. Gap = 180s <= 600s -> rivalry active!
    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).not.toBeNull();
    expect(rivalry?.primaryGapSeconds).toBe(180);
  });

  it("automatically dissolves rivalry when studying rival pulls ahead > 10 minutes while other is on break", () => {
    const fixedNow = new Date("2026-09-03T10:15:00.000Z");
    // Alice studied for 15 minutes (900s). Weekly = 36,000 + 900 = 36,900s
    const memberA = createMockMember("u1", "Alice", "studying", 36000, 0, "2026-09-03T10:00:00.000Z");

    // Bob took a break at 10:02 with only 120s accrued. Weekly = 36,000 + 120 = 36,120s
    const memberB = createMockMember(
      "u2",
      "Bob",
      "break",
      36000,
      120,
      "2026-09-03T10:00:00.000Z"
    );
    memberB.break_started_at = "2026-09-03T10:02:00.000Z";

    // Gap = 36,900 - 36,120 = 780s > 600s -> rivalry dissolves immediately!
    const rivalry = detectLiveRivalry([memberA, memberB], fixedNow);
    expect(rivalry).toBeNull();
  });

  it("disqualifies a member whose break has expired (>= 1 hour) from rivalry", () => {
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
    const memberB = createMockMember(
      "u2",
      "Bob",
      "studying",
      35000,
      1200,
      "2026-09-03T10:30:00.000Z"
    );
    memberB.break_started_at = null;

    const liveBobWeekly = getLiveMemberWeeklySeconds(memberB, fixedNow);
    expect(liveBobWeekly).toBe(36500);
  });

  describe("Multiple Concurrent Rivalries", () => {
    it("detects two independent rivalries and orders them descending by leader study time", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Rivalry 1: Alice (20h = 72000s) and Bob (19h 55m = 71700s) -> gap 300s <= 600s
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 71700);

      // Rivalry 2: Charlie (12h = 43200s) and David (11h 56m = 42960s) -> gap 240s <= 600s
      const memberC = createMockMember("u3", "Charlie", "studying", 43200);
      const memberD = createMockMember("u4", "David", "studying", 42960);

      // Standalone non-rival member: Emma (5h = 18000s)
      const memberE = createMockMember("u5", "Emma", "studying", 18000);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD, memberE], fixedNow);

      expect(rivalries).toHaveLength(2);

      // Top rivalry: Alice vs Bob
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u1", "u2"]);
      expect(rivalries[0].leaderWeeklySeconds).toBe(72000);
      expect(rivalries[0].primaryGapSeconds).toBe(300);

      // Second rivalry below it: Charlie vs David
      expect(rivalries[1].rivalMembers.map((m) => m.id)).toEqual(["u3", "u4"]);
      expect(rivalries[1].leaderWeeklySeconds).toBe(43200);
      expect(rivalries[1].primaryGapSeconds).toBe(240);
    });

    it("enforces mutual exclusivity so members are not duplicated in multiple rivalries", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // All 4 members are close: Alice (20h), Bob (19h 58m), Charlie (19h 55m), David (19h 52m)
      // Trio rule: Alice, Bob, Charlie form Trio (span 5m <= 10m)
      // David is left over; cannot steal members from the existing rivalry
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 71880);
      const memberC = createMockMember("u3", "Charlie", "studying", 71700);
      const memberD = createMockMember("u4", "David", "studying", 71520);

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
      // Trio: A (25h), B (24h 58m), C (24h 55m) -> span 5m <= 10m
      const memberA = createMockMember("u1", "Alice", "studying", 90000);
      const memberB = createMockMember("u2", "Bob", "studying", 89880);
      const memberC = createMockMember("u3", "Charlie", "studying", 89700);

      // Pair: D (10h), E (9h 55m) -> gap 5m <= 10m
      const memberD = createMockMember("u4", "David", "studying", 36000);
      const memberE = createMockMember("u5", "Emma", "studying", 35700);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD, memberE], fixedNow);

      expect(rivalries).toHaveLength(2);
      expect(rivalries[0].isTrio).toBe(true);
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u1", "u2", "u3"]);

      expect(rivalries[1].isTrio).toBe(false);
      expect(rivalries[1].rivalMembers.map((m) => m.id)).toEqual(["u4", "u5"]);
    });

    it("dissolves one rivalry independently when its gap exceeds 10m, keeping the other active", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Group 1: Alice (20h) and Bob (19h 45m) -> gap 15m (900s > 600s) -> DISSOLVED!
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 71100);

      // Group 2: Charlie (12h) and David (11h 56m) -> gap 4m (240s <= 600s) -> ACTIVE!
      const memberC = createMockMember("u3", "Charlie", "studying", 43200);
      const memberD = createMockMember("u4", "David", "studying", 42960);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD], fixedNow);

      // Only Group 2 qualifies
      expect(rivalries).toHaveLength(1);
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u3", "u4"]);
    });
  });
});
