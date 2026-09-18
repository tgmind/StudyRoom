# STUDYROOM RIVALRY ARENA — COMPLETE CURRENT ARCHITECTURE AUDIT

> **DOCUMENT STATUS**: AUTHORITATIVE AUDIT OF EXISTING CODEBASE  
> **TARGET COMPONENT**: Rivalry Arena & Live Multi-Contender Duel Engine  
> **CODEBASE**: StudyRoom (`tgmind/StudyRoom`)  
> **SCOPE**: Strictly reverse-engineered from source code. Zero modifications, refactors, or speculative proposals.

---

## TABLE OF CONTENTS

1. [Executive Architectural Summary](#1-executive-architectural-summary)
2. [Phase 1 — Codebase Discovery & System Topology](#2-phase-1--codebase-discovery--system-topology)
3. [Phase 2 — Search Strategy & Keyword Inventory](#3-phase-2--search-strategy--keyword-inventory)
4. [Phase 3 — Dependency Chains (Direct & Indirect)](#4-phase-3--dependency-chains-direct--indirect)
5. [Phase 4 — Indirect Dependencies & System Intersections](#5-phase-4--indirect-dependencies--system-intersections)
6. [Phase 5 — Authoritative Source of Truth Matrix](#6-phase-5--authoritative-source-of-truth-matrix)
7. [Phase 6 — Reconstructed Rivalry State Machine](#7-phase-6--reconstructed-rivalry-state-machine)
8. [Phase 7 — Rivalry Start Logic & Mathematical Formulation](#8-phase-7--rivalry-start-logic--mathematical-formulation)
9. [Phase 8 — Rival Selection, Grouping & Matchmaking Algorithm](#9-phase-8--rival-selection-grouping--matchmaking-algorithm)
10. [Phase 9 — Rivalry Data Model & Schema Specification](#10-phase-9--rivalry-data-model--schema-specification)
11. [Phase 10 — End-to-End Data Flow Architecture](#11-phase-10--end-to-end-data-flow-architecture)
12. [Exhaustive Answers to Architectural Questions (1–30)](#12-exhaustive-answers-to-architectural-questions-130)
13. [Technical Audit: Bugs, Race Conditions, UX Failures & Architectural Risks](#13-technical-audit-bugs-race-conditions-ux-failures--architectural-risks)

---

## 1. EXECUTIVE ARCHITECTURAL SUMMARY

The **Rivalry Arena** in StudyRoom is a **client-side, ephemeral, real-time matchmaking and UI presentation system**. It dynamically detects when 2 or 3 actively studying members are within **10 minutes (600 seconds)** of each other in **total weekly active study time**, provided each member has completed at least **3 hours (10,800 seconds)** of study during the current calendar week (beginning Monday 00:00:00 Asia/Kolkata).

### Core Realities of the Current System:
1. **No Server-Side Rivalry Engine**: There is no PostgreSQL cron, trigger, backend worker, or RPC that starts, manages, or terminates live rivalries. Active rivalries exist **only in client memory** evaluated during React render cycles.
2. **Strictly Weekly Study Time Driven**: Rivalry Arena has **zero connection to leaderboard score, XP, goals, or streaks**. It strictly compares the sum of past weekly completed study seconds and the active session's live elapsed study seconds.
3. **Card Extraction Mechanic**: When members become rivals, their cards are dynamically filtered out of the standard `nonRivalActiveMembers` grid and rendered inside an overarching `RivalryArena` container above the "Studying" section with a custom VS badge and micro-leaderboard tags.
4. **Hybrid Synchronization for Win Celebrations**: While active rivalries are purely computed locally on each client, **Rivalry Win Events** are persisted and synchronized globally across clients via a dual-channel mechanism:
   - **Supabase Realtime WebSockets** (`broadcast` event `rivalry_won`).
   - **PostgreSQL Table** `public.rivalry_events` (`INSERT` with `REPLICA IDENTITY FULL`).
   - **Peer Storm Prevention**: A "Designated Broadcaster" algorithm ensures only the winner (or a designated active coordinator) broadcasts the win event.

---

## 2. PHASE 1 — CODEBASE DISCOVERY & SYSTEM TOPOLOGY

| Dimension | Implementation in StudyRoom |
|---|---|
| **Framework** | Next.js 16.3.4 (App Router, Strict TypeScript, React 19.0.0, Turbopack) |
| **Styling Architecture** | Tailwind CSS 3.4.17 (Monochrome Dark, Rose/Amber Battle Gradients, CSS Keyframes) |
| **Backend & Database** | Supabase (PostgreSQL 15+, Supabase Auth, Supabase Storage `avatars`, Row Level Security) |
| **Realtime Engine** | Supabase Realtime Channels (`room:live:global`, Postgres Changes & Broadcasts) |
| **Client State** | React Hooks (`useMemo`, `useState`, `useRef`, `useCallback`), `localStorage`, `sessionStorage` |
| **Time Calibration** | Atomic Clock Sync (`getServerNow()`, `/api/time`, `Date` header calibration) |
| **PWA & Offline** | Custom Service Worker (`sw.js`), Web App Manifest, Cache API |
| **Testing Suite** | Vitest 3.0.5, `@testing-library/react` 16.2.0, JSDOM 26.0.0 |

### Key Source Code Manifest:
- [`lib/time/rivalry.ts`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts): Pure math engine for rivalry detection, gap formatting, and live weekly time derivation.
- [`components/room/RivalryArena.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/RivalryArena.tsx): The battle arena container rendering participating rival cards and the VS badge.
- [`components/room/RivalryBadge.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/RivalryBadge.tsx): Centered diamond metallic crest with glowing laser beam and gap badge.
- [`components/room/RivalryWinCelebration.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/RivalryWinCelebration.tsx): Fullscreen celebratory modal (4.5s) and persistent compact banner (15m).
- [`components/room/MemberList.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx): Orchestrator hook consumer, FLIP animation coordinator, win event broadcaster.
- [`components/room/MemberCard.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberCard.tsx): Atomic member card component with `compact={true}` variant for arena display.
- [`hooks/useLiveRoom.ts`](file:///home/thoughtful/Downloads/group%20study/hooks/useLiveRoom.ts): Data hook fetching `users`, `study_sessions`, subscribing to Realtime, and managing `rivalry_events`.
- [`app/room/page.tsx`](file:///home/thoughtful/Downloads/group%20study/app/room/page.tsx): Route entrypoint uniting `useAuth`, `useLiveRoom`, `useActiveSession`, and rendering `MemberList`.
- [`supabase/schema.sql`](file:///home/thoughtful/Downloads/group%20study/supabase/schema.sql): PostgreSQL schema containing `public.rivalry_events` (Section 14).

---

## 3. PHASE 2 — SEARCH STRATEGY & KEYWORD INVENTORY

A systematic, case-insensitive exploration across the entire repository revealed the following lexical footprint:

| Term / Concept | Occurrences in Codebase | Functional Role |
|---|---|---|
| `rival` / `rivalry` | 13 files, 290+ matches | Primary domain concept (detection, UI, badge, win events, schema) |
| `arena` | 4 files | Specific to `RivalryArena.tsx` component and its CSS styling |
| `MAX_RIVALRY_GAP_SECONDS` | `rivalry.ts`, tests | Constant defining the 10-minute gap threshold (600 seconds) |
| `MIN_RIVALRY_WEEKLY_SECONDS`| `rivalry.ts`, tests | Constant defining the 3-hour weekly threshold (10,800 seconds) |
| `detectLiveRivalries` | `rivalry.ts`, `MemberList.tsx` | Pure function evaluating active members and grouping into pairs/trios |
| `rivalry_events` | `schema.sql`, `useLiveRoom.ts` | Database table used exclusively for multi-device win announcement persistence |
| `rivalry_won` | `useLiveRoom.ts` | Supabase Realtime broadcast event name for instant peer notification |
| `isTrio` | `rivalry.ts`, `RivalryArena.tsx` | Boolean flag distinguishing 2-member duel vs 3-member tri-clash |
| `studyroom_active_rivalry_win` | `useLiveRoom.ts`, celebration | `localStorage` key caching the current active win banner across reloads |
| `studyroom_win_dismissed_*` | celebration, `useLiveRoom.ts` | `localStorage` suppression keys preventing duplicate celebration modals |

---

## 4. PHASE 3 — DEPENDENCY CHAINS (DIRECT & INDIRECT)

### Chain 1: Live Room Rendering & Rivalry Arena Lifecycle
```
app/room/page.tsx
  │
  ├──► useLiveRoom(currentUserId)
  │      ├── fetchMembers()
  │      │     ├── SELECT * FROM users
  │      │     ├── SELECT start_time, end_time, duration_minutes FROM study_sessions
  │      │     │     └── Filtered: gte("start_time", oldestRequiredTime)
  │      │     └── SELECT * FROM rivalry_events WHERE created_at >= (NOW() - 15m)
  │      └── Realtime Channel ("room:live:global")
  │            ├── postgres_changes (users, study_sessions, rivalry_events)
  │            └── broadcast (member_status_update, rivalry_won)
  │
  └──► <MemberList members={members} ... />
         ├── Master Tick (1s interval calibrated via getServerNow())
         ├── activeMembers = studyingMembers + breakMembers
         ├── detectLiveRivalries(activeMembers, now, currentUserId, currentUserElapsedSeconds)
         │     ├── getLiveMemberWeeklySeconds() for each member
         │     │     ├── past weekly_study_seconds
         │     │     └── + live elapsed session seconds (calculateMemberElapsedStudySeconds)
         │     └── Priority A (Trio) / Priority B (Pair) Greedy Matchmaker
         ├── rivalMemberIds = Set(all rival participants)
         ├── nonRivalActiveMembers = sortedActiveMembers.filter(m => !rivalMemberIds.has(m.id))
         ├── <RivalryArena rivalry={rivalry} />
         │     ├── <MemberCard compact={true} />
         │     └── <RivalryBadge formattedGap={formattedGap} />
         └── <RivalryWinCelebration winEvent={winEvent} />
```

### Chain 2: Weekly Time Computation Chain
```
Session Block Closes / Session Completes
  │
  ├──► rpc_finish_session(completed_task_ids, reason) [PostgreSQL]
  │      ├── Sums unlinked session_blocks (type = 'study')
  │      ├── Handles midnight crossing: splits into Day 1 & Day 2 records
  │      ├── Inserts into public.study_sessions (duration_minutes, start_time, end_time)
  │      └── Resets public.users: status = 'offline', active_study_seconds_snapshot = 0
  │
  ├──► Realtime Notification: postgres_changes on "study_sessions"
  │
  └──► useLiveRoom: fetchMembers()
         ├── Calculates weekStartTime via getWeekStartTimestamp(serverNow, 'Asia/Kolkata')
         ├── Aggregates duration_minutes for sessions starting >= weekStartTime
         └── Injects weekly_study_seconds into UserProfile
```

### Chain 3: Win Resolution & Peer Broadcast Chain
```
Rivalry Dissolves (Gap > 10m OR Member Left/Offline)
  │
  ├──► MemberList useEffect [lines 233-296]
  │      ├── Detects prevRivalriesRef has rivalry not present in current rivalries
  │      ├── Checks if members still rivals in another group (if yes, aborts)
  │      ├── Checks 15-minute cooldown Map (recentDeclaredWinsRef)
  │      ├── Evaluates Designated Broadcaster logic:
  │      │     • Am I winner? -> Yes, proceed.
  │      │     • Am I loser, but winner is online? -> Defer to winner.
  │      │     • Is winner offline, and am I first active peer? -> Proceed as coordinator.
  │      └── Calls onRivalryWin(winEvent) with bucketed ID `win-${winner}-${loser}-${bucket}`
  │
  └──► useLiveRoom: broadcastRivalryWin(winEvent)
         ├── Optimistic local state: updateActiveWinEvent(winEvent)
         ├── LocalStorage cache: "studyroom_active_rivalry_win"
         ├── Realtime WebSocket broadcast: event "rivalry_won" -> All online peers
         └── Database insert: INSERT INTO public.rivalry_events -> Cross-device sync
```

---

## 5. PHASE 4 — INDIRECT DEPENDENCIES & SYSTEM INTERSECTIONS

### 1. Atomic Clock Synchronization (`lib/time/clockSync.ts`)
- **Impact on Rivalry**: The live rivalry engine runs a 1-second interval using `getServerNow()`. If client clocks drift, timer gaps could jump artificially. `clockSync.ts` continuously measures client-server RTT and offset against `/api/time` and HTTP response headers, ensuring all clients evaluate gap comparisons on an aligned timeline.

### 2. Effective Status & Automatic Expiry (`lib/time/break.ts`)
- **1-Hour Break Expiry**: When a member pauses a session, `break_started_at` is stamped. `isMemberBreakExpired(member, now)` returns `true` once 3,600 seconds elapse.
- **3-Hour Study Limit**: When a member studies continuously for 10,800 seconds, `isMemberStudyExpired(member, now)` returns `true`.
- **Rivalry Impact**: `getEffectiveMemberStatus()` forces expired members to `"offline"`. The moment a member's break or study session expires, `detectLiveRivalries` excludes them, instantly ending any ongoing rivalry.

### 3. Session Block Aggregation & Break Exclusion (`lib/time/format.ts`)
- **Break Exclusion**: Study duration strictly measures `session_blocks` where `block_type = 'study'`. Break time is never counted toward weekly study time.
- **Snapshot Freezing**: When a user is on break, `active_study_seconds_snapshot` holds their accrued study time. Their weekly study seconds freeze, allowing an active rival to overtake them or widen the gap beyond 10 minutes.

### 4. Leaderboard Scoring Engine (`lib/scoring/engine.ts`) — *Decoupled*
- The Weekly Leaderboard uses a 50/30/20 composite score (50% study hours, 30% Dual-Pillar goals, 20% streaks) via `calculateLeaderboardScore()`.
- **Rivalry Arena is completely decoupled from this engine**. It ignores composite score, goal completion, and streaks, relying purely on raw study seconds.

---

## 6. PHASE 5 — AUTHORITATIVE SOURCE OF TRUTH MATRIX

| Value | Source of Truth | Calculation / Update Trigger | Consumer | Ambiguity Status |
|---|---|---|---|---|
| **Past Weekly Study Time** | PostgreSQL `public.study_sessions` | Sum of `duration_minutes * 60` for sessions where `start_time >= weekStartTime` | `useLiveRoom` -> `member.weekly_study_seconds` | **Authoritative** (PostgreSQL) |
| **Live Active Session Time** | Client + Database Timestamps | `active_study_seconds_snapshot + (now - last_resumed_at)` | `calculateMemberElapsedStudySeconds()` | **Authoritative** (Timestamp delta) |
| **Total Live Weekly Time** | Client Memory (`rivalry.ts`) | `member.weekly_study_seconds + elapsedStudySeconds` | `getLiveMemberWeeklySeconds()` | **Authoritative** (Derived composite) |
| **Active Member Status** | Client Evaluator (`break.ts`) | Evaluates DB `current_status` against 1h break / 3h study expiry thresholds | `getEffectiveMemberStatus()` | **Authoritative** (Rule-based state) |
| **Rivalry Existence / Gap** | Client Evaluator (`rivalry.ts`) | `detectLiveRivalries()` run on 1s tick over `activeMembers` | `MemberList.tsx` -> `rivalries` | **Authoritative** (Ephemeral client state) |
| **Rivalry Roles (Leader/Challenger)** | Sorting Order in `detectLiveRivalries` | Index 0 = Leader, Index 1 = Challenger, Index 2 = Contender | `RivalryArena.tsx` | **Authoritative** (Ranked by weekly time) |
| **Rivalry Winner** | `prev.rivalMembers[0]` at dissolution | Evaluated in `MemberList.tsx` when a previously active rivalry disappears | `RivalryWinCelebration.tsx` | **AMBIGUOUS — Heuristic Edge Cases Exist** (Assumes index 0 always won, even on disconnect) |
| **Rivalry Win Event State** | `public.rivalry_events` + `localStorage` | Generated by Designated Broadcaster upon rivalry dissolution | `useLiveRoom.ts` -> `activeWinEvent` | **Authoritative** (Deduplicated event store) |
| **Leaderboard Score** | `lib/scoring/engine.ts` | 50% hours + 30% dual-pillar goals + 20% weekly streak | `LeaderboardPage.tsx` | **Authoritative** (Independent of rivalry) |
| **User Streaks & Goals** | `public.study_sessions` & `public.daily_goals` | Daily qualifying threshold (>= 30 mins) & 20-hour goal windows | Leaderboard & Goals pages | **Authoritative** (Independent of rivalry) |

---

## 7. PHASE 6 — RECONSTRUCTED RIVALRY STATE MACHINE

Because StudyRoom does not implement a formal XState or Redux state machine for rivalries, the lifecycle is managed implicitly through reactive hooks, comparison refs, and timestamp buckets. Below is the fully reconstructed state machine representing actual code execution:

```
                      ┌────────────────────────────────────────┐
                      │                 IDLE                   │
                      │  (No active members qualify / gap>10m) │
                      └───────────────────┬────────────────────┘
                                          │
                  2 or 3 active members reach >= 3h weekly
                     AND span/gap <= 10m (600 seconds)
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │          ACTIVE_RIVALRY                │
                      │ ├── Pair (isTrio = false)              │
                      │ └── Trio (isTrio = true)               │
                      │   (Cards extracted to RivalryArena)    │
                      └───────────────┬────────┬───────────────┘
                                      │        │
     One member pulls ahead > 10m     │        │  Member goes offline / pauses > 1h
                                      │        │  OR session finishes / leaves room
                                      ▼        ▼
                      ┌────────────────────────────────────────┐
                      │          DISSOLUTION PHASE             │
                      │   (stillActive = false in MemberList)  │
                      └───────────────────┬────────────────────┘
                                          │
                         Winner = prev.rivalMembers[0]
                         Loser  = prev.rivalMembers[1]
                         (Check: not still rivals in trio/pair)
                         (Check: 15-minute cooldown passed)
                         (Check: Designated Broadcaster elected)
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │     BROADCAST & PERSISTENCE            │
                      │ ├── broadcast("rivalry_won")           │
                      │ └── INSERT INTO rivalry_events         │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │      FULLSCREEN CELEBRATION MODAL      │
                      │  (Event < 10s fresh & not celebrated)  │
                      │  • Confetti + Trophy + Haptics         │
                      │  • Auto-minimizes after 4.5 seconds    │
                      └───────────────────┬────────────────────┘
                                          │
                                4.5s timeout OR user dismisses
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │       PERSISTENT COMPACT BANNER        │
                      │  • Pinned above Studying section       │
                      │  • Active for 15 minutes               │
                      │  • Live progress countdown line        │
                      │  • Dismissible via [X]                 │
                      └───────────────────┬────────────────────┘
                                          │
                            15 minutes elapse OR user [X]
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │         RESTORED TO NORMAL             │
                      │  (Cards return to standard grid;       │
                      │   Banner unmounted; stored keys pruned)│
                      └────────────────────────────────────────┘
```

### Detailed State Specifications:

1. **`IDLE`**:
   - **Condition**: Less than 2 active members with `weekly_study_seconds >= 10,800`, or closest gap `> 600s`.
   - **UI**: Members render in standard `nonRivalActiveMembers` grid.

2. **`ACTIVE_RIVALRY` (Pair or Trio)**:
   - **Entry Condition**: `detectLiveRivalries` identifies 2 or 3 members with `gap <= 600s`.
   - **State Holder**: `rivalries` array returned by `useMemo` in `MemberList.tsx`.
   - **UI Side Effects**: Member IDs added to `rivalMemberIds`. Extracted from standard grid. Mounted inside `<RivalryArena />`.

3. **`DISSOLUTION_PHASE`**:
   - **Entry Condition**: In `MemberList.tsx`, `prevRivalriesRef.current` contains an entry whose `id` is no longer in `rivalries`.
   - **Winner Selection**: `winner = prev.rivalMembers[0]`, `loser = prev.rivalMembers[1]`.

4. **`FULLSCREEN_CELEBRATION_MODAL`**:
   - **Entry Condition**: `winEvent` exists, `Date.now() - timestamp < 10,000ms`, not in `celebratedIdsRef`, not in `sessionStorage`.
   - **Side Effects**: Haptic pattern `[30, 40, 50]ms`, popup timer `4500ms`.

5. **`PERSISTENT_COMPACT_BANNER`**:
   - **Entry Condition**: `winEvent` exists, elapsed `< 15 * 60 * 1000ms`, not dismissed in `localStorage`.
   - **UI**: Banner pinned at top of `MemberList.tsx`. Progress bar ticks down.

---

## 8. PHASE 7 — RIVALRY START LOGIC & MATHEMATICAL FORMULATION

### Exact Formula & Thresholds
Defined in [`lib/time/rivalry.ts`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L6-L7):
```typescript
export const MAX_RIVALRY_GAP_SECONDS = 10 * 60; // 10 minutes threshold (600 seconds)
export const MIN_RIVALRY_WEEKLY_SECONDS = 3 * 3600; // 3 hours threshold (10,800 seconds)
```

### 1. Qualification Criteria
A member $M$ qualifies for rivalry consideration if and only if:
1. **Effective Status**:
   $$\text{Status}(M, t) \in \{\text{"studying"}, \text{"break"}\}$$
   *(Evaluated via `getEffectiveMemberStatus()`, which treats expired breaks $> 3600\text{s}$ or sessions $\ge 10800\text{s}$ as `"offline"`).*
2. **Minimum Weekly Volume**:
   $$W_{\text{live}}(M, t) \ge 10,800\text{ seconds (3 hours)}$$
   Where $W_{\text{live}}(M, t)$ is defined as:
   $$W_{\text{live}}(M, t) = W_{\text{past}}(M) + E_{\text{session}}(M, t)$$
   - $W_{\text{past}}(M)$: Sum of all completed session durations in current week (`weekly_study_seconds`).
   - $E_{\text{session}}(M, t)$: Active session elapsed study seconds (`calculateMemberElapsedStudySeconds`).

### 2. Duel (Pair) Trigger Condition
For two qualified members $A$ and $B$, where $W_{\text{live}}(A) \ge W_{\text{live}}(B)$:
$$\Delta_{\text{gap}} = W_{\text{live}}(A) - W_{\text{live}}(B) \le 600\text{ seconds (10 minutes)}$$

### 3. Tri-Clash (Trio) Trigger Condition
For three qualified members $A$, $B$, and $C$, ordered descending such that $W_{\text{live}}(A) \ge W_{\text{live}}(B) \ge W_{\text{live}}(C)$:
$$\text{Span}_{\text{trio}} = W_{\text{live}}(A) - W_{\text{live}}(C) \le 600\text{ seconds (10 minutes)}$$

---

## 9. PHASE 8 — RIVAL SELECTION, GROUPING & MATCHMAKING ALGORITHM

The matchmaking logic resides in `detectLiveRivalries()` ([`lib/time/rivalry.ts:102-195`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L102-L195)). It is a **greedy, top-down scan**:

```
INPUT: All room members UserProfile[]
1. Filter: Retain only members where getEffectiveMemberStatus() is "studying" or "break".
2. Calculate live weekly seconds for each: W_live = weekly_study_seconds + elapsedStudySeconds.
3. Filter: Retain only members where W_live >= 10,800s.
4. Sort: Sort qualified members DESCENDING by W_live.
5. Initialize: rivalries = [], assignedIds = new Set().

6. FOR i = 0 to length(sortedMembers) - 1:
     top = sortedMembers[i]
     IF assignedIds.has(top.id) THEN CONTINUE

     available = all unassigned members with index j > i
     IF available.length == 0 THEN BREAK

     // Priority A: Try to form Trio
     IF available.length >= 2 THEN:
       second = available[0]
       third  = available[1]
       IF (top.W_live - third.W_live) <= 600 THEN:
         Create Trio: [top, second, third]
         primaryGap = top.W_live - second.W_live
         assignedIds.add(top.id, second.id, third.id)
         CONTINUE

     // Priority B: Try to form Pair
     second = available[0]
     IF (top.W_live - second.W_live) <= 600 THEN:
       Create Pair: [top, second]
       primaryGap = top.W_live - second.W_live
       assignedIds.add(top.id, second.id)
       CONTINUE

     // If neither matched, top remains unassigned
7. RETURN rivalries
```

### Concrete Simulation Example:
Suppose 5 members are actively studying on Thursday afternoon:

| Member | Past Weekly Time | Active Session Time | Total Live Time ($W_{\text{live}}$) | Qualified ($\ge 3\text{h}$)? |
|---|---|---|---|---|
| **Aman** | 12h 00m (43,200s) | 45m (2,700s) | **12h 45m (45,900s)** | Yes |
| **Bhavya** | 12h 35m (45,300s) | 07m (420s) | **12h 42m (45,720s)** | Yes |
| **Chetan** | 12h 30m (45,000s) | 09m (540s) | **12h 39m (45,540s)** | Yes |
| **Divya** | 12h 20m (44,400s) | 14m (840s) | **12h 34m (45,240s)** | Yes |
| **Esha** | 2h 15m (8,100s) | 25m (1,500s) | **2h 40m (9,600s)** | **No** ($< 3\text{h}$) |

**Execution Steps**:
1. **Esha** is discarded immediately ($9,600\text{s} < 10,800\text{s}$).
2. Qualified sorted list: `[Aman (45,900s), Bhavya (45,720s), Chetan (45,540s), Divya (45,240s)]`.
3. **Step 1 (`top` = Aman)**:
   - Available below Aman: `[Bhavya, Chetan, Divya]`.
   - Check Trio: Span from Aman to 3rd member (Chetan) = $45,900 - 45,540 = 360\text{s}$ (6 minutes).
   - $360\text{s} \le 600\text{s}$ $\rightarrow$ **TRIO FORMED: Aman (Leader), Bhavya (Challenger), Chetan (Contender)**.
   - Assigned: `{Aman, Bhavya, Chetan}`.
4. **Step 2 (`top` = Divya)**:
   - Available below Divya: `[]`.
   - Divya remains unassigned in the standard grid.
5. **Result**: 1 Trio Arena (Aman vs Bhavya vs Chetan, primary gap = $180\text{s}$ / 3m) + 1 Standard Active Card (Divya).

---

## 10. PHASE 9 — RIVALRY DATA MODEL & SCHEMA SPECIFICATION

### 1. In-Memory TypeScript Interfaces ([`lib/time/rivalry.ts`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L9-L23))

#### `RivalryState`
| Property | Type | Nullable? | Purpose | Generated By |
|---|---|---|---|---|
| `id` | `string` | No | Unique rivalry identifier: `rivalry-${top.member.id}` | `detectLiveRivalries()` |
| `rivalMembers` | `UserProfile[]` | No | Array of 2 or 3 participating user profiles, sorted descending by weekly time | `detectLiveRivalries()` |
| `primaryGapSeconds` | `number` | No | Numeric difference in seconds between rank #1 (Leader) and rank #2 (Challenger) | `detectLiveRivalries()` |
| `formattedGap` | `string` | No | Human-readable string: e.g. `"2m 15s"`, `"45s"`, `"Tied (0s)"` | `formatRivalryGap()` |
| `isTrio` | `boolean` | No | `true` if 3 members in rivalry; `false` if 2 members | `detectLiveRivalries()` |
| `leaderWeeklySeconds`| `number` | No | Total live weekly seconds of the highest-ranked participant | `detectLiveRivalries()` |

#### `RivalryWinEvent`
| Property | Type | Nullable? | Purpose | Generated By |
|---|---|---|---|---|
| `id` | `string` | No | Time-bucketed deterministic ID: `win-${winnerId}-${loserId}-${Math.floor(nowMs / 900000)}` | `MemberList.tsx` |
| `winnerName` | `string` | No | Display name of the winning participant (`prev.rivalMembers[0]`) | `MemberList.tsx` |
| `loserName` | `string` | No | Display name of the defeated participant (`prev.rivalMembers[1]`) | `MemberList.tsx` |
| `timestamp` | `number` | No | Epoch millisecond timestamp when the win event was generated | `Date.now()` |

---

### 2. Database Schema: `public.rivalry_events` ([`supabase/schema.sql:2118-2123`](file:///home/thoughtful/Downloads/group%20study/supabase/schema.sql#L2118-L2123))

```sql
CREATE TABLE IF NOT EXISTS public.rivalry_events (
  id TEXT PRIMARY KEY,
  winner_name TEXT NOT NULL,
  loser_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

| Column | Type | Constraints | RLS Policy | Realtime Publication? |
|---|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Public SELECT / INSERT (`true`) | Yes (`REPLICA IDENTITY FULL`) |
| `winner_name` | `TEXT` | `NOT NULL` | Public SELECT / INSERT (`true`) | Yes |
| `loser_name` | `TEXT` | `NOT NULL` | Public SELECT / INSERT (`true`) | Yes |
| `created_at` | `TIMESTAMPTZ`| `NOT NULL DEFAULT NOW()` | Public SELECT / INSERT (`true`) | Yes |

---

### 3. LocalStorage & SessionStorage Key Schema

| Storage Key | Scope | Type | TTL / Persistence Rule | Purpose |
|---|---|---|---|---|
| `studyroom_active_rivalry_win` | `localStorage` | JSON (`RivalryWinEvent`) | 15 minutes (`timestamp + 900,000 > now`) | Restores compact banner on page reload |
| `studyroom_win_dismissed_${id}` | `localStorage` | `"true"` | Indefinite (until browser storage cleared) | Suppresses re-appearance of dismissed event ID |
| `studyroom_win_dismissed_pair_${w}_${l}` | `localStorage` | Millisecond timestamp string | 15 minutes | Suppresses duplicate events for same winner-loser pair |
| `studyroom_win_celebrated_${id}` | `sessionStorage` | `"true"` | Browser tab session | Prevents fullscreen popup from re-triggering on tab refresh |
| `studyroom_server_clock_offset` | `sessionStorage` | Millisecond offset integer | Browser tab session | Instant atomic server clock calibration on reload |

---

## 11. PHASE 10 — END-TO-END DATA FLOW ARCHITECTURE

```mermaid
flowchart TD
    subgraph StudySessionFlow ["1. Active Study Session Tracking"]
        SB[Session Blocks in DB] -->|RPC Finish/Stop| SS[public.study_sessions]
        U[public.users status: studying/break] -->|Realtime broadcast| ClientUsers[Client User Profiles]
        SS -->|Weekly Query gte weekStart| StatsMap[Aggregated weekly_study_seconds]
    end

    subgraph ClientEvaluation ["2. Client Evaluation Engine (1s Tick)"]
        ClientUsers & StatsMap --> EnrichedMembers[Enriched UserProfile List]
        EnrichedMembers --> ActiveFilter[Filter: studying OR break]
        ActiveFilter --> ExpiryCheck[Filter: Break < 1h & Study < 3h]
        ExpiryCheck --> MinWeeklyCheck[Filter: Live Weekly >= 3 Hours]
        MinWeeklyCheck --> SortDesc[Sort Descending by Live Weekly Seconds]
        SortDesc --> GreedyScan[Greedy Scan: Priority A Trio <= 10m, Priority B Pair <= 10m]
    end

    subgraph UIOrchestration ["3. UI Orchestration & Arena Extraction"]
        GreedyScan -->|Matched Rivals| RivalryList[rivalries: RivalryState[]]
        GreedyScan -->|Remaining Members| NonRivals[nonRivalActiveMembers]
        
        RivalryList -->|Rendered Top| ArenaUI[RivalryArena Component]
        ArenaUI --> CompactCard[MemberCard compact=true]
        ArenaUI --> VSBadge[RivalryBadge VS Crest + Diff/Span]
        
        NonRivals -->|Rendered Below| StandardGrid[Studying Grid MemberCard normal]
        
        FLIP[FLIP Layout Animation Hook] -.->|Smooth Card Transitions| ArenaUI & StandardGrid
    end

    subgraph WinResolution ["4. Dissolution & Win Resolution"]
        RivalryList --> DiffCheck{Rivalry Dissolved?}
        DiffCheck -->|Yes: Gap > 10m OR Member Left| PrevRef[prevRivalriesRef inspection]
        PrevRef --> BroadcasterCheck{Designated Broadcaster?}
        BroadcasterCheck -->|Yes: Winner or 1st Active Peer| WinEventGen[Generate RivalryWinEvent]
        
        WinEventGen --> WSBroadcast[WebSocket Broadcast: rivalry_won]
        WinEventGen --> DBInsert[DB Insert: rivalry_events]
        WinEventGen --> LocalStore[localStorage: studyroom_active_rivalry_win]
    end

    subgraph CelebrationUI ["5. Celebratory Announcements"]
        WSBroadcast & DBInsert & LocalStore --> Celebration[RivalryWinCelebration Component]
        Celebration --> Modal[Fullscreen Modal 4.5s + Confetti + Haptics]
        Celebration --> Banner[Persistent Compact Banner 15m Countdown]
    end
```

---

## 12. EXHAUSTIVE ANSWERS TO ARCHITECTURAL QUESTIONS (1–30)

### 1. Where does Rivalry Arena originate?
- **Origin**: It originates **entirely on the client-side** inside [`components/room/MemberList.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx#L186-L216) via the `detectLiveRivalries()` utility in [`lib/time/rivalry.ts`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L102).
- **Server Involvement**: The server provides raw data (`users` table and `study_sessions` table) and broadcast channels, but **no server process initiates or dictates a rivalry**.

### 2. What causes a rivalry to start?
- **Trigger**: When at least 2 active members (`current_status` in `"studying"` or `"break"`) concurrently have:
  1. $\ge 10,800\text{ seconds (3 hours)}$ of total weekly study time.
  2. A gap between their total weekly study times $\le 600\text{ seconds (10 minutes)}$.
- **Evaluation Rate**: Evaluated reactively on every 1-second master clock tick, every local study timer tick, and every incoming Supabase Realtime event.

### 3. What data determines whether two members are rivals?
- **Data Attributes**:
  - `member.current_status` (`"studying"` or `"break"`).
  - `member.weekly_study_seconds` (historical completed session seconds this week).
  - `member.active_study_seconds_snapshot` (accrued session study seconds prior to break).
  - `member.last_resumed_at` / `member.session_start_time` (authoritative timestamp for ongoing study block).
  - `member.break_started_at` (used to verify the 1-hour break cap has not elapsed).
  - Master calibrated clock timestamp (`getServerNow()`).

### 4. How are rivals selected?
- **Selection**: Via a top-down greedy scan on active members sorted descending by live weekly study time:
  - The highest unassigned member (`top`) scans remaining unassigned members.
  - Priority A: Can a Trio be formed with the next 2 members within a 10-minute span?
  - Priority B: Can a Pair be formed with the next 1 member within a 10-minute gap?
  - If neither, `top` is left unassigned and the algorithm moves to the next member.

### 5. How are 2-member and 3-member rivalries handled?
- **2-Member (Pair)**:
  - `isTrio = false`. Roles: `LEADER` (rose) and `CHALLENGER` (amber).
  - Rendered in a 2-column grid (`grid-cols-2`).
  - Badge: Single centered VS crest displaying `{formattedGap} diff`.
- **3-Member (Trio / Tri-Clash)**:
  - `isTrio = true`. Roles: `LEADER` (rose), `CHALLENGER` (amber), `CONTENDER` (violet).
  - Rendered in `grid-cols-2 sm:grid-cols-3`. Card #3 on mobile spans 2 columns (`col-span-2 max-w-[calc(50%-0.25rem)] mx-auto`).
  - Badge: Positioned at 28% vertical on mobile between Card 1 & 2; at 33.3% horizontal on desktop between Card 1 & 2, displaying `{formattedGap} span`.
  - Dynamically degrades to a Pair if the 3rd member falls $> 10\text{m}$ behind.

### 6. Where is rivalry state stored?
- **Active Rivalries**: In React component memory (`useMemo` in `MemberList.tsx`). It is **not** in React Context, **not** in Zustand/Redux, and **not** in any database table.
- **Rivalry Win Announcements**:
  - React state: `activeWinEvent` in `useLiveRoom.ts`.
  - Browser cache: `localStorage.getItem("studyroom_active_rivalry_win")`.
  - Database: `public.rivalry_events` table (`id`, `winner_name`, `loser_name`, `created_at`).

### 7. How is rivalry state updated?
- **Re-computation Drivers**:
  1. 1-second `setInterval` updating `currentTimestamp` in `MemberList.tsx`.
  2. Local user's active timer tick updating `currentUserElapsedSeconds`.
  3. Supabase Realtime channel `room:live:global` events (`postgres_changes` on `users` / `study_sessions`, `broadcast` on `member_status_update`).
  4. 12-second background heartbeat polling in `useLiveRoom.ts`.
  5. Tab visibility and window focus events.

### 8. How is rivalry synchronized between users/devices?
- **Active Rivalries**: **Decentralized deterministic computation**. Because all clients receive identical `users` data, identical `study_sessions` weekly totals, and use atomic server time (`getServerNow()`), each client independently computes the identical rivalry state.
- **Win Celebrations**: Synchronized via Supabase Realtime broadcast channel (`event: "rivalry_won"`) and database inserts into `public.rivalry_events` received via postgres change listeners.

### 9. How are rivalry participants represented?
- Instantiated as `UserProfile` objects inside `RivalryState.rivalMembers`.
- In the DOM, rendered as `<MemberCard compact={true} />` wrapped with an uppercase role strip (`LEADER`, `CHALLENGER`, `CONTENDER`) and total weekly hours (`formatWeeklyHours(weeklySeconds)`).

### 10. How are member cards transformed into a rivalry arena?
- In [`components/room/MemberList.tsx:218-227`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx#L218-L227):
  - All member IDs present in `rivalries` are collected into `rivalMemberIds: Set<string>`.
  - `nonRivalActiveMembers` filters out any ID in `rivalMemberIds`.
  - The rival cards are mounted inside `<RivalryArena />` directly below the Study Controller.
  - A FLIP animation (`useIsomorphicLayoutEffect`, [`lines 312-371`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx#L312-L371)) uses Web Animations API `el.animate(...)` with a 650ms spring curve to visually slide cards from the regular grid into the arena.

### 11. What causes a rivalry to continue?
- Both/all participants remain actively studying or on break (`getEffectiveMemberStatus` is `"studying"` or `"break"`).
- Weekly study time gap remains $\le 600\text{ seconds}$ (10 minutes).
- Neither member's break exceeds 1 hour (3,600s).
- Neither member's continuous study session exceeds 3 hours (10,800s).

### 12. What causes it to end?
1. **Gap Widening**: The leader studies faster while the challenger is on break, or the challenger pauses, causing the gap to exceed 600 seconds.
2. **Session Termination**: A participant presses "Stop" (`rpc_finish_session`), transitioning to `"offline"`.
3. **Break Expiration**: A participant stays on break for $\ge 3,600\text{ seconds}$, causing their effective status to flip to `"offline"`.
4. **Study Limit Expiration**: A participant studies continuously for $\ge 10,800\text{ seconds}$, flipping status to `"offline"`.
5. **Weekly Rollover**: Monday 00:00:00 resets weekly study time to 0, dropping everyone below the 3-hour minimum threshold.

### 13. How is the winner determined?
- In [`components/room/MemberList.tsx:233-296`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx#L233-L296):
  - When an active rivalry from `prevRivalriesRef` is no longer in `rivalries`, the system inspects `prev.rivalMembers`.
  - **Winner**: `prev.rivalMembers[0]` (the member with higher weekly study seconds during the rivalry).
  - **Loser**: `prev.rivalMembers[1]`.
  - *Heuristic Limitation*: The system declares `prev.rivalMembers[0]` as winner regardless of why the rivalry ended (even if the leader simply logged off).

### 14. How is the winner displayed?
- Rendered via [`components/room/RivalryWinCelebration.tsx`](file:///home/thoughtful/Downloads/group%20study/components/room/RivalryWinCelebration.tsx):
  1. **Fullscreen Celebration Modal**: Backdrop blur, bouncing gold Trophy and Crown icons, 10 animated confetti particles, text `"[Winner] won the Rivalry against [Loser] 🎉"`. Auto-minimizes after 4.5 seconds (`POPUP_AUTO_MINIMIZE_MS = 4500`).
  2. **Persistent Compact Banner**: Pinned above the "Studying" section with a 15-minute countdown progress bar line (`PERSISTENCE_DURATION_MS = 15 * 60 * 1000`).

### 15. What happens to the member cards afterward?
- The former rivals' IDs are removed from `rivalMemberIds`.
- If still active, they immediately re-render in the standard `nonRivalActiveMembers` grid under "Studying".
- If a member went offline, their card moves to the "Offline Members" grid (sorted by shortest offline duration).
- FLIP animation smoothly transitions their card elements back to the standard grid coordinates.

### 16. What notifications/toasts/animations are triggered?
- **Haptic Feedback**: `navigator.vibrate([30, 40, 50])` on winner modal appearance; `navigator.vibrate(15)` on dismiss.
- **Visual Animations**: 10 pulsing confetti particles, bouncing Trophy, spinning Sparkles (6s linear spin), FLIP card transition (650ms, `cubic-bezier(0.25, 1.15, 0.35, 1)`).
- **OS / Push Notifications**: **None**. There are no Web Push or service worker notifications dispatched for rivalry events.

### 17. How does Rivalry Arena interact with leaderboard scoring?
- **Zero Interaction**.
- Leaderboard scoring uses a 50/30/20 composite model (50% study volume, 30% Dual-Pillar goals, 20% consistency streak) out of 100 points.
- Rivalry Arena does not read, modify, or reward leaderboard points. Winning a rivalry provides no leaderboard bonus.

### 18. How does it interact with study sessions?
- Active sessions supply live elapsed seconds ($now - \text{last\_resumed\_at}$) via `calculateMemberElapsedStudySeconds()`.
- On break, elapsed seconds freeze at `active_study_seconds_snapshot`.
- Finishing a session inserts a row into `study_sessions`, triggering `postgres_changes` which updates `weekly_study_seconds` across all peers.

### 19. How does it interact with weekly time?
- Historical weekly time is queried from `study_sessions` where `start_time >= weekStartTime`.
- `weekStartTime` is Monday 00:00:00 Asia/Kolkata (`getWeekStartTimestamp`).
- Live weekly time is the sum of historical weekly seconds and active session seconds. Both eligibility ($\ge 3\text{h}$) and gap ($\le 10\text{m}$) depend on this metric.

### 20. How does it interact with goals?
- **Zero Interaction**.
- Goal creation, completion, 20-hour windows, and task counts have no bearing on rivalry formation, progression, or resolution.

### 21. How does it interact with streaks?
- **Zero Interaction**.
- Daily streaks ($\ge 30\text{m}$ study days) do not influence rivalry matchmaking or outcomes.

### 22. How does it interact with real-time synchronization?
- Subscribes to Supabase Realtime channel `room:live:global`.
- Listens to:
  - `postgres_changes` on `users` (updates profile snapshots and statuses).
  - `postgres_changes` on `study_sessions` (triggers immediate re-fetch of weekly aggregates).
  - `broadcast` event `member_status_update` (zero-latency in-memory status push).
  - `broadcast` event `rivalry_won` (instant peer win notification).
  - `postgres_changes` on `rivalry_events` (persisted cross-device win sync).

### 23. What happens at midnight?
- Daily midnight (e.g. Tuesday 00:00) **does not reset weekly study time**.
- If a session crosses midnight, `rpc_finish_session` splits blocks across midnight, but weekly study time remains continuous.
- Live rivalry evaluation continues uninterrupted across daily midnight.

### 24. What happens at weekly rollover?
- Occurs at Monday 00:00:00 Asia/Kolkata.
- `getWeekStartTimestamp` shifts forward 7 days.
- Previous week's study sessions now fall before `weekStartTime`.
- `weekly_study_seconds` for all users instantly drops to 0.
- Because all members have $< 10,800\text{s}$ weekly study time, **all rivalries instantly dissolve**. No rivalries can form until members accumulate 3 hours in the new week.

### 25. What happens when a user joins/leaves?
- **Joins Room / Starts Study**: If their live weekly time is within 10m of an existing active member (and both $\ge 3\text{h}$), a rivalry forms on the next tick.
- **Leaves / Goes Offline**: Their status becomes `"offline"`. They are immediately removed from `activeMembers`. Any rivalry they were in dissolves, declaring the remaining member the winner.

### 26. What happens when a user refreshes?
- Component unmounts and re-mounts.
- `useLiveRoom` loads cached win banner from `localStorage("studyroom_active_rivalry_win")` if $< 15\text{m}$ old.
- `fetchMembers()` retrieves `users`, `study_sessions`, and active `rivalry_events`.
- Reconstructs active members and re-evaluates `detectLiveRivalries`.
- Fullscreen celebration popup does **not** re-trigger if already shown in this tab (`sessionStorage`).

### 27. What happens if two clients update simultaneously?
- Both clients compute identical matchmaking locally.
- To prevent duplicate win broadcast storms, the **Designated Broadcaster** rule applies:
  1. The winning user's client broadcasts.
  2. If the loser's client detects the win, but the winner is online, the loser defers and does not broadcast.
  3. If the winner is offline, the first active member in `sortedActiveMembers` broadcasts.
- All peers generate the identical time-bucketed event ID: `win-${winnerId}-${loserId}-${Math.floor(nowMs / 900000)}`, ensuring database inserts and local state deduplicate seamlessly.

### 28. What happens if stale rivalry state exists?
- **Active Rivalries**: Cannot become stale because they exist only in memory and are recomputed every second.
- **Win Announcements**: Expire strictly after 15 minutes (`PERSISTENCE_DURATION_MS = 15 * 60 * 1000`). Once expired, `RivalryWinCelebration` returns `null` and clears `localStorage`.

### 29. What happens if duplicate rivalry records exist?
- Matchmaking enforces `assignedIds: Set<string>`, mathematically guaranteeing a user cannot appear in multiple active rivalries.
- In PostgreSQL, `public.rivalry_events` enforces `id TEXT PRIMARY KEY`. Duplicate inserts are rejected safely by the database.

### 30. What existing bugs, race conditions, UX issues, or architectural risks exist?
*(See detailed enumeration in Section 13 below).*

---

## 13. TECHNICAL AUDIT: BUGS, RACE CONDITIONS, UX FAILURES & ARCHITECTURAL RISKS

### Critical Bug 1: Comment vs Code Discrepancy in Trio Span
- **Location**: [`lib/time/rivalry.ts:148-154`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L148-L154)
- **Code**:
  ```typescript
  // Top + available[0] + available[1] all within 1 hour span (top.weeklySeconds - available[1].weeklySeconds <= 3600)
  if (available.length >= 2) {
    const second = available[0];
    const third = available[1];
    const span = top.weeklySeconds - third.weeklySeconds;

    if (span <= MAX_RIVALRY_GAP_SECONDS) { // MAX_RIVALRY_GAP_SECONDS is 600 (10 mins)!
  ```
- **Analysis**: The developer comment states trios are formed within a **1-hour span (3,600s)**, but the code enforces `span <= MAX_RIVALRY_GAP_SECONDS` (**10 minutes / 600s**). Trios can only form if all 3 members span $\le 10$ minutes.

---

### Critical Bug 2: False Victory Declaration on Session Stop / Logout
- **Location**: [`components/room/MemberList.tsx:238-241`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx#L238-L241)
- **Mechanism**:
  ```typescript
  const stillActive = rivalries.some((r) => r.id === prev.id);
  if (!stillActive && prev.rivalMembers.length >= 2) {
    const winner = prev.rivalMembers[0];
    const loser = prev.rivalMembers[1];
  ```
- **Flaw**: When a member finishes studying and presses "Stop", their status flips to `"offline"`. This immediately dissolves the rivalry. The system naively declares `prev.rivalMembers[0]` the "Winner", even though no study contest was won—one user simply stopped studying or went to sleep.

---

### Architectural Risk 3: Fragile Rivalry ID Causes DOM Re-Mounting on Lead Change
- **Location**: [`lib/time/rivalry.ts:157, 178`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L157)
- **Mechanism**: The rivalry ID is constructed as:
  ```typescript
  id: `rivalry-${top.member.id}`
  ```
- **Flaw**: When the Challenger overtakes the Leader, `top.member.id` changes to the Challenger. The rivalry ID changes from `rivalry-userA` to `rivalry-userB`. Because React uses `key={rivalry.id}` in `MemberList.tsx`, **the entire RivalryArena component unmounts and remounts**. This causes visual flickering, restarts CSS animations, and drops DOM layout references.

---

### UX Anomaly 4: Trio Win Ignores 3rd Participant
- **Location**: [`components/room/MemberList.tsx:240-285`](file:///home/thoughtful/Downloads/group%20study/components/room/MemberList.tsx#L240-L285)
- **Mechanism**: When a 3-member Tri-Clash dissolves completely, the announcement only references:
  ```typescript
  winnerName: winner.display_name,
  loserName: loser.display_name,
  ```
- **Flaw**: The third contender (`prev.rivalMembers[2]`) is completely erased from the victory announcement. The notification reads `"Aman won against Bhavya"`, omitting Chetan entirely.

---

### Architectural Risk 5: Greedy Algorithm Starves Adjacent Pairs
- **Location**: [`lib/time/rivalry.ts:147-170`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L147-L170)
- **Flaw**: A trio is greedily consumed whenever 3 members span $\le 10\text{m}$. If members $A, B, C, D$ have times $10\text{h }09\text{m}, 10\text{h }07\text{m}, 10\text{h }01\text{m}, 9\text{h }59\text{m}$, the algorithm forms `Trio(A, B, C)`, leaving $D$ alone. A global optimal grouping would have formed `Pair(A, B)` (gap 2m) and `Pair(C, D)` (gap 2m), engaging all 4 members.

---

### Database Schema Vulnerability 6: Missing Foreign Keys & Missing Index on `rivalry_events`
- **Location**: [`supabase/schema.sql:2118-2123`](file:///home/thoughtful/Downloads/group%20study/supabase/schema.sql#L2118-L2123)
- **Flaw**:
  1. `rivalry_events` stores plain text strings (`winner_name`, `loser_name`) with **no user UUID foreign keys and no room ID**.
  2. There is **no database index on `created_at`**, yet every client queries `gte("created_at", fifteenMinsAgoIso)` on room load. This forces an unindexed sequential scan on every room visit.
  3. No retention TTL or cron purges old rows from `rivalry_events`.

---

### UX Risk 7: Monday Morning "Rivalry Desert"
- **Location**: [`lib/time/rivalry.ts:120`](file:///home/thoughtful/Downloads/group%20study/lib/time/rivalry.ts#L120)
- **Flaw**: Because `MIN_RIVALRY_WEEKLY_SECONDS` requires 3 hours of weekly study time, **no rivalries can possibly occur anywhere in the app for the first 3 hours of every week** (Monday 00:00 to 03:00 IST), regardless of how close members' session durations are.

---

*This document represents the complete, verified architectural state of the StudyRoom Rivalry Arena as of September 2026.*
