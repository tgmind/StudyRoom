import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isSessionProtected,
  pruneExpiredDismissalKeys,
  pruneStaleSnapshots,
  pruneGhostOfflineSessions,
  runStartupCleanup,
  CLEANUP_COOLDOWN_MS,
  DISMISSAL_TTL_MS,
  PAIR_DISMISSAL_TTL_MS,
  ROOM_MEMBERS_CACHE_TTL_MS,
  SESSIONS_CACHE_TTL_MS,
  USER_PROFILE_CACHE_TTL_MS,
  KEY_LAST_CLEANUP,
} from "@/lib/cache/cacheManager";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

describe("StudyRoom Cache Manager & Active Session Protection Invariants", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // =========================================================================
  // 1. ACTIVE SESSION PROTECTION INVARIANTS
  // =========================================================================
  describe("Active Session Protection (isSessionProtected)", () => {
    it("returns false when storage is empty (cold idle start)", () => {
      expect(isSessionProtected()).toBe(false);
    });

    it("returns true when studyroom_active_study has an ongoing session", () => {
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_STUDY,
        JSON.stringify({
          userId: "user-123",
          sessionStartTime: new Date().toISOString(),
          lastResumedAt: new Date().toISOString(),
          snapshotSeconds: 600,
        })
      );
      expect(isSessionProtected()).toBe(true);
    });

    it("returns true when studyroom_active_break has an ongoing break", () => {
      localStorage.setItem(
        STORAGE_KEYS.ACTIVE_BREAK,
        JSON.stringify({
          userId: "user-123",
          breakStartedAt: new Date().toISOString(),
          localBreakStartMs: Date.now(),
          accruedSeconds: 1200,
        })
      );
      expect(isSessionProtected()).toBe(true);
    });

    it("returns true when studyroom_offline_active_session exists", () => {
      localStorage.setItem(
        STORAGE_KEYS.OFFLINE_ACTIVE_SESSION,
        JSON.stringify({
          sessionId: "sess-abc",
          userId: "user-123",
          status: "studying",
        })
      );
      expect(isSessionProtected()).toBe(true);
    });

    it("returns true when studyroom_offline_session_queue has pending un-synced actions", () => {
      localStorage.setItem(
        STORAGE_KEYS.OFFLINE_SESSION_QUEUE,
        JSON.stringify([
          {
            id: "act-1",
            action: "finish_session",
            createdAtIso: new Date().toISOString(),
          },
        ])
      );
      expect(isSessionProtected()).toBe(true);
    });

    it("INVIOLABLE RULE: runStartupCleanup NEVER removes session state or snapshots while session is active", async () => {
      const activeStudyPayload = JSON.stringify({
        userId: "user-subodh",
        sessionStartTime: new Date().toISOString(),
        lastResumedAt: new Date().toISOString(),
        snapshotSeconds: 1500,
      });
      localStorage.setItem(STORAGE_KEYS.ACTIVE_STUDY, activeStudyPayload);

      // Also set disposable snapshot with old timestamp
      localStorage.setItem(
        STORAGE_KEYS.CACHED_ROOM_MEMBERS,
        JSON.stringify([{ id: "m1", full_name: "Subodh" }])
      );
      localStorage.setItem(
        STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts",
        (Date.now() - (ROOM_MEMBERS_CACHE_TTL_MS + 10000)).toString()
      );

      const result = await runStartupCleanup(true);

      expect(result.isProtected).toBe(true);
      // Critical check: active study state is untouched!
      expect(localStorage.getItem(STORAGE_KEYS.ACTIVE_STUDY)).toBe(activeStudyPayload);
      // Critical check: snapshots are NOT deleted while session is protected
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS)).not.toBeNull();
    });
  });

  // =========================================================================
  // 2. RIVALRY DISMISSAL KEY PRUNING
  // =========================================================================
  describe("Rivalry Dismissal Key Pruning (pruneExpiredDismissalKeys)", () => {
    it("prunes studyroom_win_dismissed_pair_* older than 15 minutes, but retains newer ones", () => {
      const now = 1000000000;
      const expiredTs = now - (PAIR_DISMISSAL_TTL_MS + 1000);
      const validTs = now - (PAIR_DISMISSAL_TTL_MS - 5000);

      localStorage.setItem("studyroom_win_dismissed_pair_Alice_Bob", expiredTs.toString());
      localStorage.setItem("studyroom_win_dismissed_pair_Carol_Dave", validTs.toString());

      const evicted = pruneExpiredDismissalKeys(now);

      expect(evicted).toBe(1);
      expect(localStorage.getItem("studyroom_win_dismissed_pair_Alice_Bob")).toBeNull();
      expect(localStorage.getItem("studyroom_win_dismissed_pair_Carol_Dave")).toBe(validTs.toString());
    });

    it("prunes studyroom_win_dismissed_* older than 7 days, but retains newer ones", () => {
      const now = 1000000000;
      const expiredTs = now - (DISMISSAL_TTL_MS + 1000);
      const validTs = now - 60000; // 1 minute ago

      localStorage.setItem("studyroom_win_dismissed_old_event_1", expiredTs.toString());
      localStorage.setItem("studyroom_win_dismissed_fresh_event_2", validTs.toString());

      const evicted = pruneExpiredDismissalKeys(now);

      expect(evicted).toBe(1);
      expect(localStorage.getItem("studyroom_win_dismissed_old_event_1")).toBeNull();
      expect(localStorage.getItem("studyroom_win_dismissed_fresh_event_2")).toBe(validTs.toString());
    });

    it("handles legacy string 'true' dismissals gracefully via first-seen index", () => {
      const now = 1000000000;
      localStorage.setItem("studyroom_win_dismissed_legacy_event", "true");

      // First run: registers first seen timestamp, does NOT evict immediately
      let evicted = pruneExpiredDismissalKeys(now);
      expect(evicted).toBe(0);
      expect(localStorage.getItem("studyroom_win_dismissed_legacy_event")).toBe("true");

      // 8 days later: legacy entry is past 7 days from first-seen -> pruned!
      const later = now + (DISMISSAL_TTL_MS + 1000);
      evicted = pruneExpiredDismissalKeys(later);
      expect(evicted).toBe(1);
      expect(localStorage.getItem("studyroom_win_dismissed_legacy_event")).toBeNull();
    });
  });

  // =========================================================================
  // 3. STALE SNAPSHOT PRUNING
  // =========================================================================
  describe("Stale Snapshot Pruning (pruneStaleSnapshots)", () => {
    it("prunes cached_room_members older than 24 hours, retains newer", () => {
      const now = 1000000000;

      // Old member snapshot
      localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS, JSON.stringify([{ id: "m1" }]));
      localStorage.setItem(
        STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts",
        (now - (ROOM_MEMBERS_CACHE_TTL_MS + 5000)).toString()
      );

      const evicted = pruneStaleSnapshots(now);

      expect(evicted).toBe(1);
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts")).toBeNull();
    });

    it("prunes cached_sessions older than 3 days, retains newer", () => {
      const now = 1000000000;

      // Old sessions snapshot
      localStorage.setItem(STORAGE_KEYS.CACHED_SESSIONS, JSON.stringify([{ id: "s1" }]));
      localStorage.setItem(
        STORAGE_KEYS.CACHED_SESSIONS + "_ts",
        (now - (SESSIONS_CACHE_TTL_MS + 10000)).toString()
      );

      const evicted = pruneStaleSnapshots(now);

      expect(evicted).toBe(1);
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_SESSIONS + "_ts")).toBeNull();
    });

    it("prunes cached_user_profile older than 7 days, retains newer", () => {
      const now = 1000000000;

      localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE, JSON.stringify({ id: "u1" }));
      localStorage.setItem(
        STORAGE_KEYS.CACHED_USER_PROFILE + "_ts",
        (now - (USER_PROFILE_CACHE_TTL_MS + 10000)).toString()
      );

      const evicted = pruneStaleSnapshots(now);

      expect(evicted).toBe(1);
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE)).toBeNull();
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_ts")).toBeNull();
    });

    it("prunes cached_active_goal when expired past 12-hour grace, retains unexpired goal", () => {
      const now = Date.now();
      const expiredPastGraceIso = new Date(now - 13 * 3600 * 1000).toISOString(); // 13h ago

      localStorage.setItem(
        STORAGE_KEYS.CACHED_ACTIVE_GOAL,
        JSON.stringify({ id: "g1", expires_at: expiredPastGraceIso, tasks: [] })
      );

      const evicted = pruneStaleSnapshots(now);

      expect(evicted).toBe(1);
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL)).toBeNull();
    });

    it("retains cached_active_goal when still valid or within 12-hour grace window", () => {
      const now = Date.now();
      const validExpiryIso = new Date(now + 2 * 3600 * 1000).toISOString(); // In 2 hours

      localStorage.setItem(
        STORAGE_KEYS.CACHED_ACTIVE_GOAL,
        JSON.stringify({ id: "g2", expires_at: validExpiryIso, tasks: [] })
      );

      const evicted = pruneStaleSnapshots(now);

      expect(evicted).toBe(0);
      expect(localStorage.getItem(STORAGE_KEYS.CACHED_ACTIVE_GOAL)).not.toBeNull();
    });
  });

  // =========================================================================
  // 4. GHOST OFFLINE SESSIONS PRUNING
  // =========================================================================
  describe("Ghost Offline Sessions Pruning (pruneGhostOfflineSessions)", () => {
    it("removes 0-minute ghost entries with 0 tasks and 0 break, but preserves legitimate sessions", () => {
      const sessions = [
        {
          id: "ghost-1",
          start_time: new Date().toISOString(),
          duration_minutes: 0,
          break_minutes: 0,
          completed_tasks: [],
        },
        {
          id: "valid-study-1",
          start_time: new Date().toISOString(),
          duration_minutes: 45,
          break_minutes: 5,
          completed_tasks: [{ id: "t1", task: "Physics" }],
        },
      ];

      localStorage.setItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS, JSON.stringify(sessions));

      const removed = pruneGhostOfflineSessions();

      expect(removed).toBe(1);
      const remaining = JSON.parse(localStorage.getItem(STORAGE_KEYS.OFFLINE_COMPLETED_SESSIONS)!);
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe("valid-study-1");
    });
  });

  // =========================================================================
  // 5. CLEANUP COOLDOWN & IDEMPOTENCY
  // =========================================================================
  describe("Cleanup Cooldown and Idempotency", () => {
    it("respects the 24-hour cleanup cooldown on consecutive calls", async () => {
      // First call (cold start, no previous cleanup timestamp)
      const res1 = await runStartupCleanup(false);
      expect(res1.executed).toBe(true);

      // Second immediate call -> cooldown active!
      const res2 = await runStartupCleanup(false);
      expect(res2.executed).toBe(false);
      expect(res2.reason).toBe("cooldown_active");

      // Force call -> bypasses cooldown
      const res3 = await runStartupCleanup(true);
      expect(res3.executed).toBe(true);
    });

    it("is completely idempotent: repeated execution causes no damage or errors", async () => {
      const now = Date.now();
      localStorage.setItem("studyroom_win_dismissed_old", (now - (DISMISSAL_TTL_MS + 5000)).toString());

      const res1 = await runStartupCleanup(true);
      expect(res1.evictedCount).toBe(1);

      const res2 = await runStartupCleanup(true);
      expect(res2.evictedCount).toBe(0); // Nothing left to evict

      const res3 = await runStartupCleanup(true);
      expect(res3.evictedCount).toBe(0);
    });
  });
});
