import { describe, it, expect } from "vitest";
import {
  detectLiveRivalry,
  detectLiveRivalries,
  formatRivalryGap,
  getLiveMemberWeeklySeconds,
  generateStableRivalryId,
  isMondayWarmupActive,
  evaluateRivalryResolution,
  MAX_RIVALRY_GAP_SECONDS,
  MIN_RIVALRY_WEEKLY_SECONDS,
} from "@/lib/time/rivalry";
import { RIVALRY_CONFIG } from "@/lib/time/rivalryConfig";
import { UserProfile } from "@/lib/supabase/types";

describe("Live Study Rivalry Detection Engine", () => {
  const createMockMember = (
    id: string,
    displayName: string,
    status: "studying" | "break" | "offline",
    weeklySeconds: number,
    snapshotSeconds = 0,
    lastResumedAt: string | null = null,
    leaderboardRank?: number,
    leaderboardScore?: number
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
    leaderboard_rank: leaderboardRank,
    leaderboard_score: leaderboardScore,
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

  it("disqualifies members with less than 60 minutes total weekly study time", () => {
    const fixedNow = new Date("2026-09-03T10:00:00.000Z");
    // Alice = 45m (2700s), Bob = 40m (2400s). Gap = 5m <= 10m, but both < 60m (3600s)!
    const memberA = createMockMember("u1", "Alice", "studying", 2700);
    const memberB = createMockMember("u2", "Bob", "studying", 2400);

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

    it("enforces mutual exclusivity and non-greedy matchmaking so 4 close members form 2 pairs instead of leaving 1 starved", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // All 4 members are close: Alice (20h), Bob (19h 58m), Charlie (19h 55m), David (19h 52m)
      // Non-greedy rule: Alice & Bob form Pair, Charlie & David form Pair. All 4 engaged!
      const memberA = createMockMember("u1", "Alice", "studying", 72000);
      const memberB = createMockMember("u2", "Bob", "studying", 71880);
      const memberC = createMockMember("u3", "Charlie", "studying", 71700);
      const memberD = createMockMember("u4", "David", "studying", 71520);

      const rivalries = detectLiveRivalries([memberA, memberB, memberC, memberD], fixedNow);

      expect(rivalries).toHaveLength(2);
      expect(rivalries[0].isTrio).toBe(false);
      expect(rivalries[0].rivalMembers.map((m) => m.id)).toEqual(["u1", "u2"]);
      expect(rivalries[1].isTrio).toBe(false);
      expect(rivalries[1].rivalMembers.map((m) => m.id)).toEqual(["u3", "u4"]);

      // Each member is assigned to exactly one rivalry (no overlap)
      const allRivalIds = rivalries.flatMap((r) => r.rivalMembers.map((m) => m.id));
      expect(new Set(allRivalIds).size).toBe(4);
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

  describe("Rivalry 2.0 — Stable Rivalry Identity", () => {
    it("generates an invariant rivalry ID regardless of who leads or overtakes", () => {
      const id1 = generateStableRivalryId(["user-alice", "user-bob"]);
      const id2 = generateStableRivalryId(["user-bob", "user-alice"]);

      expect(id1).toBe(id2);
      expect(id1).toBe("rivalry-pair-user-alice-user-bob");
    });

    it("generates an invariant trio rivalry ID sorted by user ID", () => {
      const id1 = generateStableRivalryId(["user-c", "user-a", "user-b"]);
      const id2 = generateStableRivalryId(["user-b", "user-c", "user-a"]);

      expect(id1).toBe(id2);
      expect(id1).toBe("rivalry-trio-user-a-user-b-user-c");
    });

    it("maintains stable rivalry ID when challenger overtakes the leader", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Tick 1: Alice (u1) leads Bob (u2)
      const memberA1 = createMockMember("u1", "Alice", "studying", 72000);
      const memberB1 = createMockMember("u2", "Bob", "studying", 71800);

      const rivalries1 = detectLiveRivalries([memberA1, memberB1], fixedNow);
      expect(rivalries1).toHaveLength(1);
      const initialId = rivalries1[0].id;
      expect(rivalries1[0].rivalMembers[0].id).toBe("u1"); // Alice leads

      // Tick 2: Bob overtakes Alice!
      const memberA2 = createMockMember("u1", "Alice", "studying", 72000);
      const memberB2 = createMockMember("u2", "Bob", "studying", 72300); // Bob ahead by 300s!

      const rivalries2 = detectLiveRivalries([memberA2, memberB2], fixedNow, undefined, undefined, rivalries1);
      expect(rivalries2).toHaveLength(1);
      expect(rivalries2[0].id).toBe(initialId); // React key is INVARIANT!
      expect(rivalries2[0].rivalMembers[0].id).toBe("u2"); // Bob now leads
    });
  });

  describe("Rivalry 2.0 — Monday Warm-up Protection", () => {
    it("activates warm-up protection during first 60 minutes of Monday (Asia/Kolkata)", () => {
      // Monday at 00:30 IST (Sunday 19:00 UTC)
      const mondayWarmupTime = new Date("2026-09-06T19:00:00.000Z"); // 00:30 AM Monday IST
      expect(isMondayWarmupActive(mondayWarmupTime)).toBe(true);

      const memberA = createMockMember("u1", "Alice", "studying", 7200);
      const memberB = createMockMember("u2", "Bob", "studying", 7100);

      const rivalries = detectLiveRivalries([memberA, memberB], mondayWarmupTime);
      expect(rivalries).toEqual([]); // Suppresses rivalries during warm-up!
    });

    it("allows rivalries after warm-up period concludes (after 01:00 Monday IST)", () => {
      // Monday at 01:15 IST (Sunday 19:45 UTC)
      const mondayPostWarmupTime = new Date("2026-09-06T19:45:00.000Z");
      expect(isMondayWarmupActive(mondayPostWarmupTime)).toBe(false);

      const memberA = createMockMember("u1", "Alice", "studying", 7200);
      const memberB = createMockMember("u2", "Bob", "studying", 7100);

      const rivalries = detectLiveRivalries([memberA, memberB], mondayPostWarmupTime);
      expect(rivalries).toHaveLength(1);
    });
  });

  describe("Rivalry 2.0 — Hysteresis & Anti-Flicker", () => {
    it("does not start a new rivalry if gap exceeds 10m (e.g. 12m)", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const memberA = createMockMember("u1", "Alice", "studying", 36000);
      const memberB = createMockMember("u2", "Bob", "studying", 36000 - 720); // 12m gap (720s > 600s)

      const rivalries = detectLiveRivalries([memberA, memberB], fixedNow);
      expect(rivalries).toEqual([]);
    });

    it("continues an existing active rivalry when gap expands up to 15m (900s)", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const memberA = createMockMember("u1", "Alice", "studying", 36000);
      const memberB = createMockMember("u2", "Bob", "studying", 36000 - 720); // 12m gap (720s)

      // Previous tick had this rivalry active
      const stableId = generateStableRivalryId(["u1", "u2"]);
      const previousRivalries = [
        {
          id: stableId,
          rivalMembers: [memberA, memberB],
          primaryGapSeconds: 500,
          formattedGap: "8m 20s",
          isTrio: false,
          leaderWeeklySeconds: 36000,
          participantIds: ["u1", "u2"],
        },
      ];

      const rivalries = detectLiveRivalries([memberA, memberB], fixedNow, undefined, undefined, previousRivalries);
      expect(rivalries).toHaveLength(1);
      expect(rivalries[0].id).toBe(stableId);
      expect(rivalries[0].primaryGapSeconds).toBe(720);
    });
  });

  describe("Rivalry 2.0 — Authoritative Rivalry Resolution Evaluator", () => {
    it("resolves as WON when leader pulls ahead by >= 15 minutes (900s) and both remain active", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const winner = createMockMember("u1", "Alice", "studying", 37000);
      const loser = createMockMember("u2", "Bob", "studying", 36000); // 1000s gap >= 900s

      const stableId = generateStableRivalryId(["u1", "u2"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [winner, loser],
        primaryGapSeconds: 500,
        formattedGap: "8m 20s",
        isTrio: false,
        leaderWeeklySeconds: 37000,
        participantIds: ["u1", "u2"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [winner, loser], fixedNow);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("WON");
      expect(resolution?.winner?.id).toBe("u1");
      expect(resolution?.loser?.id).toBe("u2");
      expect(resolution?.standings).toHaveLength(2);
      expect(resolution?.standings[0].userId).toBe("u1");
      expect(resolution?.standings[0].rank).toBe(1);
    });

    it("resolves as SESSION_STOPPED (not WON) when a participant goes offline", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const activeMember = createMockMember("u1", "Alice", "studying", 37000);
      const offlineMember = createMockMember("u2", "Bob", "offline", 36000); // Bob went offline!

      const stableId = generateStableRivalryId(["u1", "u2"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [activeMember, offlineMember],
        primaryGapSeconds: 500,
        formattedGap: "8m 20s",
        isTrio: false,
        leaderWeeklySeconds: 37000,
        participantIds: ["u1", "u2"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [activeMember, offlineMember], fixedNow);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("SESSION_STOPPED");
      expect(resolution?.winner).toBeUndefined(); // NO false victory declared!
    });

    it("resolves as WEEK_ROLLOVER during Monday warm-up protection", () => {
      const mondayWarmupTime = new Date("2026-09-06T19:00:00.000Z"); // 00:30 AM Monday IST
      const memberA = createMockMember("u1", "Alice", "studying", 37000);
      const memberB = createMockMember("u2", "Bob", "studying", 36000);

      const stableId = generateStableRivalryId(["u1", "u2"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [memberA, memberB],
        primaryGapSeconds: 500,
        formattedGap: "8m 20s",
        isTrio: false,
        leaderWeeklySeconds: 37000,
        participantIds: ["u1", "u2"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [memberA, memberB], mondayWarmupTime);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("WEEK_ROLLOVER");
      expect(resolution?.winner).toBeUndefined();
    });

    it("resolves as NO_CONTEST when dissolved without reaching the 15-minute decisive gap", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const memberA = createMockMember("u1", "Alice", "studying", 36500);
      const memberB = createMockMember("u2", "Bob", "studying", 36000); // 500s gap (< 900s)

      const stableId = generateStableRivalryId(["u1", "u2"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [memberA, memberB],
        primaryGapSeconds: 400,
        formattedGap: "6m 40s",
        isTrio: false,
        leaderWeeklySeconds: 36500,
        participantIds: ["u1", "u2"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [memberA, memberB], fixedNow);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("NO_CONTEST");
      expect(resolution?.winner).toBeUndefined();
    });

    it("generates deterministic resolutionId across multiple peers resolving at different seconds", () => {
      const peer1Now = new Date("2026-09-03T10:00:05.000Z"); // second 5
      const peer2Now = new Date("2026-09-03T10:00:15.000Z"); // second 15 (10s later)

      const winner = createMockMember("u1", "Alice", "studying", 38000);
      const loser = createMockMember("u2", "Bob", "studying", 37000); // 1000s gap >= 900s

      const stableId = generateStableRivalryId(["u1", "u2"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [winner, loser],
        primaryGapSeconds: 500,
        formattedGap: "8m 20s",
        isTrio: false,
        leaderWeeklySeconds: 37000,
        participantIds: ["u1", "u2"],
      };

      const res1 = evaluateRivalryResolution(prevRivalry, [winner, loser], peer1Now);
      const res2 = evaluateRivalryResolution(prevRivalry, [winner, loser], peer2Now);

      expect(res1?.resolutionId).toBeDefined();
      expect(res2?.resolutionId).toBeDefined();
      // Both peers must calculate the exact same resolutionId for deduplication
      expect(res1?.resolutionId).toBe(res2?.resolutionId);
    });

    it("preserves all 3 members in final standings when a Trio rivalry resolves", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const member1 = createMockMember("u1", "Alice", "studying", 40000); // Leader
      const member2 = createMockMember("u2", "Bob", "studying", 38500);   // Runner up (1500s gap >= 900s)
      const member3 = createMockMember("u3", "Chetan", "studying", 38000); // Third

      const stableId = generateStableRivalryId(["u1", "u2", "u3"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [member1, member2, member3],
        primaryGapSeconds: 500,
        formattedGap: "8m 20s",
        isTrio: true,
        leaderWeeklySeconds: 38500,
        participantIds: ["u1", "u2", "u3"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [member1, member2, member3], fixedNow);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("WON");
      expect(resolution?.winner?.id).toBe("u1");
      expect(resolution?.loser?.id).toBe("u2");
      expect(resolution?.standings).toHaveLength(3);
      expect(resolution?.standings[0].userId).toBe("u1");
      expect(resolution?.standings[0].rank).toBe(1);
      expect(resolution?.standings[1].userId).toBe("u2");
      expect(resolution?.standings[1].rank).toBe(2);
      expect(resolution?.standings[2].userId).toBe("u3");
      expect(resolution?.standings[2].rank).toBe(3);
    });
  });

  describe("Rivalry 2.0 Option B — Dual-Mode Rivalry Engine (STUDY_TIME + RANK_CLASH)", () => {
    it("matches Subodh (#5, 43.1 pts, 7h 27m) and Aditya (#6, 42.3 pts, 16h 46m) under RANK_CLASH", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Subodh: Rank #5, 43.1 pts, 7h 27m (26,820s)
      const subodh = createMockMember(
        "user-subodh",
        "Subodh",
        "studying",
        26820,
        0,
        null,
        5,
        43.1
      );
      // Aditya: Rank #6, 42.3 pts, 16h 46m (60,360s)
      const aditya = createMockMember(
        "user-aditya",
        "Aditya",
        "studying",
        60360,
        0,
        null,
        6,
        42.3
      );

      const rivalries = detectLiveRivalries([subodh, aditya], fixedNow);

      expect(rivalries).toHaveLength(1);
      const r = rivalries[0];
      expect(r.mode).toBe("RANK_CLASH");
      expect(r.isTrio).toBe(false);
      // Subodh is the Leader because his leaderboard score (43.1) is higher than Aditya's (42.3)
      expect(r.rivalMembers[0].id).toBe("user-subodh");
      expect(r.rivalMembers[1].id).toBe("user-aditya");
      expect(r.leaderScore).toBe(43.1);
      expect(r.scoreGap).toBeCloseTo(0.8, 1);
      expect(r.formattedGap).toBe("0.8 pts");
      // The 9h 19m (33,540s) study time gap does NOT disqualify or prevent the match!
      expect(Math.abs((subodh.weekly_study_seconds ?? 0) - (aditya.weekly_study_seconds ?? 0))).toBe(33540);
      // Stable invariant ID based on participant IDs
      expect(r.id).toBe(generateStableRivalryId(["user-aditya", "user-subodh"]));
    });

    it("evaluates leaderboard proximity thresholds by rank distance correctly", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");

      // Distance 1 (Adjacent ranks): Max score gap 10.0 pts
      const mRank1 = createMockMember("u1", "A", "studying", 10000, 0, null, 1, 50.0);
      const mRank2Pass = createMockMember("u2", "B", "studying", 25000, 0, null, 2, 40.0); // gap = 10.0 pts -> match
      const mRank2Fail = createMockMember("u2f", "Bf", "studying", 25000, 0, null, 2, 39.9); // gap = 10.1 pts -> fail

      const rPass1 = detectLiveRivalries([mRank1, mRank2Pass], fixedNow);
      expect(rPass1).toHaveLength(1);
      expect(rPass1[0].mode).toBe("RANK_CLASH");

      const rFail1 = detectLiveRivalries([mRank1, mRank2Fail], fixedNow);
      expect(rFail1).toHaveLength(0);

      // Distance 2: Max score gap 8.0 pts
      const mDist2Pass = createMockMember("u3", "C", "studying", 30000, 0, null, 3, 42.0); // gap = 8.0 pts -> match
      const mDist2Fail = createMockMember("u3f", "Cf", "studying", 30000, 0, null, 3, 41.9); // gap = 8.1 pts -> fail

      const rPass2 = detectLiveRivalries([mRank1, mDist2Pass], fixedNow);
      expect(rPass2).toHaveLength(1);
      expect(rPass2[0].mode).toBe("RANK_CLASH");

      const rFail2 = detectLiveRivalries([mRank1, mDist2Fail], fixedNow);
      expect(rFail2).toHaveLength(0);

      // Distance 3: Max score gap 6.0 pts
      const mDist3Pass = createMockMember("u4", "D", "studying", 35000, 0, null, 4, 44.0); // gap = 6.0 pts -> match
      const mDist3Fail = createMockMember("u4f", "Df", "studying", 35000, 0, null, 4, 43.9); // gap = 6.1 pts -> fail

      const rPass3 = detectLiveRivalries([mRank1, mDist3Pass], fixedNow);
      expect(rPass3).toHaveLength(1);
      expect(rPass3[0].mode).toBe("RANK_CLASH");

      const rFail3 = detectLiveRivalries([mRank1, mDist3Fail], fixedNow);
      expect(rFail3).toHaveLength(0);

      // Distance 4: Rejects regardless of how small score gap is
      const mDist4 = createMockMember("u5", "E", "studying", 40000, 0, null, 5, 49.5); // gap = 0.5 pts, but dist = 4
      const rFail4 = detectLiveRivalries([mRank1, mDist4], fixedNow);
      expect(rFail4).toHaveLength(0);
    });

    it("supports hysteresis continuation buffer (+3.0 pts) for active RANK_CLASH rivalries", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      // Adjacent ranks: initial start max gap is 10.0 pts. Continue max gap is 13.0 pts.
      const leader = createMockMember("u1", "A", "studying", 15000, 0, null, 1, 52.0);
      const ch12 = createMockMember("u2", "B", "studying", 45000, 0, null, 2, 40.0); // gap = 12.0 pts

      // Without previous active rivalry: 12.0 pts > 10.0 pts -> no match
      const freshRivalry = detectLiveRivalries([leader, ch12], fixedNow);
      expect(freshRivalry).toHaveLength(0);

      // With previous active RANK_CLASH rivalry: continues within 13.0 pts buffer
      const stableId = generateStableRivalryId(["u1", "u2"]);
      const previousRivalries = [
        {
          id: stableId,
          rivalMembers: [leader, ch12],
          mode: "RANK_CLASH" as const,
          scoreGap: 9.0,
          formattedGap: "9.0 pts",
          isTrio: false,
          leaderWeeklySeconds: 15000,
          participantIds: ["u1", "u2"],
        },
      ];

      const continuedRivalry = detectLiveRivalries([leader, ch12], fixedNow, undefined, undefined, previousRivalries);
      expect(continuedRivalry).toHaveLength(1);
      expect(continuedRivalry[0].id).toBe(stableId);
      expect(continuedRivalry[0].mode).toBe("RANK_CLASH");
      expect(continuedRivalry[0].formattedGap).toBe("12.0 pts");

      // Beyond continue buffer (> 13.0 pts): dissolves
      const ch14 = createMockMember("u2", "B", "studying", 45000, 0, null, 2, 38.0); // gap = 14.0 pts > 13.0 pts
      const dissolvedRivalry = detectLiveRivalries([leader, ch14], fixedNow, undefined, undefined, previousRivalries);
      expect(dissolvedRivalry).toHaveLength(0);
    });

    it("maintains stable rivalry identity and shifts leader upon overtake without false WON resolution", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");

      // Tick 1: Subodh (43.1) leads Aditya (42.3)
      const subodh1 = createMockMember("u-subodh", "Subodh", "studying", 26820, 0, null, 5, 43.1);
      const aditya1 = createMockMember("u-aditya", "Aditya", "studying", 60360, 0, null, 6, 42.3);

      const r1 = detectLiveRivalries([subodh1, aditya1], fixedNow);
      expect(r1).toHaveLength(1);
      const initialId = r1[0].id;
      expect(r1[0].rivalMembers[0].id).toBe("u-subodh"); // Subodh leads

      // Tick 2: Aditya studies, earns points, score becomes 44.5! Subodh stays at 43.1.
      const subodh2 = createMockMember("u-subodh", "Subodh", "studying", 26820, 0, null, 6, 43.1);
      const aditya2 = createMockMember("u-aditya", "Aditya", "studying", 62000, 0, null, 5, 44.5);

      const r2 = detectLiveRivalries([subodh2, aditya2], fixedNow, undefined, undefined, r1);
      expect(r2).toHaveLength(1);
      // Key invariant: ID does not change
      expect(r2[0].id).toBe(initialId);
      // Aditya is now the leader
      expect(r2[0].rivalMembers[0].id).toBe("u-aditya");
      expect(r2[0].rivalMembers[1].id).toBe("u-subodh");
      expect(r2[0].leaderScore).toBe(44.5);
      expect(r2[0].formattedGap).toBe("1.4 pts");

      // Verify that this lead change did NOT resolve the rivalry (it's still active!)
      expect(r2[0].id).toBe(r1[0].id);
    });

    it("resolves as WON in RANK_CLASH when leader pulls ahead by >= 15.0 pts while both active", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const winner = createMockMember("u-subodh", "Subodh", "studying", 30000, 0, null, 4, 60.0);
      const loser = createMockMember("u-aditya", "Aditya", "studying", 60000, 0, null, 7, 44.0); // gap = 16.0 pts >= 15.0

      const stableId = generateStableRivalryId(["u-subodh", "u-aditya"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [winner, loser],
        mode: "RANK_CLASH" as const,
        scoreGap: 9.0,
        formattedGap: "9.0 pts",
        isTrio: false,
        leaderScore: 60.0,
        leaderWeeklySeconds: 30000,
        participantIds: ["u-aditya", "u-subodh"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [winner, loser], fixedNow);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("WON");
      expect(resolution?.winner?.id).toBe("u-subodh");
      expect(resolution?.loser?.id).toBe("u-aditya");
      expect(resolution?.standings).toHaveLength(2);
      expect(resolution?.standings[0].userId).toBe("u-subodh");
      expect(resolution?.standings[0].score).toBe(60.0);
      expect(resolution?.standings[1].userId).toBe("u-aditya");
      expect(resolution?.standings[1].score).toBe(44.0);
      expect(resolution?.resolutionId).toContain("-win-");
    });

    it("prevents false win in RANK_CLASH when rival goes offline or stops session", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const active = createMockMember("u-subodh", "Subodh", "studying", 30000, 0, null, 5, 43.1);
      const offline = createMockMember("u-aditya", "Aditya", "offline", 60000, 0, null, 6, 42.3);

      const stableId = generateStableRivalryId(["u-subodh", "u-aditya"]);
      const prevRivalry = {
        id: stableId,
        rivalMembers: [active, offline],
        mode: "RANK_CLASH" as const,
        scoreGap: 0.8,
        formattedGap: "0.8 pts",
        isTrio: false,
        leaderScore: 43.1,
        leaderWeeklySeconds: 30000,
        participantIds: ["u-aditya", "u-subodh"],
      };

      const resolution = evaluateRivalryResolution(prevRivalry, [active, offline], fixedNow);
      expect(resolution).not.toBeNull();
      expect(resolution?.resolutionType).toBe("SESSION_STOPPED");
      expect(resolution?.winner).toBeUndefined(); // NEVER declare a false win on disconnect/stop
    });

    it("allows independent coexistence of STUDY_TIME and RANK_CLASH rivalries in the same room", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");

      // Study-time pair: Close in duration (10h vs 9h 58m), no leaderboard data
      const timeMember1 = createMockMember("u1", "Alice", "studying", 36000);
      const timeMember2 = createMockMember("u2", "Bob", "studying", 35880);

      // Rank-clash pair: Far in duration (18h vs 6h), but adjacent on leaderboard with 1.2 pts gap
      const rankMember1 = createMockMember("u3", "Charlie", "studying", 64800, 0, null, 2, 75.0);
      const rankMember2 = createMockMember("u4", "David", "studying", 21600, 0, null, 3, 73.8);

      const rivalries = detectLiveRivalries(
        [timeMember1, timeMember2, rankMember1, rankMember2],
        fixedNow
      );

      expect(rivalries).toHaveLength(2);

      const modes = rivalries.map((r) => r.mode);
      expect(modes).toContain("STUDY_TIME");
      expect(modes).toContain("RANK_CLASH");

      const timeRivalry = rivalries.find((r) => r.mode === "STUDY_TIME")!;
      expect(timeRivalry.rivalMembers.map((m) => m.id)).toEqual(["u1", "u2"]);
      expect(timeRivalry.formattedGap).toBe("2m 0s");

      const rankRivalry = rivalries.find((r) => r.mode === "RANK_CLASH")!;
      expect(rankRivalry.rivalMembers.map((m) => m.id)).toEqual(["u3", "u4"]);
      expect(rankRivalry.formattedGap).toBe("1.2 pts");
    });

    it("updates rival member live status (break/resume) in detected rivalries immediately", () => {
      const fixedNow = new Date("2026-09-03T10:00:00.000Z");
      const member1 = createMockMember("u1", "Subodh", "studying", 36000);
      const member2 = createMockMember("u2", "Aditya", "studying", 35880);

      // Both studying
      const r1 = detectLiveRivalries([member1, member2], fixedNow);
      expect(r1).toHaveLength(1);
      expect(r1[0].rivalMembers.find((m) => m.id === "u1")?.current_status).toBe("studying");

      // Subodh goes on BREAK
      const member1Break: UserProfile = {
        ...member1,
        current_status: "break",
        break_started_at: "2026-09-03T10:00:00.000Z",
      };

      const r2 = detectLiveRivalries([member1Break, member2], fixedNow, undefined, undefined, r1);
      expect(r2).toHaveLength(1);
      const subodhInRivalry = r2[0].rivalMembers.find((m) => m.id === "u1");
      expect(subodhInRivalry?.current_status).toBe("break");
      expect(subodhInRivalry?.break_started_at).toBe("2026-09-03T10:00:00.000Z");

      // MemberList memoization equality simulation:
      const prev = r1;
      const next = r2;
      const isIdentical = prev.every((p, idx) => {
        const n = next[idx];
        return (
          p.id === n.id &&
          p.mode === n.mode &&
          p.isTrio === n.isTrio &&
          p.primaryGapSeconds === n.primaryGapSeconds &&
          p.scoreGap === n.scoreGap &&
          p.formattedGap === n.formattedGap &&
          p.rivalMembers.length === n.rivalMembers.length &&
          p.rivalMembers.every((pm, mIdx) => {
            const nm = n.rivalMembers[mIdx];
            return (
              pm.id === nm.id &&
              pm.current_status === nm.current_status &&
              pm.break_started_at === nm.break_started_at &&
              pm.last_resumed_at === nm.last_resumed_at
            );
          })
        );
      });
      // CRITICAL: isIdentical MUST be false when a member pauses/resumes!
      expect(isIdentical).toBe(false);
    });
  });
});
