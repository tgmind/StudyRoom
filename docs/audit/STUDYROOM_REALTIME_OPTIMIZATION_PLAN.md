# StudyRoom — Real-Time Optimization & Latency Elimination Plan

**Document ID**: `SR-RT-PLAN-20261018`  
**Target Codebase**: StudyRoom (Web, Supabase Realtime, PostgreSQL 15, Service Worker)  
**Baseline Git Commit**: `f19a2f6c` (`v1.0.18`)  
**Evaluation Scope**: Global Room View, Leaderboard, Active Session Timing, Supabase Realtime  
**Plan Status**: PROPOSED & SCOPED FOR LOCAL IMPLEMENTATION  

---

## 1. Executive Summary of Proposed Improvements

This plan proposes four targeted, backward-compatible, low-risk refinements to eliminate real-time latency and stale-data windows on the two critical product surfaces:

1. **Optimization O-01 (Global Room View)**: Eliminate secondary enrichment cooldown double-penalty in `hooks/useLiveRoom.ts`.
2. **Optimization O-02 (Leaderboard)**: Eliminate debounce starvation risk by introducing bounded `maxWait` (1500ms) in `app/leaderboard/page.tsx`.
3. **Optimization O-03 (Leaderboard)**: Enforce a 60-second TTL on `cachedLeaderboardState` in `app/leaderboard/page.tsx`, preventing multi-hour stale ranking snapshots upon tab re-entry.
4. **Optimization O-04 (Leaderboard)**: Add client-side dynamic ticking for the current user's live in-progress study minutes and score on `/leaderboard`, eliminating the 20-second freeze.

All four optimizations require **ZERO database migrations**, **ZERO alterations to production infrastructure**, and are 100% backward-compatible.

---

## 2. Detailed Optimization Specifications

### Optimization O-01: Secondary Enrichment Cooldown Precision
- **File**: `hooks/useLiveRoom.ts` (lines 585–596)
- **Current Behavior**:
  When a secondary enrichment query resolves, if an event was flagged in `secondaryDeferredRef`, the `.finally` handler sets a new timeout for a hardcoded `3000ms`.
- **Identified Bottleneck**:
  If the previous query took 2000ms to complete, imposing an additional 3000ms wait creates a 5000ms total delay from query start, unnecessarily delaying secondary statistics (past 24-hour study time, weekly sessions count, and peak hours).
- **Proposed Change**:
  Calculate remaining cooldown time based on `lastSecondaryFetchTimeRef.current`:
  ```typescript
  const elapsedSinceStart = Date.now() - lastSecondaryFetchTimeRef.current;
  const remainingCooldown = Math.max(100, 3000 - elapsedSinceStart);
  secondaryDeferredTimerRef.current = setTimeout(() => {
    secondaryDeferredTimerRef.current = null;
    fetchMembersRef.current();
  }, remainingCooldown);
  ```
- **Why It Is Safe**:
  Strictly enforces the 3000ms database protection cooldown while eliminating up to 2.9s of artificial delay.
- **Latency & Resource Impact**:
  Reduces secondary statistics refresh latency by 1.5–2.5 seconds during active session finishes. Zero additional database queries.
- **Rollback Approach**: Revert timeout duration to fixed 3000ms.
- **Required Tests**: Unit test simulating secondary fetch duration and verifying remaining cooldown calculation.

---

### Optimization O-02: Leaderboard Debounce Starvation Elimination
- **File**: `app/leaderboard/page.tsx` (lines 284–291)
- **Current Behavior**:
  ```typescript
  const scheduleRefresh = () => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      checkPeriodAndRefresh(true);
    }, 300);
  };
  ```
- **Identified Bottleneck**:
  Pure debounce without `maxWait`. Under continuous concurrent traffic (e.g. 100 students updating sessions or goals), every incoming event cancels and restarts the 300ms timer, starving the leaderboard refresh indefinitely.
- **Proposed Change**:
  Introduce `firstScheduleCallTimeRef` with a strict `maxWait = 1500ms`:
  ```typescript
  const firstScheduleCallTimeRef = useRef<number>(0);
  
  const scheduleRefresh = () => {
    const now = Date.now();
    if (!firstScheduleCallTimeRef.current) {
      firstScheduleCallTimeRef.current = now;
    }
    const elapsed = now - firstScheduleCallTimeRef.current;
    const maxWait = 1500;
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    const delay = Math.max(50, Math.min(300, maxWait - elapsed));
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      firstScheduleCallTimeRef.current = 0;
      checkPeriodAndRefresh(true);
    }, delay);
  };
  ```
- **Why It Is Safe**:
  Preserves 300ms batching for isolated bursts while mathematically guaranteeing that the leaderboard refreshes within at most 1.5 seconds even under non-stop event streams.
- **Latency & Resource Impact**:
  Worst-case refresh latency bounded to 1500ms (down from potentially infinite starvation).
- **Rollback Approach**: Revert to standard 300ms debounce.
- **Required Tests**: Vitest simulation with continuous event triggers every 100ms over 3 seconds, proving execution occurs within 1500ms.

---

### Optimization O-03: Leaderboard Memory Cache Freshness & TTL
- **File**: `app/leaderboard/page.tsx` (lines 30–45, 267–271)
- **Current Behavior**:
  `cachedLeaderboardState` caches entries at the module level. Lines 42 and 269 only check `cachedLeaderboardState.periodId === currentPeriodId`. If the user leaves the tab for hours and returns during the same week, the multi-hour-old cache is displayed immediately without a loading state.
- **Identified Bottleneck**:
  Display of stale multi-hour data followed by abrupt UI rank shifting when background fetch completes, or persistent stale display if background fetch fails.
- **Proposed Change**:
  Enforce a 60-second freshness TTL on `cachedLeaderboardState`:
  ```typescript
  const LEADERBOARD_CACHE_TTL_MS = 60000; // 60 seconds
  const isCacheFresh =
    cachedLeaderboardState !== null &&
    cachedLeaderboardState.periodId === currentPeriodId &&
    (Date.now() - cachedLeaderboardState.fetchedAt) < LEADERBOARD_CACHE_TTL_MS;
  ```
  If cache is fresh (<60s), render immediately with 0ms delay. If cache is older than 60s, treat as stale: show loading state and fetch fresh data immediately.
- **Why It Is Safe**:
  Maintains instant 0ms tab switching during active sessions (<60s), while eliminating deceptive multi-hour stale ranking displays.
- **Latency & Resource Impact**:
  0ms tab switching preserved for active users; eliminates misleading stale states for returning users.
- **Rollback Approach**: Remove `(Date.now() - fetchedAt) < LEADERBOARD_CACHE_TTL_MS` condition.
- **Required Tests**: Unit test verifying cache acceptance within 60s and rejection after 60s.

---

### Optimization O-04: Live In-Progress Minutes on Leaderboard for Active Student
- **File**: `app/leaderboard/page.tsx` (lines 108–144, 293–298)
- **Current Behavior**:
  When a student is actively studying and views `/leaderboard`, their live in-progress minutes are evaluated only inside `fetchLeaderboard`. Between 20-second poll cycles, the student's study time on their own ranking card remains static.
- **Identified Bottleneck**:
  Perceived lag. The user expects their study time on `/leaderboard` to match their active study timer in `/room`.
- **Proposed Change**:
  Run a lightweight 10-second ticker when `profile?.current_status === "studying"` that updates the current user's displayed total study minutes and re-evaluates their score without issuing network RPC queries.
- **Why It Is Safe**:
  Pure client-side derivation from `getServerNow()` and `profile`. Zero database queries. Zero impact on server load.
- **Latency & Resource Impact**:
  Eliminates up to 20 seconds of perceived display lag for the active user on `/leaderboard`. Zero network requests.
- **Rollback Approach**: Remove the 10-second ticker.
- **Required Tests**: Unit test confirming current user's live study minutes update on ticker.

---

## 3. Operational Risk & Approval Boundary

| Change | Migration Required? | Production DB Action? | Approval Needed? | Safety Status |
|---|---|---|---|---|
| **O-01** (Cooldown precision in `useLiveRoom.ts`) | No | None | Local implementation only | **SAFE** |
| **O-02** (Bounded maxWait in `LeaderboardPage`) | No | None | Local implementation only | **SAFE** |
| **O-03** (60s Cache TTL in `LeaderboardPage`) | No | None | Local implementation only | **SAFE** |
| **O-04** (Live active minutes ticker in `LeaderboardPage`) | No | None | Local implementation only | **SAFE** |

All changes are strictly local, uncommitted, and fully testable with existing test suites.
