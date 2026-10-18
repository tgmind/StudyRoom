# StudyRoom — Real-Time Baseline Documentation

**Document ID**: `SR-RT-BASE-20261018`  
**Evaluation Scope**: Real-Time Integrity Audit, Latency Elimination & Premium Live Experience  
**Audit Timestamp**: October 18, 2026, 11:55 AM IST  
**Auditor**: Principal Real-Time Systems Engineer & Performance Architect  
**Baseline Commit**: `f19a2f6c57abe9786d104fa9de981dfa97a53423` (Tag: `v1.0.18`, Branch: `main` synchronized with `origin/main`)  

---

## 1. Git State and Working Tree Inventory

### 1.1 Branch and Commit Status
- **Current Branch**: `main`
- **Upstream Status**: Cleanly synchronized with `origin/main` at commit `f19a2f6c` (`v1.0.18`).
- **Commits Created in This Task**: **0** (strictly enforced).
- **Remote Git Pushes**: **0** (strictly prohibited).
- **Deployments Triggered**: **0**.

### 1.2 Working Tree Modifications (`git status --short`)
```text
 M app/api/social-links/route.ts
 M app/room/page.tsx
 M components/public-site/SectionNavigator.tsx
 M hooks/useActiveSession.ts
 M hooks/useLiveRoom.ts
 M public/sw.js
?? docs/audit/
?? supabase/migrations/20261018_optimize_study_sessions_user_start_idx.sql
?? tests/unit/concurrencyOptimization100Users.test.ts
```

### 1.3 State of Previous Changes
1. **`hooks/useLiveRoom.ts`**:
   - Uniform jitter (`500ms + random(0, 800ms)`) with bounded `maxWait` (2000ms) in `triggerDebouncedFetch`.
   - Secondary enrichment cooldown (3s) with in-flight coalescing and trailing deferred flush.
   - Removed global `postgres_changes` listener on `daily_goals` (*).
   - Added `supabase` to `useCallback` dependency arrays (`broadcastStatusChange`, `ensureRoomChannel`).
   - Added unmount timer cleanups (`secondaryDeferredTimerRef`).
2. **`app/room/page.tsx`**:
   - Wrapped `reconciledMembers` in `useMemo`, isolating 1-second active timer tick (`elapsedStudySeconds`) from member array reference to preserve `React.memo` on `<MemberList>`.
3. **`hooks/useActiveSession.ts`**:
   - Guarded `checkSessionLimit` to exit early when `currentStatus !== "studying"`, eliminating redundant calculation during break mode while preserving decoupled timers and Android bridge.
4. **`public/sw.js`**:
   - Hardened Network-First navigation with strict 3-second `AbortController` timeout and `/offline.html` fallback.
   - Eliminated private authenticated HTML caching in `CacheStorage` to prevent cross-account leaks.
5. **`components/public-site/SectionNavigator.tsx`**:
   - Wrapped `sections` array in `useMemo([price])` to resolve ESLint warning.
6. **`app/api/social-links/route.ts`**:
   - Updated `Cache-Control` header to `public, max-age=30, s-maxage=60, stale-while-revalidate=120`.
7. **`supabase/migrations/20261018_optimize_study_sessions_user_start_idx.sql`**:
   - Non-blocking composite index `(user_id, start_time DESC)`. Previously applied directly to live PostgreSQL and verified (`indisvalid = true, indisready = true`).
8. **`tests/unit/concurrencyOptimization100Users.test.ts`**:
   - 5 regression and concurrency unit tests validating jitter distribution, memoization stability, break mode guards, and service worker navigation fallback.

---

## 2. Baseline Test, Type-Check, Lint, and Build Results

| Verification Suite | Target Command | Result | Duration | Notes |
|---|---|---|---|---|
| **Vitest Unit & Integration Suite** | `npm test` | **94/94 suites passed (100%)**<br>**938/938 tests passed (100%)** | 94.89s | All 94 suites pass with zero failures. |
| **TypeScript Compilation** | `npx tsc --noEmit` | **0 errors** | 5.2s | Clean type safety. |
| **ESLint Quality** | `npm run lint` | **0 errors**, 2 warnings | 7.8s | Only static marketing `<img>` tags (`app/public/admin/page.tsx`, `PaymentSection.tsx`). 0 hook warnings. |
| **Next.js Production Build** | `npm run build` | **Compiled successfully** | 1.71s (compile)<br>4.9s (TS)<br>1.18s (static 36/36) | Turbopack compilation clean across all 36 dynamic and static routes. |

---

## 3. High-Level Real-Time Architecture Overview

### 3.1 Technology Stack & Realtime Primitives
- **Framework**: Next.js 16.3.4 (App Router) + React 19 + TypeScript.
- **Backend / BaaS**: Supabase (PostgreSQL 15+, Supabase Realtime Server, Auth, Storage).
- **Client Supabase Singleton**: `createBrowserClient<Database>` via `@supabase/ssr` (`lib/supabase/client.ts`).
- **Realtime Channels in Play**:
  1. `room:live:global` (`hooks/useLiveRoom.ts`):
     - `postgres_changes` on `users` (`*` — INSERT, UPDATE, DELETE).
     - `postgres_changes` on `study_sessions` (`INSERT`).
     - `broadcast` on `member_status_update`.
     - `broadcast` on `rivalry_won`.
     - `postgres_changes` on `rivalry_events` (`INSERT`).
     - `presence` (`sync`, `join`, `leave`).
  2. `daily_goals_user_${userId}` (`hooks/useDailyGoals.ts`):
     - `postgres_changes` on `daily_goals` scoped strictly to `user_id=eq.${userId}`.
  3. `studyroom:leaderboard:realtime` (`app/leaderboard/page.tsx`):
     - `postgres_changes` on `study_sessions` (`*`).
     - `postgres_changes` on `daily_goals` (`*`).
     - `postgres_changes` on `users` (`UPDATE`).
     - 20-second fallback polling interval when tab is visible.
  4. Active Session Channel (`hooks/useActiveSession.ts`):
     - Broadcasts `member_status_update` to `room:live:global`.
     - Subscribes to peer auto-stops and remote state updates.

### 3.2 Authoritative Time and Clock Synchronization
- Server-authoritative hardware clock synchronization via monotonic anchor pair `(performance.now, serverTimeOffset)` in `lib/time/clockSync.ts`.
- Periodic time sync via `/api/time` with round-trip filtering ($O(\text{RTT}/2)$).
- Android Native foreground service (`StudySessionService.java`) and exact hardware alarms (`SessionAlarmManager.java`) maintain continuous chronometer synchronization regardless of WebView throttling.

---

## 4. Key Limitations & Hypotheses to Investigate in This Audit

1. **Global Room View Latency vs. Secondary Enrichment Jitter**:
   - Does `triggerDebouncedFetch` jitter ($500\text{–}1300\text{ms}$) delay peer status cards, or does the broadcast channel provide 0ms immediate card updates?
   - What happens when a peer switches from studying to break or offline: does the card update via broadcast immediately, or does it wait for `fetchMembers` REST query?
2. **Leaderboard Real-Time Freshness & Live In-Progress Study**:
   - In `app/leaderboard/page.tsx`, does the leaderboard reflect a peer's live in-progress study minutes, or does it only update when `study_sessions` receives an `INSERT` (i.e. session finish)?
   - Notice lines 108–134 of `app/leaderboard/page.tsx`: only the **current user's** live active seconds are calculated client-side (`liveActiveSecondsInWeek`), while peers' live study seconds rely on `entry.total_study_minutes` from `rpc_get_leaderboard`. Does `rpc_get_leaderboard` compute active live study for all users, or only completed sessions?
   - When a peer finishes a session, `study_sessions` triggers `scheduleRefresh` with a 300ms debounce. Is this fast enough, or does `rpc_get_leaderboard` return stale data under read replicas?
3. **Presence vs Disconnection Semantics**:
   - How quickly does a user who closes the tab appear offline or absent? Supabase Presence default timeout is ~25–30 seconds. Does the UI distinguish "offline" from "not in room"?
4. **Leaderboard Cache Invalidation**:
   - Module-level `cachedLeaderboardState` in `app/leaderboard/page.tsx`: does switching tabs display stale cache? Does `fetchLeaderboard(true)` overwrite it reliably?
5. **Cross-Surface Consistency**:
   - Does a user's total study time on `/room` match `/leaderboard` and `/analytics`?

The investigation will proceed with Phase 2 (Data Pipeline Tracing) and Phase 3 (Failure Analysis).
