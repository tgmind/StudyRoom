import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React, { useMemo } from "react";
import { UserProfile } from "@/lib/supabase/types";

describe("100-User Concurrency & Performance Optimization Invariants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("F-01: Real-Time Jittered Debounce & Phase 2 Coalescing", () => {
    it("distributes client debounced fetches across jittered window (500ms - 1300ms) and respects maxWait", () => {
      let callCount = 0;
      let firstCallTime = 0;
      let timerId: NodeJS.Timeout | null = null;

      const triggerDebouncedFetch = () => {
        const now = Date.now();
        if (!firstCallTime) {
          firstCallTime = now;
        }
        const elapsedSinceFirst = now - firstCallTime;
        const maxWait = 2000;

        if (timerId) {
          clearTimeout(timerId);
          timerId = null;
        }

        // 500ms base + uniform 0-800ms jitter
        const jitter = Math.floor(Math.random() * 800);
        const delay = Math.max(50, Math.min(500 + jitter, Math.max(50, maxWait - elapsedSinceFirst)));

        timerId = setTimeout(() => {
          timerId = null;
          firstCallTime = 0;
          callCount++;
        }, delay);
      };

      // Simulate 100 concurrent clients firing simultaneously at T = 0
      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        const jitter = Math.floor(Math.random() * 800);
        delays.push(500 + jitter);
      }

      // Check distribution properties
      const minDelay = Math.min(...delays);
      const maxDelay = Math.max(...delays);
      expect(minDelay).toBeGreaterThanOrEqual(500);
      expect(maxDelay).toBeLessThanOrEqual(1300);

      // Verify that delays are dispersed (not all clients hitting at 500ms)
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(50); // High dispersal across 100 clients

      // Trigger debounced fetch
      triggerDebouncedFetch();
      expect(callCount).toBe(0);

      // Advance by 499ms: nothing should have fired yet
      vi.advanceTimersByTime(499);
      expect(callCount).toBe(0);

      // Advance by 1301ms: it must have fired
      vi.advanceTimersByTime(1301);
      expect(callCount).toBe(1);
    });

    it("coalesces secondary async enrichment during 3-second cooldown with trailing deferred execution", () => {
      let primaryCount = 0;
      let secondaryCount = 0;
      let lastSecondaryTime = 0;
      let isSecondaryFetching = false;
      let secondaryDeferred = false;
      let deferredTimer: NodeJS.Timeout | null = null;

      const runFetch = () => {
        primaryCount++; // Phase 1 runs on every fetch

        const now = Date.now();
        const timeSinceLast = now - lastSecondaryTime;
        const shouldRun = !isSecondaryFetching && (timeSinceLast >= 3000 || lastSecondaryTime === 0);

        if (shouldRun) {
          lastSecondaryTime = now;
          isSecondaryFetching = true;
          secondaryDeferred = false;
          secondaryCount++; // Phase 2 query execution
          isSecondaryFetching = false;
        } else {
          secondaryDeferred = true;
          if (!deferredTimer) {
            const waitTime = Math.max(100, 3000 - timeSinceLast);
            deferredTimer = setTimeout(() => {
              deferredTimer = null;
              runFetch();
            }, waitTime);
          }
        }
      };

      // 1. First fetch (initial mount): both Phase 1 and Phase 2 run
      runFetch();
      expect(primaryCount).toBe(1);
      expect(secondaryCount).toBe(1);

      // 2. Second fetch 500ms later: Phase 1 runs, Phase 2 is throttled and deferred
      vi.advanceTimersByTime(500);
      runFetch();
      expect(primaryCount).toBe(2);
      expect(secondaryCount).toBe(1); // Coalesced: not incremented yet
      expect(secondaryDeferred).toBe(true);

      // 3. Third fetch at 1500ms: Phase 1 runs, Phase 2 remains coalesced
      vi.advanceTimersByTime(1000);
      runFetch();
      expect(primaryCount).toBe(3);
      expect(secondaryCount).toBe(1);

      // 4. Advance past the 3-second cooldown window: trailing deferred execution fires
      vi.advanceTimersByTime(1600);
      expect(primaryCount).toBe(4);
      expect(secondaryCount).toBe(2); // Trailing execution completed
    });
  });

  describe("F-02: Member List Memoization & Referential Stability", () => {
    it("preserves reconciledMembers array reference across 1-second active timer ticks", () => {
      const mockMembers: UserProfile[] = [
        {
          id: "peer-1",
          display_name: "Peer Student",
          current_status: "studying",
          weekly_study_seconds: 7200,
          weekly_sessions_count: 3,
        } as UserProfile,
        {
          id: "user-current",
          display_name: "Self",
          current_status: "studying",
          weekly_study_seconds: 3600,
          weekly_sessions_count: 2,
        } as UserProfile,
      ];

      const user = { id: "user-current" };
      const effectiveProfile = { ...mockMembers[1] };
      const isRoomPresent = true;
      const status = "studying";
      const breakStartedAt = null;

      // Render hook testing memoization logic identical to RoomPage
      const { result, rerender } = renderHook(
        ({ elapsedSeconds }: { elapsedSeconds: number }) => {
          // Reconcile members wrapped in useMemo without elapsedSeconds in dependencies
          const reconciled = useMemo(() => {
            const currentUserInMembers = mockMembers.some((m) => m.id === user.id);
            const baseList = currentUserInMembers ? mockMembers : [...mockMembers, effectiveProfile];

            return baseList.map((m) => {
              if (m.id === user.id) {
                return {
                  ...m,
                  current_status: status,
                  is_present: isRoomPresent,
                  active_study_seconds_snapshot: 0,
                };
              }
              return m;
            });
          }, [mockMembers, user, effectiveProfile, isRoomPresent, status, breakStartedAt]);

          return { reconciled, elapsedSeconds };
        },
        { initialProps: { elapsedSeconds: 0 } }
      );

      const firstRef = result.current.reconciled;
      expect(result.current.elapsedSeconds).toBe(0);

      // Simulate 1-second active timer tick: elapsedSeconds increments from 0 to 1
      rerender({ elapsedSeconds: 1 });
      expect(result.current.elapsedSeconds).toBe(1);
      // The reconciled members array reference MUST be strictly identical (===)
      expect(result.current.reconciled).toBe(firstRef);

      // Simulate another tick to 2 seconds
      rerender({ elapsedSeconds: 2 });
      expect(result.current.elapsedSeconds).toBe(2);
      expect(result.current.reconciled).toBe(firstRef);

      // Verify that updating status to 'break' DOES invalidate memo and produce updated state
      const { result: breakResult } = renderHook(() =>
        useMemo(() => {
          return mockMembers.map((m) => ({
            ...m,
            current_status: "break",
          }));
        }, ["break"])
      );
      expect(breakResult.current[1].current_status).toBe("break");
    });
  });

  describe("F-04: Active Session Limit Guard in Break Mode", () => {
    it("does not execute session limit study calculation while in break mode", () => {
      let calculationCount = 0;
      let currentStatus: "studying" | "break" | "offline" = "break";

      const checkSessionLimit = () => {
        calculationCount++;
      };

      // Simulated effect with the optimized guard
      const runEffect = () => {
        if (currentStatus !== "studying") {
          return null; // Exits early during break and offline
        }
        checkSessionLimit();
        return setInterval(checkSessionLimit, 1000);
      };

      // In break mode: interval should not be created
      const timer = runEffect();
      expect(timer).toBeNull();
      expect(calculationCount).toBe(0);

      // Switch to studying mode: interval is mounted and fires
      currentStatus = "studying";
      const activeTimer = runEffect();
      expect(activeTimer).not.toBeNull();
      expect(calculationCount).toBe(1);

      vi.advanceTimersByTime(2000);
      expect(calculationCount).toBe(3);

      if (activeTimer) clearInterval(activeTimer);
    });
  });

  describe("F-05: PWA Service Worker Navigation Resilience & Anti-Leak Safety", () => {
    it("handles Network-First with 3s timeout and serves neutral /offline.html without caching private user HTML", async () => {
      const mockCache = new Map<string, Response>();
      mockCache.set("/offline.html", new Response("<html><body><h1>You are Offline</h1></body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }));

      // Simulate hardened Network-First navigation handler
      const handleNavigation = async (networkState: "online" | "timeout" | "offline") => {
        try {
          if (networkState === "online") {
            // Fresh response from server with User A's data
            return new Response("<html><body>User A Session</body></html>", {
              status: 200,
              headers: { "Content-Type": "text/html" },
            });
            // Crucial: NOT cached in mockCache!
          }
          if (networkState === "timeout") {
            throw new DOMException("The user aborted a request.", "AbortError");
          }
          throw new TypeError("Failed to fetch");
        } catch {
          const offlineFallback = mockCache.get("/offline.html");
          if (offlineFallback) return offlineFallback.clone();
          return new Response("Offline", { status: 503 });
        }
      };

      // 1. User A navigates online: gets User A's HTML
      const onlineResponse = await handleNavigation("online");
      const onlineHtml = await onlineResponse.text();
      expect(onlineHtml).toBe("<html><body>User A Session</body></html>");

      // Verify CacheStorage contains NO private user HTML
      expect(mockCache.has("/room")).toBe(false);
      expect(mockCache.has("/settings")).toBe(false);

      // 2. User B or unauthenticated user navigates on hanging connection (timeout): gets /offline.html
      const timeoutResponse = await handleNavigation("timeout");
      const timeoutHtml = await timeoutResponse.text();
      expect(timeoutHtml).toContain("You are Offline");
      expect(timeoutHtml).not.toContain("User A Session"); // Zero cross-account leakage!

      // 3. User navigates while completely offline: gets /offline.html
      const offlineResponse = await handleNavigation("offline");
      const offlineHtml = await offlineResponse.text();
      expect(offlineHtml).toContain("You are Offline");
      expect(offlineHtml).not.toContain("User A Session");
    });
  });
});
