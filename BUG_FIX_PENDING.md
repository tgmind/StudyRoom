# BUG FIX PENDING: Sunday–Monday Transition, Weekly Reset & Goal Completion Architecture

> **Document Status**: Pending Implementation & Fix Reference  
> **Source Audits**:
> 1. *Comprehensive Architectural Audit: Sunday-Monday Transition & Weekly Reset*
> 2. *Architectural Audit: Goal Completion Popup & Leaderboard Calculations on the Sunday–Monday Transition*  
> **Platform Timezone**: `Asia/Kolkata` (IST)  
> **Core Mechanics**: 20-Hour Rolling Goal Window, ISO-8601 Week Boundaries (Monday 00:00:00 IST), 3-Hour Maximum Session Cap, 1-Hour Inactivity Break Cap.

---

## Executive Summary & Architecture Context

The platform tracks competitive study rankings, daily goals, streaks, and achiever badges. Unlike traditional platforms that run destructive midnight truncation scripts (e.g. `UPDATE users SET weekly_study_seconds = 0`), this platform relies on **Dynamic ISO-Week Window Boundaries**:

$$\text{v\_week\_start} = \text{DATE\_TRUNC('week', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'}$$
$$\text{v\_week\_end} = \text{v\_week\_start} + \text{INTERVAL '7 days'}$$

When the clock strikes **00:00:00 IST on Monday**, the ISO week shifts forward. Sessions that concluded before Monday 00:00:00 IST naturally drop out of active queries, effectively resetting weekly metrics to 0.

However, when a student **starts studying on Sunday before midnight (e.g., 23:30 IST)** and **finishes studying on Monday after midnight (e.g., 00:30 IST)**:
1. The session straddles the weekly reset boundary.
2. The database session must split across midnight via `rpc_finish_session`.
3. The real-time room UI, leaderboard queries, goal checklists, and weekly achiever badge automation exhibit **7 distinct edge-case bugs and logical discontinuities**.

This document details each bug, the exact lines of code responsible, the root cause, and the concrete, production-ready solution to resolve it.

---

## Table of Bugs & Action Items

| ID | Severity | Component / Layer | Description | Target Files |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | High | Frontend UI / React | Real-Time Total Weekly Duration Bleed on MemberCard | `components/room/MemberCard.tsx` |
| **BUG-02** | Medium | Supabase RPC | Method B Fallback in `rpc_get_leaderboard` Lacks Week Lower Bound | `supabase/schema.sql` |
| **BUG-03** | Critical | Automation / SQL | Weekly Achiever Badge Calculation Ignores In-Flight Sunday Sessions | `supabase/schema.sql`, `README.md`, `lib/email/achieverAutomation.ts` |
| **BUG-04** | Medium | Supabase RPC | Completed Tasks Attributed Exclusively to Monday's Split Session Row | `supabase/schema.sql` (`rpc_finish_session`) |
| **BUG-05** | Critical | Supabase RPC | Cross-Week Double-Counting of Completed Tasks on Leaderboard | `supabase/schema.sql` (`rpc_get_leaderboard`) |
| **BUG-06** | High | Supabase RPC / Client | Session Split Task Association Mismatch in Goal Modal Save | `supabase/schema.sql`, `hooks/useActiveSession.ts` |
| **BUG-07** | Medium | Supabase RPC | Mid-Session Expired Goals Missing on Monday Leaderboard | `supabase/schema.sql` (`rpc_get_leaderboard`) |

---

## Detailed Bug Reports & Concrete Solutions

---

### BUG-01: Real-Time Total Weekly Duration Bleed on MemberCard

#### 1. Problem Description
When a student starts studying on Sunday at 23:30 IST and continues past midnight into Monday:
- At 00:15 IST Monday, the room refetches completed sessions. Because the new week has just started, `member.weekly_study_seconds` is `0`.
- However, `MemberCard.tsx` calculates:
  $$\text{totalWeeklyStudySeconds} = (\text{member.weekly\_study\_seconds} \mathbin{??} 0) + \text{elapsedSeconds}$$
- `elapsedSeconds` is measured from `member.session_start_time` (Sunday 23:30 IST), which equals $45\text{ minutes}$ ($30\text{m Sunday} + 15\text{m Monday}$).
- The member card displays **$45\text{m /wk}$** in the new week (including Sunday's time).
- At 00:30 IST Monday, when the student finishes their session, `rpc_finish_session` executes a midnight split ($30\text{m}$ to Sunday, $30\text{m}$ to Monday).
- When the room updates, `member.weekly_study_seconds` becomes `30m`.
- **User Impact**: The member card suddenly **drops from 60m down to 30m**, creating a noticeable calculation jump and confusing active students.

#### 2. Root Cause Location
- **File**: `components/room/MemberCard.tsx`
- **Lines**: 57–66
```typescript
  // 3. Total Realtime Live Weekly Study Duration (past completed sessions of the week + live active session)
  const isCurrentSessionActive = isStudying || isBreak;
  const totalWeeklyStudySeconds =
    (member.weekly_study_seconds ?? 0) +
    (isCurrentSessionActive
      ? elapsedSeconds
      : isBreakExpired
      ? (member.active_study_seconds_snapshot ?? 0)
      : 0);
```

#### 3. Concrete Solution
In `components/room/MemberCard.tsx`, clamp the live session's elapsed time so that only seconds that elapsed *after* the current week's start timestamp are added to the weekly counter:

```typescript
  // 3. Total Realtime Live Weekly Study Duration (past completed sessions of the week + live active session)
  const isCurrentSessionActive = isStudying || isBreak;
  
  // Compute start of current week in milliseconds (Asia/Kolkata)
  const currentWeekStartMs = getWeekStartTimestamp(currentTimestamp);
  
  // Clamp live session seconds to only count duration accrued inside the current week
  const liveWeeklySeconds = member.session_start_time
    ? Math.max(
        0,
        Math.floor(
          (currentTimestamp.getTime() -
            Math.max(new Date(member.session_start_time).getTime(), currentWeekStartMs)) /
            1000
        )
      )
    : elapsedSeconds;

  const totalWeeklyStudySeconds =
    (member.weekly_study_seconds ?? 0) +
    (isCurrentSessionActive
      ? liveWeeklySeconds
      : isBreakExpired
      ? (member.active_study_seconds_snapshot ?? 0)
      : 0);
```

---

### BUG-02: Method B Fallback in `rpc_get_leaderboard` Lacks Week Lower Bound

#### 1. Problem Description
In `rpc_get_leaderboard`:
- **Method A** (primary calculation via `session_blocks`) correctly clamps block times:
  `GREATEST(b.start_time, v_week_start)`.
- **Method B** (fallback when `session_blocks` are absent or unlinked) calculates:
  `COALESCE(u.active_study_seconds_snapshot, 0) + EXTRACT(EPOCH FROM (NOW() - COALESCE(u.last_resumed_at, u.session_start_time, NOW())))`
- If Method B triggers on Monday morning for a session started Sunday night:
  - `NOW() - u.session_start_time` measures time all the way back to Sunday.
  - `active_study_seconds_snapshot` retains Sunday study seconds.
  - Sunday study minutes leak into Monday's leaderboard score.

#### 2. Root Cause Location
- **File**: `supabase/schema.sql` (also in migration files)
- **Lines**: 1189–1202
```sql
  -- Method B: Fallback to user status fields if blocks not present
  CASE 
    WHEN NOW() >= v_week_start AND NOW() < v_week_end THEN
      CASE
        WHEN u.current_status = 'studying' THEN
          COALESCE(u.active_study_seconds_snapshot, 0) + 
          EXTRACT(EPOCH FROM (NOW() - COALESCE(u.last_resumed_at, u.session_start_time, NOW())))
        WHEN u.current_status = 'break' AND (NOW() - u.break_started_at) < INTERVAL '1 hour' THEN
          COALESCE(u.active_study_seconds_snapshot, 0)
        ELSE 0
      END
    ELSE 0
  END
```

#### 3. Concrete Solution
Clamp the start time to `v_week_start` in Method B so that seconds prior to Monday 00:00:00 IST are excluded:

```sql
  -- Method B: Fallback to user status fields if blocks not present (bounded by v_week_start)
  CASE 
    WHEN NOW() >= v_week_start AND NOW() < v_week_end THEN
      CASE
        WHEN u.current_status = 'studying' THEN
          EXTRACT(EPOCH FROM (
            NOW() - GREATEST(COALESCE(u.last_resumed_at, u.session_start_time, NOW()), v_week_start)
          ))
        WHEN u.current_status = 'break' AND (NOW() - u.break_started_at) < INTERVAL '1 hour' THEN
          CASE 
            WHEN u.break_started_at >= v_week_start THEN COALESCE(u.active_study_seconds_snapshot, 0)
            ELSE 0
          END
        ELSE 0
      END
    ELSE 0
  END
```

---

### BUG-03: Weekly Achiever Calculation Ignores Active In-Flight Sunday Sessions

#### 1. Problem Description
Every Monday morning, `rpc_calculate_weekly_achiever` evaluates the previous week's performance (Monday 00:00 to Sunday 23:59 IST) and awards the `#1 Weekly Achiever Badge`.
- The cron schedule in `README.md` and database setup triggers at **00:00 UTC / 00:00 IST Monday**.
- If Student A is studying from **23:00 Sunday to 01:00 Monday**, their session is **still active** when the cron runs.
- In `rpc_get_leaderboard(v_prev_week_start)`:
  1. `completed_study` only inspects rows in `public.study_sessions`. Because Student A has not finished their session yet, **no row exists** in `study_sessions`.
  2. `live_study` has the predicate:
     `WHERE NOW() >= v_week_start AND NOW() < v_week_end`
     When querying the previous week from Monday morning, `NOW()` is after `v_week_end`. Thus, `live_study` returns **0 live minutes**.
- **User Impact**: Student A's entire study time between 23:00 and 00:00 on Sunday is **completely ignored**. If Student A was competing for #1, they are unfairly robbed of the Achiever Badge.

#### 2. Root Cause Location
- **File**: `supabase/schema.sql` (lines 1207, 1321–1348)
- **File**: `README.md` (lines 112–116)
- **File**: `lib/email/achieverAutomation.ts` (lines 217–225)

#### 3. Concrete Solution (Two-Pronged Fix)
1. **Operational Schedule Fix**:
   Update `pg_cron` (and any GitHub Action/cron job) to run at **04:00 AM IST on Monday** (22:30 UTC Sunday):
   ```sql
   -- Schedule at 04:00 AM IST on Monday (22:30 UTC Sunday)
   SELECT cron.schedule(
     'weekly-achiever-badge',
     '30 22 * * 0',
     $$SELECT public.rpc_calculate_weekly_achiever('Asia/Kolkata')$$
   );
   ```
   *Rationale*: Sessions are strictly limited to 180 minutes (3 hours). Any session started before midnight Sunday is guaranteed to finish, timeout, and split into `study_sessions` before 03:00 AM IST. Running at 04:00 AM IST ensures 100% data finality.

2. **SQL Resilience Fix in `rpc_get_leaderboard`**:
   Allow past-week queries to inspect unclosed `session_blocks` that started before `v_week_end`:
   ```sql
   -- In completed_study CTE, also account for unclosed blocks from past week
   completed_study AS (
     SELECT s.user_id, COALESCE(SUM(s.duration_minutes), 0)::INTEGER AS study_mins
     FROM public.study_sessions s
     WHERE s.start_time >= v_week_start AND s.start_time < v_week_end
     GROUP BY s.user_id
     UNION ALL
     SELECT b.user_id, COALESCE(SUM(EXTRACT(EPOCH FROM (LEAST(COALESCE(b.end_time, NOW()), v_week_end) - b.start_time))), 0)::INTEGER / 60 AS study_mins
     FROM public.session_blocks b
     WHERE b.session_id IS NULL
       AND b.block_type = 'study'
       AND b.start_time >= v_week_start
       AND b.start_time < v_week_end
     GROUP BY b.user_id
   )
   ```

---

### BUG-04: Completed Tasks Attributed Exclusively to Monday's Split Session Row

#### 1. Problem Description
When `rpc_finish_session` executes a midnight split:
- Part 1 (Sunday) receives `completed_tasks = '[]'::JSONB`.
- Part 2 (Monday) receives `completed_tasks = v_session_completed_tasks`.
- In the student's study history and session logs:
  - Sunday session: 30 minutes studied, **0 goals completed**.
  - Monday session: 30 minutes studied, **3 goals completed**.
- Even if the student completed all tasks during the Sunday portion (e.g. at 23:45 IST), Sunday's session history displays 0 completed tasks.

#### 2. Root Cause Location
- **File**: `supabase/schema.sql`
- **Lines**: 780–795
```sql
    -- Insert Part 1 (Day 1)
    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
      VALUES (v_user_id, v_session_start, v_midnight, v_dur_1, 0, CASE WHEN v_dur_2 = 0 THEN v_session_completed_tasks ELSE '[]'::JSONB END)
      RETURNING id INTO v_session_id_1;
      ...
    END IF;

    -- Insert Part 2 (Day 2)
    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
      VALUES (v_user_id, v_midnight, v_session_actual_end, v_dur_2, v_break_minutes, v_session_completed_tasks)
      RETURNING id INTO v_session_id_2;
      ...
    END IF;
```

#### 3. Concrete Solution
In `rpc_finish_session`, assign completed tasks to Part 1 if the goal was active prior to midnight, or assign completed tasks to both split session rows (or distinguish which tasks occurred when):
```sql
    -- Insert Part 1 (Day 1 - Sunday)
    IF v_dur_1 > 0 OR v_dur_2 = 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
      VALUES (
        v_user_id,
        v_session_start,
        v_midnight,
        v_dur_1,
        0,
        -- If session had tasks completed, attribute to Part 1 if goal belonged to Day 1
        v_session_completed_tasks
      )
      RETURNING id INTO v_session_id_1;
      ...
    END IF;

    -- Insert Part 2 (Day 2 - Monday)
    IF v_dur_2 > 0 THEN
      INSERT INTO public.study_sessions (user_id, start_time, end_time, duration_minutes, break_minutes, completed_tasks)
      VALUES (
        v_user_id,
        v_midnight,
        v_session_actual_end,
        v_dur_2,
        v_break_minutes,
        v_session_completed_tasks
      )
      RETURNING id INTO v_session_id_2;
      ...
    END IF;
```

---

### BUG-05: Cross-Week Double-Counting of Completed Tasks on Leaderboard

#### 1. Problem Description
In `rpc_get_leaderboard`, `weekly_goals` filters `daily_goals` rows with:
```sql
WHERE (g.created_at >= v_week_start AND g.created_at < v_week_end)
   OR (g.expires_at > v_week_start AND g.created_at < v_week_start)
```
Consider a 20-hour goal created on **Sunday at 14:00 IST** (expires **Monday at 10:00 AM IST**):
1. **For Sunday's Week**: `g.created_at` falls between last Monday and this Monday $\implies$ **Included in Sunday's Leaderboard**.
2. **For Monday's Week**: `g.expires_at > v_week_start` ($10:00 > 00:00$) and `g.created_at < v_week_start` $\implies$ **Included in Monday's Leaderboard**.
- **User Impact**: The exact same completed tasks are credited to the student **twice** across two consecutive competition weeks. On Monday morning at 00:01 AM, other students start with 0 completed tasks, but this student already has 3 completed tasks on the board.

#### 2. Root Cause Location
- **File**: `supabase/schema.sql`
- **Lines**: 1238–1241
```sql
  weekly_goals AS (
    SELECT g.user_id,
           COALESCE(
             SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) ),
             0
           )::INTEGER AS completed_tasks_count,
           COALESCE(
             SUM(jsonb_array_length(g.tasks)),
             0
           )::INTEGER AS total_tasks_count,
           ...
    FROM public.daily_goals g
    WHERE (g.created_at >= v_week_start AND g.created_at < v_week_end)
       OR (g.expires_at > v_week_start AND g.created_at < v_week_start)
    GROUP BY g.user_id
  ),
```

#### 3. Concrete Solution
A goal window must belong authoritatively to a single week. Since goals are created dynamically, attribute each goal to the week of its `created_at`:

```sql
  weekly_goals AS (
    SELECT g.user_id,
           COALESCE(
             SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) ),
             0
           )::INTEGER AS completed_tasks_count,
           COALESCE(
             SUM(jsonb_array_length(g.tasks)),
             0
           )::INTEGER AS total_tasks_count,
           ...
    FROM public.daily_goals g
    -- Strictly isolate goals to the competition week in which they were initiated
    WHERE g.created_at >= v_week_start AND g.created_at < v_week_end
    GROUP BY g.user_id
  ),
```

---

### BUG-06: Session Split Task Association Mismatch in Goal Modal Save

#### 1. Problem Description
When a student finishes a session that crosses midnight:
- `rpc_finish_session` returns `session_id = v_session_id_2` (Monday's session).
- `pendingGoalSessionId` on the client is set to `v_session_id_2`.
- When the user selects tasks in `SessionGoalUpdateModal` and clicks "Save Goals":
  - It invokes `rpc_complete_session_goals(p_session_id: v_session_id_2, p_completed_task_ids)`.
  - In `rpc_complete_session_goals`:
    ```sql
    UPDATE public.study_sessions
    SET completed_tasks = COALESCE(completed_tasks, '[]'::JSONB) || v_session_completed_tasks
    WHERE id = p_session_id AND user_id = v_user_id;
    ```
- `v_session_id_1` (Sunday's session) is ignored and left with `completed_tasks = '[]'`.

#### 2. Root Cause Location
- **File**: `supabase/schema.sql` (lines 1962–1968)
- **File**: `hooks/useActiveSession.ts` (lines 692–697, 1255–1260)

#### 3. Concrete Solution
In `rpc_complete_session_goals`, detect whether `p_session_id` has an adjoining split session row from the same session run, and attach the completed tasks to both halves:

```sql
    -- 2. Link completed tasks to the target study_session and any adjoining midnight-split sibling
    IF p_session_id IS NOT NULL AND jsonb_array_length(v_session_completed_tasks) > 0 THEN
      UPDATE public.study_sessions
      SET completed_tasks = COALESCE(completed_tasks, '[]'::JSONB) || v_session_completed_tasks
      WHERE user_id = v_user_id
        AND (
          id = p_session_id
          OR id = (
            -- Locate adjoining Part 1 whose end_time matches Part 2's start_time
            SELECT s1.id
            FROM public.study_sessions s1
            JOIN public.study_sessions s2 ON s1.user_id = s2.user_id
            WHERE s2.id = p_session_id
              AND s1.end_time = s2.start_time
              AND s1.user_id = v_user_id
            LIMIT 1
          )
        );
    END IF;
```

---

### BUG-07: Mid-Session Expired Goals Missing on Monday Leaderboard

#### 1. Problem Description
- Suppose a student's 20-hour goal expires on **Sunday at 23:45 IST**.
- The student begins studying at **23:30 IST Sunday** and finishes at **00:30 IST Monday**.
- Because of Mid-Session Grace in `useDailyGoals.ts`, `SessionGoalUpdateModal` displays the tasks with `[Window ended mid-session]`.
- The student checks off the tasks and clicks "Save Goals".
- The tasks are saved to `daily_goals` and attached to Monday's `study_session`.
- However, on Monday's Leaderboard, `rpc_get_leaderboard` calculates `completed_tasks` solely from `daily_goals` where `expires_at > v_week_start`.
- Because the goal expired at 23:45 Sunday ($< 00:00$ Monday), it is excluded from Monday's leaderboard.
- **Discrepancy**: The student sees completed tasks in their Monday session history, but their Monday Leaderboard card says **0 completed tasks**.

#### 2. Root Cause Location
- **File**: `supabase/schema.sql` (lines 1222–1242)

#### 3. Concrete Solution
In `rpc_get_leaderboard`, supplement `weekly_goals` with tasks recorded directly in the week's `study_sessions` so that session-attributed tasks are never lost:

```sql
  weekly_goals AS (
    SELECT u.id AS user_id,
           COALESCE(
             GREATEST(
               -- Count from daily_goals created this week
               COALESCE((
                 SELECT SUM( (SELECT COUNT(*) FROM jsonb_array_elements(g.tasks) t WHERE (t->>'completed')::boolean = true) )
                 FROM public.daily_goals g
                 WHERE g.user_id = u.id AND g.created_at >= v_week_start AND g.created_at < v_week_end
               ), 0),
               -- Fallback: Count from study_sessions completed_tasks completed during this week
               COALESCE((
                 SELECT SUM(jsonb_array_length(s.completed_tasks))
                 FROM public.study_sessions s
                 WHERE s.user_id = u.id AND s.start_time >= v_week_start AND s.start_time < v_week_end
               ), 0)
             ), 0
           )::INTEGER AS completed_tasks_count,
           COALESCE((
             SELECT SUM(jsonb_array_length(g.tasks))
             FROM public.daily_goals g
             WHERE g.user_id = u.id AND g.created_at >= v_week_start AND g.created_at < v_week_end
           ), 0)::INTEGER AS total_tasks_count,
           ...
    FROM public.users u
  )
```

---

## Step-by-Step Implementation & Verification Plan

When you are ready to implement these fixes in Antigravity, follow this sequence:

### Phase 1: Database Migration (SQL)
1. Create migration file:
   `supabase/migrations/20260919_fix_weekly_transition_and_goal_attribution.sql`
2. Apply:
   - Updated `rpc_finish_session` (Midnight split task attribution - BUG-04).
   - Updated `rpc_complete_session_goals` (Sibling split session linking - BUG-06).
   - Updated `rpc_get_leaderboard` (Method B bounds - BUG-02, Single-week goal attribution - BUG-05, Session task fallback - BUG-07).
   - Updated `rpc_calculate_weekly_achiever` schedule (04:00 AM IST - BUG-03).
3. Mirror changes into `supabase/schema.sql` and `supabase/admin_rpcs.sql`.

### Phase 2: Frontend Client Updates
1. Edit `components/room/MemberCard.tsx` to clamp live session weekly seconds using `currentWeekStartMs` (BUG-01).
2. Edit `README.md` to reflect the 04:00 AM IST weekly achiever schedule (BUG-03).

### Phase 3: Automated Validation
Run the full test suite and build verification:
```bash
# 1. Run Vitest Unit & Integration Suite (must pass all 254+ tests)
npm test

# 2. Verify TypeScript types
npx tsc --noEmit

# 3. Verify Production Turbopack build
npm run build
```
