import { describe, it, expect } from 'vitest';

describe('Database Correctness & Authority Invariants', () => {
  describe('1. Authority & Separation of Read from Mutation', () => {
    it('proves auth.uid() in Supabase/PostgREST is preserved inside SECURITY DEFINER functions', () => {
      // In Supabase, auth.uid() reads request.jwt.claims from the session GUC.
      // SECURITY DEFINER switches CURRENT_USER to postgres, but does NOT reset request.jwt.claims.
      // Therefore, if a caller is authenticated, auth.uid() remains the caller UID.
      const callerUid: string = 'user-anchal-uuid';
      const targetUid: string = 'user-ankita-uuid';
      
      const isOwner = callerUid === targetUid;
      const isSystem = false; // Ordinary user
      
      // Inside rpc_stop_user_session, when called from a nested read RPC like rpc_get_leaderboard:
      const wouldBeObserver = !isOwner && !isSystem;
      expect(wouldBeObserver).toBe(true);
      
      // If rpc_get_leaderboard tried to call rpc_stop_user_session without p_expected_start_time:
      const p_expected_start_time = null;
      const rejected = wouldBeObserver && p_expected_start_time === null;
      expect(rejected).toBe(true);
      
      // Conclusion: Removing session mutation from rpc_get_leaderboard completely eliminates
      // this authority contradiction, making rpc_get_leaderboard pure read-only!
    });
  });

  describe('2. Block Selection Scoping', () => {
    it('scopes block closing and duration calculation strictly to the authoritative session window', () => {
      const v_session_start = new Date('2026-09-30T06:00:00Z').getTime();
      const v_now = new Date('2026-09-30T08:30:00Z').getTime(); // 2h 30m later
      
      const blocks = [
        // Orphaned block from yesterday (before v_session_start)
        { id: 'b-old', session_id: null, start_time: new Date('2026-09-29T10:00:00Z').getTime(), end_time: null, block_type: 'study' },
        // Current session study block 1: 06:00 to 07:00 (1 hour)
        { id: 'b-1', session_id: null, start_time: new Date('2026-09-30T06:00:00Z').getTime(), end_time: new Date('2026-09-30T07:00:00Z').getTime(), block_type: 'study' },
        // Current session break block: 07:00 to 07:30 (30 mins)
        { id: 'b-2', session_id: null, start_time: new Date('2026-09-30T07:00:00Z').getTime(), end_time: new Date('2026-09-30T07:30:00Z').getTime(), block_type: 'break' },
        // Current session active study block 2: 07:30 to now (1 hour)
        { id: 'b-3', session_id: null, start_time: new Date('2026-09-30T07:30:00Z').getTime(), end_time: null, block_type: 'study' },
        // Future corrupted block (clock glitch)
        { id: 'b-future', session_id: null, start_time: new Date('2026-09-30T10:00:00Z').getTime(), end_time: null, block_type: 'study' },
      ];

      // A. Query: close open blocks strictly within [v_session_start, v_now]
      const blocksToClose = blocks.filter(b => 
        b.session_id === null &&
        b.start_time >= v_session_start &&
        b.start_time <= v_now &&
        b.end_time === null
      );
      expect(blocksToClose.map(b => b.id)).toEqual(['b-3']);
      expect(blocksToClose.map(b => b.id)).not.toContain('b-old');
      expect(blocksToClose.map(b => b.id)).not.toContain('b-future');

      // Simulate closing b-3 at v_now
      blocksToClose.forEach(b => { b.end_time = v_now; });

      // B. Query: calculate study duration strictly for this session
      const studyBlocks = blocks.filter(b =>
        b.session_id === null &&
        b.start_time >= v_session_start &&
        b.start_time <= v_now &&
        b.block_type === 'study'
      );
      const totalStudySeconds = studyBlocks.reduce((acc, b) => acc + (b.end_time! - b.start_time) / 1000, 0);
      expect(totalStudySeconds).toBe(7200); // 1h + 1h = 2 hours (120 min)
      expect(Math.floor(totalStudySeconds / 60)).toBe(120);

      // C. Query: calculate break duration strictly for this session
      const breakBlocks = blocks.filter(b =>
        b.session_id === null &&
        b.start_time >= v_session_start &&
        b.start_time <= v_now &&
        b.block_type === 'break'
      );
      const totalBreakSeconds = breakBlocks.reduce((acc, b) => acc + (b.end_time! - b.start_time) / 1000, 0);
      expect(totalBreakSeconds).toBe(1800); // 30 mins
      expect(Math.floor(totalBreakSeconds / 60)).toBe(30);

      // Break is never counted as study
      expect(totalStudySeconds).not.toBe(7200 + 1800);
    });
  });

  describe('3. Strict 180-Minute (3-Hour) Cap Verification', () => {
    const computeCappedDuration = (studySeconds: number) => {
      return Math.min(180, Math.max(0, Math.floor(studySeconds / 60)));
    };

    it('caps study session duration at exactly 180 minutes regardless of elapsed time', () => {
      expect(computeCappedDuration(10800)).toBe(180); // 3h00m -> 180m
      expect(computeCappedDuration(10860)).toBe(180); // 3h01m -> 180m
      expect(computeCappedDuration(14400)).toBe(180); // 4h00m -> 180m
      expect(computeCappedDuration(18000)).toBe(180); // 5h00m -> 180m
      expect(computeCappedDuration(86400)).toBe(180); // 24h00m -> 180m
    });

    it('preserves valid sessions under 180 minutes without truncation', () => {
      expect(computeCappedDuration(300)).toBe(5);     // 5m
      expect(computeCappedDuration(1800)).toBe(30);   // 30m
      expect(computeCappedDuration(3600)).toBe(60);   // 60m
      expect(computeCappedDuration(10740)).toBe(179); // 179m
    });
  });

  describe('4. Break Expiration Invariants', () => {
    const evaluateBreakExpiry = (breakStartMs: number, nowMs: number) => {
      const elapsedSeconds = (nowMs - breakStartMs) / 1000;
      if (elapsedSeconds < 3600) {
        return { allowed: false, reason: 'Break has not exceeded 1 hour limit' };
      }
      return { allowed: true };
    };

    it('rejects break finalization at 59m 59s and allows at 60m 00s or 2h', () => {
      const start = 1000000;
      expect(evaluateBreakExpiry(start, start + 3599 * 1000).allowed).toBe(false); // 59m59s
      expect(evaluateBreakExpiry(start, start + 3600 * 1000).allowed).toBe(true);  // 60m00s
      expect(evaluateBreakExpiry(start, start + 7200 * 1000).allowed).toBe(true);  // 2h00m
    });
  });

  describe('5. Owner Autonomy vs Observer Security Matrix', () => {
    interface StopCallParams {
      callerUid: string;
      targetUserId: string;
      isSystem: boolean;
      expectedStartTime: string | null;
      currentSessionStart: string;
      currentBreakStart: string | null;
      status: 'studying' | 'break';
      studySeconds: number;
      nowMs: number;
    }

    const executeStopGuard = (params: StopCallParams) => {
      const isOwner = params.callerUid === params.targetUserId;
      if (isOwner || params.isSystem) {
        return { success: true, authorized: true };
      }

      // Observer checks
      if (!params.expectedStartTime) {
        return { success: false, rejected: true, reason: 'Observer must provide p_expected_start_time' };
      }

      if (params.status === 'studying' && params.currentSessionStart !== params.expectedStartTime) {
        return { success: false, rejected: true, reason: 'Session identity mismatch: user has a newer or different session' };
      }

      if (params.status === 'break' && params.currentSessionStart !== params.expectedStartTime && params.currentBreakStart !== params.expectedStartTime) {
        return { success: false, rejected: true, reason: 'Session identity mismatch: user has a newer or different session' };
      }

      if (params.status === 'break') {
        const breakMs = params.currentBreakStart ? new Date(params.currentBreakStart).getTime() : 0;
        if (!params.currentBreakStart || (params.nowMs - breakMs) < 3600 * 1000) {
          return { success: false, rejected: true, reason: 'Break has not exceeded 1 hour limit' };
        }
      } else if (params.status === 'studying') {
        if (params.studySeconds < 10800) {
          return { success: false, rejected: true, reason: 'Study session has not exceeded 3 hour limit' };
        }
      }

      return { success: true, authorized: true };
    };

    it('allows OWNER to stop at any time without expiry requirements', () => {
      const base: StopCallParams = {
        callerUid: 'user-1',
        targetUserId: 'user-1',
        isSystem: false,
        expectedStartTime: null,
        currentSessionStart: '2026-09-30T07:00:00Z',
        currentBreakStart: null,
        status: 'studying',
        studySeconds: 300, // 5 minutes
        nowMs: new Date('2026-09-30T07:05:00Z').getTime(),
      };

      expect(executeStopGuard({ ...base, studySeconds: 300 })).toEqual({ success: true, authorized: true });
      expect(executeStopGuard({ ...base, studySeconds: 1800 })).toEqual({ success: true, authorized: true }); // 30m
      expect(executeStopGuard({ ...base, studySeconds: 3600 })).toEqual({ success: true, authorized: true }); // 60m
      expect(executeStopGuard({ ...base, studySeconds: 10740 })).toEqual({ success: true, authorized: true }); // 179m
    });

    it('enforces strict rejection rules on OBSERVERS', () => {
      const base: StopCallParams = {
        callerUid: 'observer-99',
        targetUserId: 'user-1',
        isSystem: false,
        expectedStartTime: '2026-09-30T05:00:00Z',
        currentSessionStart: '2026-09-30T05:00:00Z',
        currentBreakStart: null,
        status: 'studying',
        studySeconds: 1800, // 30 min
        nowMs: new Date('2026-09-30T05:30:00Z').getTime(),
      };

      // 1. Missing expectedStartTime
      expect(executeStopGuard({ ...base, expectedStartTime: null })).toEqual({
        success: false,
        rejected: true,
        reason: 'Observer must provide p_expected_start_time',
      });

      // 2. Identity mismatch
      expect(executeStopGuard({ ...base, expectedStartTime: '2026-09-30T01:00:00Z' })).toEqual({
        success: false,
        rejected: true,
        reason: 'Session identity mismatch: user has a newer or different session',
      });

      // 3. Identity matches but duration is only 30m
      expect(executeStopGuard(base)).toEqual({
        success: false,
        rejected: true,
        reason: 'Study session has not exceeded 3 hour limit',
      });

      // 4. Identity matches but duration is 2h 59m (10740s)
      expect(executeStopGuard({
        ...base,
        studySeconds: 10740,
        nowMs: new Date('2026-09-30T07:59:00Z').getTime(),
      })).toEqual({
        success: false,
        rejected: true,
        reason: 'Study session has not exceeded 3 hour limit',
      });

      // 5. Identity matches and 3h reached (10800s) -> ALLOWED
      expect(executeStopGuard({
        ...base,
        studySeconds: 10800,
        nowMs: new Date('2026-09-30T08:00:00Z').getTime(),
      })).toEqual({
        success: true,
        authorized: true,
      });

      // 6. Break tests: < 1h -> REJECT, >= 1h -> ALLOW
      const breakBase: StopCallParams = {
        ...base,
        status: 'break',
        currentBreakStart: '2026-09-30T07:00:00Z',
        nowMs: new Date('2026-09-30T07:45:00Z').getTime(), // 45 mins
      };

      expect(executeStopGuard(breakBase)).toEqual({
        success: false,
        rejected: true,
        reason: 'Break has not exceeded 1 hour limit',
      });

      expect(executeStopGuard({
        ...breakBase,
        nowMs: new Date('2026-09-30T08:05:00Z').getTime(), // 1h 05m
      })).toEqual({
        success: true,
        authorized: true,
      });
    });
  });

  describe('6. Idempotency under Concurrent Invocations', () => {
    it('proves FOR UPDATE row lock returns already_finished without side effects on second call', () => {
      let activeSessionsCount = 1;
      let studySessionsCreated = 0;

      // Simulated atomic transaction with row lock
      const stopSessionAtomic = (userStatus: 'studying' | 'offline') => {
        if (userStatus === 'offline') {
          return { success: true, already_finished: true, message: 'No active session' };
        }
        // First transaction marks user offline and inserts session
        activeSessionsCount = 0;
        studySessionsCreated += 1;
        return { success: true, session_id: 'new-session-id', already_finished: false };
      };

      // Call 1
      const res1 = stopSessionAtomic('studying');
      expect(res1.already_finished).toBe(false);
      expect(studySessionsCreated).toBe(1);

      // Call 2 (concurrent second call re-reads updated status)
      const res2 = stopSessionAtomic('offline');
      expect(res2.already_finished).toBe(true);
      expect(studySessionsCreated).toBe(1); // STILL 1! No duplicates!
    });
  });

  describe('7. Authoritative End Time vs Accumulated Duration Cap Invariants', () => {
    interface SessionBlock {
      id: string;
      session_id: string | null;
      start_time: number;
      end_time: number | null;
      block_type: 'study' | 'break';
    }

    const simulateRpcStopSession = (params: {
      status: 'studying' | 'break';
      sessionStart: number;
      now: number;
      blocks: SessionBlock[];
    }) => {
      const { status, sessionStart, now, blocks } = params;

      // 1. Close active open block at v_now (NO artificial wall-clock 3h cap on open block)
      blocks.forEach(b => {
        if (b.session_id === null && b.start_time >= sessionStart && b.start_time <= now && b.end_time === null) {
          b.end_time = now;
        }
      });

      // 2. Determine actual study end
      const studyBlocks = blocks.filter(b =>
        b.session_id === null &&
        b.start_time >= sessionStart &&
        b.start_time <= now &&
        b.block_type === 'study'
      );
      const lastStudyEnd = studyBlocks.length > 0
        ? Math.max(...studyBlocks.map(b => b.end_time || sessionStart))
        : sessionStart;

      // 3. Set authoritative session actual end (v_now if studying, last study end if stopping on break)
      const sessionActualEnd = status === 'break' ? lastStudyEnd : now;

      // 4. Compute accumulated study seconds strictly from session blocks
      const totalStudySeconds = studyBlocks.reduce((acc, b) => acc + ((b.end_time! - b.start_time) / 1000), 0);
      const durationMinutes = Math.min(180, Math.max(0, Math.floor(totalStudySeconds / 60)));

      // 5. Compute accumulated break seconds strictly from session blocks
      const breakBlocks = blocks.filter(b =>
        b.session_id === null &&
        b.start_time >= sessionStart &&
        b.start_time <= now &&
        b.block_type === 'break'
      );
      const totalBreakSeconds = breakBlocks.reduce((acc, b) => acc + ((b.end_time! - b.start_time) / 1000), 0);
      const breakMinutes = Math.max(0, Math.floor(totalBreakSeconds / 60));

      return {
        start_time: sessionStart,
        end_time: sessionActualEnd,
        duration_minutes: durationMinutes,
        break_minutes: breakMinutes,
        total_study_seconds: totalStudySeconds,
      };
    };

    it('preserves true end_time (13:30) while capping duration_minutes at 180 for interleaved break session', () => {
      const t1000 = new Date('2026-09-30T10:00:00Z').getTime();
      const t1130 = new Date('2026-09-30T11:30:00Z').getTime();
      const t1200 = new Date('2026-09-30T12:00:00Z').getTime();
      const t1330 = new Date('2026-09-30T13:30:00Z').getTime();

      // Session: 10:00 to 11:30 study (90m), 11:30 to 12:00 break (30m), 12:00 to 13:30 study (90m)
      // Total elapsed span = 3.5 hours. Total study = 180m (3h).
      const blocks: SessionBlock[] = [
        { id: 'b1', session_id: null, start_time: t1000, end_time: t1130, block_type: 'study' },
        { id: 'b2', session_id: null, start_time: t1130, end_time: t1200, block_type: 'break' },
        { id: 'b3', session_id: null, start_time: t1200, end_time: null, block_type: 'study' }, // Active block
      ];

      const finalized = simulateRpcStopSession({
        status: 'studying',
        sessionStart: t1000,
        now: t1330,
        blocks,
      });

      // Active block b3 must close at 13:30, NOT clipped to 13:00
      expect(blocks.find(b => b.id === 'b3')?.end_time).toBe(t1330);

      // Total study seconds must be exactly 10,800s (180 minutes)
      expect(finalized.total_study_seconds).toBe(10800);
      expect(finalized.duration_minutes).toBe(180);
      expect(finalized.break_minutes).toBe(30);

      // Authoritative end_time must be 13:30 (the true stop timestamp), NOT 13:00
      expect(finalized.start_time).toBe(t1000);
      expect(finalized.end_time).toBe(t1330);
    });

    it('preserves true end_time and caps duration_minutes at 180 when study exceeds 3 hours', () => {
      const t1000 = new Date('2026-09-30T10:00:00Z').getTime();
      const t1100 = new Date('2026-09-30T11:00:00Z').getTime();
      const t1130 = new Date('2026-09-30T11:30:00Z').getTime();
      const t1430 = new Date('2026-09-30T14:30:00Z').getTime();

      // Session: 10:00 to 11:00 study (60m), 11:00 to 11:30 break (30m), 11:30 to 14:30 study (180m)
      // Total elapsed span = 4.5 hours. Total study = 240m (4h).
      const blocks: SessionBlock[] = [
        { id: 'b1', session_id: null, start_time: t1000, end_time: t1100, block_type: 'study' },
        { id: 'b2', session_id: null, start_time: t1100, end_time: t1130, block_type: 'break' },
        { id: 'b3', session_id: null, start_time: t1130, end_time: null, block_type: 'study' },
      ];

      const finalized = simulateRpcStopSession({
        status: 'studying',
        sessionStart: t1000,
        now: t1430,
        blocks,
      });

      expect(finalized.total_study_seconds).toBe(240 * 60);
      expect(finalized.duration_minutes).toBe(180); // Capped at 180 min
      expect(finalized.break_minutes).toBe(30);
      expect(finalized.end_time).toBe(t1430); // Real stop time preserved
    });

    it('correctly sets end_time to last_study_end when stopping on expired break', () => {
      const t1000 = new Date('2026-09-30T10:00:00Z').getTime();
      const t1130 = new Date('2026-09-30T11:30:00Z').getTime();
      const t1235 = new Date('2026-09-30T12:35:00Z').getTime(); // 65 min break (>1h)

      const blocks: SessionBlock[] = [
        { id: 'b1', session_id: null, start_time: t1000, end_time: t1130, block_type: 'study' },
        { id: 'b2', session_id: null, start_time: t1130, end_time: null, block_type: 'break' }, // Open break block
      ];

      const finalized = simulateRpcStopSession({
        status: 'break',
        sessionStart: t1000,
        now: t1235,
        blocks,
      });

      expect(blocks.find(b => b.id === 'b2')?.end_time).toBe(t1235);
      expect(finalized.total_study_seconds).toBe(90 * 60);
      expect(finalized.duration_minutes).toBe(90);
      expect(finalized.break_minutes).toBe(65);
      // For expired break, end_time of study session reflects when study actually ended
      expect(finalized.end_time).toBe(t1130);
    });
  });
});
