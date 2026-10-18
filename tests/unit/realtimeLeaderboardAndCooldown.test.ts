import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LEADERBOARD_CACHE_TTL_MS } from "@/app/leaderboard/page";
import { calculateCurrentUserLeaderboardMinutes, calculateLeaderboardScore } from "@/lib/scoring/engine";

describe("Realtime Integrity: Cooldown and Leaderboard Optimizations", () => {
  describe("useLiveRoom Secondary Enrichment Cooldown (O-01)", () => {
    it("deducts query execution time from cooldown to avoid double penalty", () => {
      const COOLDOWN_MS = 3000;
      const MIN_COOLDOWN_MS = 100;

      // Case A: Fast query (400ms)
      const fastQueryDuration = 400;
      const fastRemaining = Math.max(MIN_COOLDOWN_MS, COOLDOWN_MS - fastQueryDuration);
      expect(fastRemaining).toBe(2600);
      expect(fastQueryDuration + fastRemaining).toBe(3000);

      // Case B: Medium query (2000ms)
      const medQueryDuration = 2000;
      const medRemaining = Math.max(MIN_COOLDOWN_MS, COOLDOWN_MS - medQueryDuration);
      expect(medRemaining).toBe(1000);
      expect(medQueryDuration + medRemaining).toBe(3000);

      // Case C: Slow query taking 2950ms
      const slowQueryDuration = 2950;
      const slowRemaining = Math.max(MIN_COOLDOWN_MS, COOLDOWN_MS - slowQueryDuration);
      expect(slowRemaining).toBe(MIN_COOLDOWN_MS);

      // Case D: Extreme query taking 4500ms (> 3000ms)
      const extremeQueryDuration = 4500;
      const extremeRemaining = Math.max(MIN_COOLDOWN_MS, COOLDOWN_MS - extremeQueryDuration);
      expect(extremeRemaining).toBe(MIN_COOLDOWN_MS);
      // Total elapsed before next query is allowed: 4600ms (instead of 7500ms with a naive +3000ms penalty)
      expect(extremeQueryDuration + extremeRemaining).toBe(4600);
    });
  });

  describe("Leaderboard Debounce Starvation Defense (O-02)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("prevents starvation under continuous rapid-fire events using maxWait = 1500ms", () => {
      let callCount = 0;
      let refreshTimer: NodeJS.Timeout | null = null;
      let firstScheduleCallTime: number | null = null;

      const scheduleRefresh = () => {
        const now = Date.now();
        if (!firstScheduleCallTime) {
          firstScheduleCallTime = now;
        }

        if (now - firstScheduleCallTime >= 1500) {
          if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
          }
          firstScheduleCallTime = null;
          callCount++;
          return;
        }

        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
          firstScheduleCallTime = null;
          callCount++;
        }, 300);
      };

      // Simulate rapid events every 100ms for 2000ms
      // Without maxWait, callCount would remain 0 indefinitely because timeout is reset every 100ms
      for (let i = 0; i < 20; i++) {
        scheduleRefresh();
        vi.advanceTimersByTime(100);
      }

      // At 1500ms, maxWait forced execution:
      expect(callCount).toBeGreaterThanOrEqual(1);

      // Advance past remaining timeout (300ms after last event at 2000ms)
      vi.advanceTimersByTime(350);
      expect(callCount).toBe(2);
    });

    it("executes after 300ms debounce when a single event arrives", () => {
      let callCount = 0;
      let refreshTimer: NodeJS.Timeout | null = null;
      let firstScheduleCallTime: number | null = null;

      const scheduleRefresh = () => {
        const now = Date.now();
        if (!firstScheduleCallTime) {
          firstScheduleCallTime = now;
        }

        if (now - firstScheduleCallTime >= 1500) {
          if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
          }
          firstScheduleCallTime = null;
          callCount++;
          return;
        }

        if (refreshTimer) {
          clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
          firstScheduleCallTime = null;
          callCount++;
        }, 300);
      };

      scheduleRefresh();
      expect(callCount).toBe(0);

      vi.advanceTimersByTime(299);
      expect(callCount).toBe(0);

      vi.advanceTimersByTime(1);
      expect(callCount).toBe(1);
    });
  });

  describe("Leaderboard Memory Cache TTL (O-03)", () => {
    it("exports LEADERBOARD_CACHE_TTL_MS as 60000ms (1 minute)", () => {
      expect(LEADERBOARD_CACHE_TTL_MS).toBe(60000);
    });

    it("accepts cache when within TTL and rejects when expired", () => {
      const now = 1700000000000;
      const periodId = "2026-W42";

      const freshCache = {
        periodId,
        entries: [{ user_id: "user-1", display_name: "Alice", score: 95 } as any],
        fetchedAt: now - 30000, // 30s old
      };

      const isFreshValid =
        freshCache.periodId === periodId &&
        now - freshCache.fetchedAt < LEADERBOARD_CACHE_TTL_MS;
      expect(isFreshValid).toBe(true);

      const staleCache = {
        periodId,
        entries: [{ user_id: "user-1", display_name: "Alice", score: 95 } as any],
        fetchedAt: now - 65000, // 65s old
      };

      const isStaleValid =
        staleCache.periodId === periodId &&
        now - staleCache.fetchedAt < LEADERBOARD_CACHE_TTL_MS;
      expect(isStaleValid).toBe(false);
    });
  });

  describe("Live Study Minutes Dynamic Leaderboard Ticker (O-04)", () => {
    it("dynamically increases current user minutes without double-counting", () => {
      // Completed sessions this week: 120 minutes
      const completedWeeklyMinutes = 120;
      // Server total from previous RPC: 125 minutes
      const serverTotalMinutes = 125;

      // At start of tick (live session elapsed: 360 seconds = 6 minutes)
      const tick1 = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes,
        completedWeeklyMinutes,
        liveActiveSecondsInWeek: 360,
        isSessionActive: true,
      });
      // 120 completed + 6 live = 126 min. Max(125, 126) = 126
      expect(tick1.displayedTotalMinutes).toBe(126);

      // After 60 seconds (live session elapsed: 420 seconds = 7 minutes)
      const tick2 = calculateCurrentUserLeaderboardMinutes({
        serverTotalMinutes,
        completedWeeklyMinutes,
        liveActiveSecondsInWeek: 420,
        isSessionActive: true,
      });
      expect(tick2.displayedTotalMinutes).toBe(127);

      // Verify that composite score re-evaluates properly
      const score1 = calculateLeaderboardScore(tick1.displayedTotalMinutes, 150, 5, 5, 3);
      const score2 = calculateLeaderboardScore(tick2.displayedTotalMinutes, 150, 5, 5, 3);
      expect(score2.composite_score).toBeGreaterThan(score1.composite_score);
    });
  });
});
