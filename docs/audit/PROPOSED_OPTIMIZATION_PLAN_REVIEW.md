# StudyRoom — Critical Review of Proposed Optimization Plan

**Document ID**: `SR-REV-20261018-01`  
**Target Proposal**: `implementation_plan.md` (`implementation_plan(20261018-052218).md`)  
**Target Codebase**: StudyRoom Web, Android Native Bridge, Supabase Postgres Backend, Service Worker PWA  
**Baseline Commit**: `f19a2f6c` (`v1.0.18`)  
**Status**: APPROVED WITH REVISIONS & SELECTIVE SAFE IMPLEMENTATION  

---

## 1. Executive Evaluation

The proposed optimization plan presented in `implementation_plan(20261018-052218).md` was subjected to an independent, line-by-line verification against the actual StudyRoom production repository. The proposal correctly identified primary concurrency bottlenecks in client-side query amplification and UI re-rendering churn. However, blind execution of the plan as originally written posed critical operational and architectural risks:

1. **Monolithic Timer Consolidation (F-04)** in `hooks/useActiveSession.ts` failed to account for decoupled React lifecycle teardowns between active study, break state, and background Android chronometer wakeups. Monolithic consolidation would tightly couple visibility handlers, haptic feedbacks, and async termination calls (`finishSession`), introducing high regression risks to server-authoritative timer tracking.
2. **Real-Time Jitter without Trailing Flush (F-01)** in `hooks/useLiveRoom.ts`: Pure debounce jitter spreads initial bursts but under continuous events can postpone queries indefinitely unless bounded by `maxWait`. Furthermore, secondary statistical enrichment (`study_sessions`, `rpc_get_leaderboard`, `rivalry_events`) required a strict in-flight coalescing guard with a trailing deferred execution to prevent silent drop of statistical updates.
3. **Database Migration Execution Hazard (F-03)**: The proposed `CREATE INDEX CONCURRENTLY` cannot be executed via automated transaction-wrapped migration runners (`psql` error `25001`). It must strictly remain an **unapplied migration advisory** with explicit Supabase dashboard execution instructions.

Below is the verified disposition register for each proposed finding and implementation item.

---

## 2. Findings Register & Independent Disposition

| Finding ID | Proposed Root Cause | Independent Verification Status | Final Disposition | Justification & Architectural Refinement |
|---|---|---|---|---|
| **F-01** | Synchronized 500ms debounce across all 100 clients + `daily_goals` listener | **Confirmed (Requires Refinement)** | **ACCEPTED (MODIFIED)** | Added randomized jitter (`500ms + Math.random() * 800ms`) with bounded `maxWait` (2000ms). Implemented in-flight coalescing and 3-second trailing deferred flush for Phase 2 secondary enrichment. Removed redundant global `daily_goals` postgres change listener (scoped channel already exists in `useDailyGoals.ts`). |
| **F-02** | Unmemoized `reconciledMembers` in `app/room/page.tsx` recreating array on 1s tick | **Confirmed** | **ACCEPTED (AS PROPOSED)** | `reconciledMembers` was recreated on every 1-second active timer tick because `elapsedStudySeconds` ticked inside the component render body. Wrapping in `useMemo` isolates array reference from the 1s tick, preserving `React.memo` on `MemberList` and eliminating 100-card re-renders. |
| **F-03** | Missing composite index `(user_id, start_time DESC)` on `study_sessions` | **Confirmed (Production Operational Risk)** | **UNAPPLIED MIGRATION ONLY** | Code queries in `useStudyHistory.ts` filter on equality `user_id = $1` and range `start_time >= $2` with `ORDER BY start_time DESC`. The index is optimal, but `CREATE INDEX CONCURRENTLY` cannot run inside transaction blocks. Created reviewable migration `20261018_optimize_study_sessions_user_start_idx.sql` strictly unapplied with manual deployment runbook. |
| **F-04** | Three independent 1s `setInterval` timers in `hooks/useActiveSession.ts` | **Partially Confirmed (High Coupling Risk)** | **REJECTED MONOLITH / SURGICAL OPTIMIZATION ONLY** | `tick` only runs during `studying`; `checkBreakTimeout` only runs during `break`. They never run concurrently. Merging them into a single loop would couple lifecycle cleanups and visibility listeners. Only `checkSessionLimit` ran redundantly during break mode (when study seconds are frozen). Surgically restricted `checkSessionLimit` to exit early when not studying, preserving independent lifecycle stability. |
| **F-05** | Stale-While-Revalidate caching of HTML navigation routes in `public/sw.js` | **Confirmed** | **ACCEPTED (AS PROPOSED)** | SWR for navigation routes (`mode === 'navigate'`) risked returning stale authenticated SSR HTML across sign-outs or session expirations. Switched to Network-First with Cache Fallback (3s timeout) to guarantee fresh session HTML while preserving offline resilience. |
| **F-06** | ESLint missing dependencies on `useCallback` in `useLiveRoom.ts` and unstable `sections` array | **Confirmed** | **ACCEPTED (AS PROPOSED)** | Added `supabase` to `broadcastStatusChange` and `ensureRoomChannel` dependency arrays. Wrapped `sections` in `useMemo` within `SectionNavigator.tsx`. |
| **F-07** | Cache-Control `no-store` on static `/api/social-links` route | **Confirmed** | **ACCEPTED (AS PROPOSED)** | Endpoint reads rarely changing social links. Updated response header to `public, max-age=60, s-maxage=300, stale-while-revalidate=600`. |
| **M-01** | Peer auto-stop thundering herd when peer break expires (`useLiveRoom.ts`) | **Confirmed (Emergent Finding)** | **ACCEPTED (DOCUMENTED & MITIGATED)** | When a peer's 60-minute break expires, all 100 clients observe it simultaneously. Each client called `rpc_stop_user_session`. PostgreSQL row locking (`FOR UPDATE`) prevented double-stops, but generated 100 RPC invocations. Documented operational behavior and confirmed existing 15s in-memory throttle. |

---

## 3. Detailed Verification Analysis by Component

### 3.1 Real-Time Global Room Synchronization (`hooks/useLiveRoom.ts`)
- **Code Evidence**:
  - Lines 751–759: `triggerDebouncedFetch` cleared timer and scheduled fixed 500ms timeout.
  - Lines 1001–1016: Global postgres changes on `study_sessions` (INSERT) and `daily_goals` (*).
- **Analysis**:
  - When User X completes a study session, Supabase Realtime broadcasts `INSERT` to all 100 active clients within 15–30ms.
  - With a fixed 500ms debounce, all 100 clients fire HTTP requests at `T + 500ms`.
  - Each `fetchMembers` initiates Phase 1 (`users` table select) followed immediately by Phase 2:
    1. `study_sessions` query for 24h & weekly records.
    2. `rpc_get_leaderboard` heavy aggregation RPC.
    3. `rivalry_events` query.
  - Total queries generated within a 50ms window: `100 * 4 = 400` queries.
  - Furthermore, `daily_goals` changes triggered `triggerDebouncedFetch`. Because `useLiveRoom` does not display daily goals (managed separately in `useDailyGoals.ts`), listening to `daily_goals` globally caused 400 queries whenever any user checked off a task!
- **Refinement Implemented**:
  1. Base debounce of 500ms augmented with a uniform random jitter of 0–800ms (`500ms + Math.floor(Math.random() * 800ms)`).
  2. Maximum wait bounded at 2000ms (`maxWait`) to prevent starvation during continuous activity.
  3. Phase 2 secondary enrichment throttled with a 3-second cooldown and trailing deferred flush. If an event occurs while Phase 2 is fetching or during the 3s cooldown, `secondaryDeferredRef` marks the requirement, and a single trailing fetch executes upon cooldown expiry.
  4. Redundant `daily_goals` listener removed from public room channel.

### 3.2 Member List Re-rendering (`app/room/page.tsx` & `components/room/MemberList.tsx`)
- **Code Evidence**:
  - Lines 153–195 in `app/room/page.tsx`: `reconciledMembers` was computed via inline `.map()` in the component render body.
  - `RoomPage` consumes `elapsedStudySeconds` from `useActiveSession()`, which triggers a state update every 1000ms during active study.
- **Analysis**:
  - Every 1-second tick forced `RoomPage` to re-render.
  - Because `reconciledMembers` was created without `useMemo`, a new array reference was produced every second.
  - `<MemberList members={reconciledMembers} currentUserElapsedSeconds={elapsedStudySeconds} ... />` is wrapped in `React.memo`. However, because `members` reference was new on every tick, `React.memo` was invalidated every second.
  - In `MemberList.tsx`, the member list filtering, sorting, and score calculation loop ran every second across 100 items.
- **Refinement Implemented**:
  - Wrapped `baseMembersList` and `reconciledMembers` in `useMemo` with dependencies `[members, user, effectiveProfile, isRoomPresent, status, breakStartedAt]`.
  - Notice that `elapsedStudySeconds` is already passed directly to `MemberList` as `currentUserElapsedSeconds`. During active study, `reconciledMembers` array reference remains strictly stable, allowing `React.memo` to skip re-evaluating the 100-member array.

### 3.3 Active Session Timer Architecture (`hooks/useActiveSession.ts`)
- **Proposal Evaluation**:
  - The proposal called for merging the 3 `setInterval` timers (`checkBreakTimeout`, `checkSessionLimit`, `tick`) into a single 1s ticker.
  - Code inspection revealed that `checkBreakTimeout` only runs when `currentStatus === "break"`, whereas `tick` only runs when `currentStatus === "studying"`. They NEVER run simultaneously.
  - `checkSessionLimit` was the only timer running in both states. During `break`, study elapsed time is paused, making 1s recalculations redundant.
  - Consolidating all three into a single loop would create complex conditional branches, couple unrelated dependencies (`finishSession`, haptics, notifications, warnings), and risk breaking the monotonic hardware clock synchronization (`clockSync.ts`) and Android background chronometer bridge.
- **Refinement Implemented**:
  - Rejected the monolithic timer consolidation.
  - Applied a surgical guard in `checkSessionLimit`: if `currentStatus !== "studying"`, exit immediately.
  - Independent lifecycle isolation is preserved with zero risk of regressions.

### 3.4 Service Worker Navigation Cache Strategy (`public/sw.js`)
- **Code Evidence**:
  - Lines 138–163: `return cachedResponse || fetchPromise;` for navigation requests.
- **Analysis**:
  - Returning `cachedResponse` immediately for navigation (`mode === "navigate"`) means a user opening the PWA gets whatever HTML was previously cached, even if their session expired or they signed out.
  - For dynamic applications with server-side authentication, HTML navigation must verify authentication state online while retaining offline fallback when disconnected.
- **Refinement Implemented**:
  - Updated navigation handler to Network-First: attempts `fetch(event.request)` first; on success, caches the response in `CACHE_NAME`.
  - On network failure (offline, timeout, disconnection), falls back to `cachedResponse`, `/room`, `/`, or `/offline.html`.

---

## 4. Implementation Decision Log

| Component | File Changed | Action | Rationale |
|---|---|---|---|
| Real-Time Room | `hooks/useLiveRoom.ts` | **Modify** | Add jittered debounce (500–1300ms) with maxWait, Phase 2 cooldown (3s) with trailing flush, remove `daily_goals` listener, add `supabase` to useCallback deps. |
| Room Page | `app/room/page.tsx` | **Modify** | Memoize `reconciledMembers` in `useMemo` to eliminate 1s array recreation. |
| Active Session | `hooks/useActiveSession.ts` | **Modify** | Restrict `checkSessionLimit` to `studying` state only; preserve independent timer lifecycles. |
| Service Worker | `public/sw.js` | **Modify** | Switch navigation routes to Network-First with offline cache fallback. |
| Public Navigator | `components/public-site/SectionNavigator.tsx` | **Modify** | Wrap `sections` in `useMemo` and update useEffect dependency array. |
| Social Links API | `app/api/social-links/route.ts` | **Modify** | Set `Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600`. |
| Database Migration | `supabase/migrations/20261018_optimize_study_sessions_user_start_idx.sql` | **New File (Unapplied)** | Author non-blocking composite index migration with complete rollback, lock advisory, and execution manual. |
| Regression Tests | `tests/unit/concurrencyOptimization100Users.test.ts` | **New File** | Validate jitter distribution, memoization stability, and navigation fallback behavior. |

---

## 5. Architectural Invariant Assurance

Every modification was cross-referenced against StudyRoom's four fundamental invariants:
1. **Server-Authoritative Timing**: Preserved. `clockSync.ts` monotonic hardware clock calibration, atomic server time offset, and server-side RPC locking (`rpc_start_user_session`, `rpc_stop_user_session`, `rpc_resume_user_session`) remain completely untouched.
2. **Real-Time UI Updates**: Preserved. WebSocket broadcast channels (`member_status_update`) fire immediately with 0ms delay. Jitter is applied only to secondary REST sync, ensuring instant peer-to-peer card status transitions.
3. **Android Native Service Integration**: Preserved. `MainActivity.java` and `StudySessionService.java` receive identical JavaScript bridge signals and lifecycle notifications.
4. **Offline Resilience**: Preserved. Cache-first strategy for static assets and Network-First with cache fallback for HTML ensures the PWA operates seamlessly without connectivity.
