"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, SessionBlock, UserStatus } from "@/lib/supabase/types";
import {
  calculateActiveStudySeconds,
  calculateMemberElapsedStudySeconds,
  MAX_SESSION_STUDY_SECONDS,
} from "@/lib/time/format";
import {
  calculateBreakStatus,
  BreakStatusResult,
  getEffectiveMemberStatus,
  isMemberBreakExpired,
} from "@/lib/time/break";
import {
  getServerNow,
  calibrateWithServerTime,
  getServerTimeOffset,
} from "@/lib/time/clockSync";
import {
  with10sTimeout,
  saveOfflineActiveSession,
  getOfflineActiveSession,
  clearOfflineActiveSession,
  updateOfflineActiveSession,
  saveOfflineCompletedSession,
  removeOfflineCompletedSession,
  enqueueSessionAction,
  removeSessionAction,
  removeActiveTransitionActions,
  sanitizeSessionQueue,
  flushSessionActionQueue,
  CompletedOfflineSessionRecord,
  OfflineSessionBlock,
} from "@/lib/offline/sessionQueue";

type RpcCaller = {
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export function useActiveSession(
  profile: UserProfile | null,
  onStatusChange?: (newStatus?: UserStatus) => void
) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [elapsedStudySeconds, setElapsedStudySeconds] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Optimistic & Offline status override
  const [localStatusOverride, setLocalStatusOverride] = useState<UserStatus | null>(null);

  // 1-Hour Break Expiry State
  const [isBreakExpiredNoticeOpen, setIsBreakExpiredNoticeOpen] = useState(false);
  const [savedStudySecondsOnBreakExpiry, setSavedStudySecondsOnBreakExpiry] = useState(0);
  const isAutoTerminatingRef = useRef(false);
  const dismissedBreakExpiryRef = useRef(false);

  // 3-Hour Maximum Session Limit State
  const [isSessionLimitNoticeOpen, setIsSessionLimitNoticeOpen] = useState(false);
  const [savedStudySecondsOnLimit, setSavedStudySecondsOnLimit] = useState(0);
  const isAutoTerminatingLimitRef = useRef(false);
  const hasTriggeredTenMinWarningRef = useRef(false);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const supabase = createClient();

  // Compute status: localStatusOverride takes precedence for instant 0ms offline responsiveness
  const serverRawStatus: UserStatus = profile?.current_status ?? "offline";
  const serverEffectiveStatus: UserStatus = profile
    ? getEffectiveMemberStatus(profile, getServerNow())
    : "offline";

  const currentStatus: UserStatus = localStatusOverride ?? serverRawStatus;
  const effectiveStatus: UserStatus = localStatusOverride ?? serverEffectiveStatus;

  const actionLoadingRef = useRef(actionLoading);
  actionLoadingRef.current = actionLoading;

  const elapsedStudySecondsRef = useRef(elapsedStudySeconds);
  elapsedStudySecondsRef.current = elapsedStudySeconds;

  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const localStatusOverrideRef = useRef(localStatusOverride);
  localStatusOverrideRef.current = localStatusOverride;

  const actionSeqRef = useRef<number>(0);
  const lastActionTimestampRef = useRef<number>(0);
  const initialBreakStartIsoRef = useRef<string | null>(null);

  // Clear local override when server profile catches up to the intended state,
  // or when an external device updates the profile and the local action has settled (>2.5s)
  useEffect(() => {
    if (!localStatusOverride) return;
    if (profile && profile.current_status === localStatusOverride) {
      setLocalStatusOverride(null);
      return;
    }
    const elapsedSinceAction = Date.now() - lastActionTimestampRef.current;
    if (elapsedSinceAction > 2500) {
      setLocalStatusOverride(null);
    }
  }, [profile, localStatusOverride]);

  // Safety timer to guarantee localStatusOverride never lingers beyond 3.5 seconds
  useEffect(() => {
    if (!localStatusOverride) return;
    const timer = setTimeout(() => {
      setLocalStatusOverride(null);
    }, 3500);
    return () => clearTimeout(timer);
  }, [localStatusOverride]);

  // -----------------------------------------------------------------------
  // RESTORATION ON MOUNT: Check disk for active session (Closed-App Support)
  // -----------------------------------------------------------------------
  useEffect(() => {
    sanitizeSessionQueue();

    const offlineSession = getOfflineActiveSession();
    if (!offlineSession) return;

    const now = new Date();
    const sessionBlocks = (offlineSession.blocks || []) as SessionBlock[];

    if (offlineSession.status === "studying") {
      const accrued = calculateActiveStudySeconds(sessionBlocks, now);
      if (accrued >= MAX_SESSION_STUDY_SECONDS) {
        // Exceeded 3 hours while app was closed
        setSavedStudySecondsOnLimit(MAX_SESSION_STUDY_SECONDS);
        setIsSessionLimitNoticeOpen(true);
        clearOfflineActiveSession();
        setBlocks([]);
        setElapsedStudySeconds(0);
        setLocalStatusOverride("offline");
        if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
      } else {
        setBlocks(sessionBlocks);
        setElapsedStudySeconds(accrued);
        setLocalStatusOverride("studying");
        if (onStatusChangeRef.current) onStatusChangeRef.current("studying");
      }
    } else if (offlineSession.status === "break" && offlineSession.breakStartedAt) {
      const breakMs = now.getTime() - new Date(offlineSession.breakStartedAt).getTime();
      if (breakMs >= 3600 * 1000) {
        // Break exceeded 1 hour while app was closed
        const accrued = offlineSession.elapsedStudySeconds || 0;
        setSavedStudySecondsOnBreakExpiry(accrued);
        setIsBreakExpiredNoticeOpen(true);
        clearOfflineActiveSession();
        setBlocks([]);
        setElapsedStudySeconds(0);
        setLocalStatusOverride("offline");
        if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
      } else {
        setBlocks(sessionBlocks);
        setElapsedStudySeconds(offlineSession.elapsedStudySeconds || 0);
        setLocalStatusOverride("break");
        initialBreakStartIsoRef.current = offlineSession.breakStartedAt;
        if (onStatusChangeRef.current) onStatusChangeRef.current("break");

        // Calibrate local break start ms for Android Notification Chronometer
        if (typeof window !== "undefined") {
          try {
            const serverOffset = getServerTimeOffset();
            const serverBreakStartMs = new Date(offlineSession.breakStartedAt).getTime();
            const localBreakStartMs = serverBreakStartMs - serverOffset;
            localStorage.setItem(
              "studyroom_active_break",
              JSON.stringify({
                userId: offlineSession.userId || profileRef.current?.id || "offline_user",
                breakStartedAt: new Date(localBreakStartMs).toISOString(),
                localBreakStartMs,
                serverBreakStartedAt: offlineSession.breakStartedAt,
                accruedSeconds: offlineSession.elapsedStudySeconds || 0,
              })
            );
            if ((window as any).AndroidBridge?.onSessionStateResolved) {
              (window as any).AndroidBridge.onSessionStateResolved(
                true,
                localBreakStartMs,
                offlineSession.elapsedStudySeconds || 0,
                false,
                0,
                ""
              );
            }
          } catch {}
        }
      }
    }
  }, []);

  // Check if an offline user had an expired break that ended while offline / in background
  useEffect(() => {
    if (typeof window === "undefined" || !profile || currentStatus === "break") return;
    if (dismissedBreakExpiryRef.current) return;

    if (
      profile.last_break_expired_study_seconds !== null &&
      profile.last_break_expired_study_seconds !== undefined
    ) {
      setSavedStudySecondsOnBreakExpiry(profile.last_break_expired_study_seconds);
      setIsBreakExpiredNoticeOpen(true);
    }
  }, [profile, currentStatus]);

  // -----------------------------------------------------------------------
  // BACKGROUND SYNC WORKER LISTENERS (Event-Driven, No Polling Spikes)
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handleSync = () => {
      flushSessionActionQueue(supabase);
    };

    handleSync();

    window.addEventListener("online", handleSync);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        handleSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("online", handleSync);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [supabase]);

  // -----------------------------------------------------------------------
  // BREAK NOTIFICATION & CHRONOMETER SYNCHRONIZATION
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (effectiveStatus === "break") {
      const openBreak = blocksRef.current.find((b) => b.block_type === "break" && !b.end_time);
      if (!initialBreakStartIsoRef.current) {
        initialBreakStartIsoRef.current =
          openBreak?.start_time || profileRef.current?.break_started_at || getServerNow().toISOString();
      }

      if (typeof window !== "undefined" && initialBreakStartIsoRef.current) {
        try {
          const serverOffset = getServerTimeOffset();
          const serverBreakStartMs = new Date(initialBreakStartIsoRef.current).getTime();
          const localBreakStartMs = serverBreakStartMs - serverOffset;
          const currentAccrued = elapsedStudySecondsRef.current;

          localStorage.setItem(
            "studyroom_active_break",
            JSON.stringify({
              userId: profileRef.current?.id || "offline_user",
              breakStartedAt: new Date(localBreakStartMs).toISOString(),
              localBreakStartMs,
              serverBreakStartedAt: initialBreakStartIsoRef.current,
              accruedSeconds: currentAccrued,
            })
          );
          if ((window as any).AndroidBridge?.onSessionStateResolved) {
            (window as any).AndroidBridge.onSessionStateResolved(
              true,
              localBreakStartMs,
              currentAccrued,
              false,
              0,
              ""
            );
          }
        } catch {}
      }
    } else {
      initialBreakStartIsoRef.current = null;
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("studyroom_active_break");
          if ((window as any).AndroidBridge?.onSessionStateResolved) {
            if (effectiveStatus === "studying") {
              const studyStartMs = profileRef.current?.session_start_time
                ? new Date(profileRef.current.session_start_time).getTime() - getServerTimeOffset()
                : Date.now();
              (window as any).AndroidBridge.onSessionStateResolved(
                false,
                0,
                elapsedStudySecondsRef.current,
                true,
                studyStartMs,
                profileRef.current?.current_focus || ""
              );
            } else {
              (window as any).AndroidBridge.onSessionStateResolved(
                false,
                0,
                0,
                false,
                0,
                ""
              );
            }
          }
        } catch {}
      }
    }
  }, [effectiveStatus, profile?.break_started_at]);

  // -----------------------------------------------------------------------
  // FETCH SESSION BLOCKS (When Online)
  // -----------------------------------------------------------------------
  const fetchSessionBlocks = useCallback(async () => {
    if (!profile || effectiveStatus === "offline" || profile.current_status === "offline") {
      const offlineSession = getOfflineActiveSession();
      if (!offlineSession) {
        setBlocks([]);
        setElapsedStudySeconds(0);
      }
      return;
    }

    try {
      const { data, error: blockErr } = await with10sTimeout(
        supabase
          .from("session_blocks")
          .select("*")
          .eq("user_id", profile.id)
          .is("session_id", null)
          .order("start_time", { ascending: true }),
        "Fetch session blocks"
      );

      if (blockErr) {
        console.warn("Error fetching session blocks (preserving local blocks):", blockErr);
        return;
      }

      // If user recently toggled locally (local override is active), don't overwrite with stale server blocks
      if (localStatusOverrideRef.current) {
        return;
      }

      const fetchedBlocks = (data || []) as SessionBlock[];
      if (fetchedBlocks.length > 0) {
        setBlocks(fetchedBlocks);
        const serverNow = getServerNow();
        setElapsedStudySeconds(calculateMemberElapsedStudySeconds(profile, serverNow));
      }
    } catch (err) {
      console.warn("Network error fetching blocks, using local state:", err);
    }
  }, [supabase, profile, effectiveStatus]);

  useEffect(() => {
    fetchSessionBlocks();
  }, [fetchSessionBlocks]);

  // Real-time subscription to current user's session_blocks (Multi-device synchronization)
  useEffect(() => {
    if (!profile?.id || !supabase?.channel) return;
    try {
      const channel = (supabase as any)
        .channel(`user:session_blocks:${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "session_blocks",
            filter: `user_id=eq.${profile.id}`,
          },
          () => {
            fetchSessionBlocks();
          }
        )
        .subscribe();

      return () => {
        try {
          if (supabase.removeChannel) {
            supabase.removeChannel(channel);
          }
        } catch {}
      };
    } catch {}
  }, [supabase, profile?.id, fetchSessionBlocks]);

  // -----------------------------------------------------------------------
  // FINISH SESSION (STOP)
  // -----------------------------------------------------------------------
  const finishSession = useCallback(
    async (completedTaskIds: string[] = []) => {
      const now = Date.now();
      if (now - lastActionTimestampRef.current < 250) return;
      lastActionTimestampRef.current = now;

      const currentSeq = ++actionSeqRef.current;
      setError(null);

      initialBreakStartIsoRef.current = null;
      const nowIso = getServerNow().toISOString();
      const currentBlocks = blocksRef.current;
      const offlineSession = getOfflineActiveSession();

      // 1. Finalize blocks locally: close open block
      const finalBlocks: SessionBlock[] = currentBlocks.map((b) =>
        !b.end_time ? { ...b, end_time: nowIso } : b
      );

      // 2. Compute exact active study duration in seconds
      const totalActiveSeconds = calculateActiveStudySeconds(finalBlocks, new Date(nowIso));
      const durationMinutes = Math.min(180, Math.max(0, Math.floor(totalActiveSeconds / 60)));

      // 3. Build offline completed session record for immediate History view
      const offlineRecord: CompletedOfflineSessionRecord = {
        id: offlineSession?.sessionId || "offline_" + now,
        user_id: profileRef.current?.id || offlineSession?.userId || "offline_user",
        start_time: offlineSession?.startTime || finalBlocks[0]?.start_time || nowIso,
        end_time: nowIso,
        duration_minutes: durationMinutes,
        completed_tasks: (completedTaskIds || []).map((id) => ({ id, task: "Completed Task" })),
        blocks: finalBlocks.map((b) => ({
          id: b.id,
          block_type: b.block_type as "study" | "break",
          start_time: b.start_time,
          end_time: b.end_time || nowIso,
        })),
        created_at: nowIso,
        is_offline_created: true,
      };

      // Save to local history cache
      saveOfflineCompletedSession(offlineRecord);

      // Clean up active session from disk
      clearOfflineActiveSession();
      removeActiveTransitionActions();
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("studyroom_active_break");
          localStorage.removeItem("studyroom_active_study");
          if ((window as any).AndroidBridge?.onSessionStateResolved) {
            (window as any).AndroidBridge.onSessionStateResolved(
              false,
              0,
              totalActiveSeconds,
              false,
              0,
              ""
            );
          }
        } catch {}
      }

      // 4. Update UI in 0ms (Student is NEVER locked)
      setLocalStatusOverride("offline");
      setBlocks([]);
      setElapsedStudySeconds(0);
      dismissedBreakExpiryRef.current = true;
      if (onStatusChangeRef.current) onStatusChangeRef.current("offline");

      // 5. Attempt immediate fast sync with 10s safety timeout
      try {
        const { data, error: rpcErr } = await with10sTimeout(
          (supabase as unknown as RpcCaller).rpc("rpc_finish_session", {
            p_completed_task_ids: completedTaskIds,
          }),
          "Finish session RPC"
        );

        if (currentSeq !== actionSeqRef.current) return;

        if (!rpcErr && data) {
          const res = data as { success: boolean; server_now?: string; error?: string };
          if (res.server_now) calibrateWithServerTime(res.server_now);
          // Server accepted session; remove temporary offline duplicate & clear active transitions
          removeOfflineCompletedSession(offlineRecord.id);
          removeActiveTransitionActions();
        } else if (rpcErr) {
          // If network failed, enqueue to ensure it gets synced when reconnected
          enqueueSessionAction("finish_session", {
            completedTaskIds,
            elapsedStudySeconds: totalActiveSeconds,
            payload: { session: offlineRecord },
          });
        }
      } catch (err) {
        console.warn("Fast finish sync timed out or offline; safely queued on disk:", err);
        if (currentSeq === actionSeqRef.current) {
          enqueueSessionAction("finish_session", {
            completedTaskIds,
            elapsedStudySeconds: totalActiveSeconds,
            payload: { session: offlineRecord },
          });
        }
      }

      return { success: true };
    },
    [supabase]
  );

  // -----------------------------------------------------------------------
  // 1-HOUR BREAK INACTIVITY RULE MONITOR
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (currentStatus !== "break") {
      isAutoTerminatingRef.current = false;
      return;
    }

    const checkBreakTimeout = async () => {
      if (isAutoTerminatingRef.current) return;

      const openBreak = blocksRef.current.find((b) => b.block_type === "break" && !b.end_time);
      const breakStart = profileRef.current?.break_started_at || openBreak?.start_time;
      if (!breakStart) return;

      const serverNow = getServerNow();
      const breakStatus: BreakStatusResult = calculateBreakStatus(breakStart, serverNow);

      if (breakStatus.isExpired) {
        isAutoTerminatingRef.current = true;
        const accruedSeconds =
          profileRef.current?.active_study_seconds_snapshot || elapsedStudySecondsRef.current;
        setSavedStudySecondsOnBreakExpiry(accruedSeconds);

        try {
          await finishSession([]);
        } catch (terminateErr) {
          console.warn("Auto-termination on break expiry notice:", terminateErr);
        } finally {
          setError(null);
          dismissedBreakExpiryRef.current = false;
          setIsBreakExpiredNoticeOpen(true);
          if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
        }
      }
    };

    checkBreakTimeout();
    const intervalId = setInterval(checkBreakTimeout, 2000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkBreakTimeout();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [currentStatus, finishSession]);

  // -----------------------------------------------------------------------
  // 3-HOUR MAXIMUM SESSION LIMIT MONITOR
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (currentStatus !== "studying" && currentStatus !== "break") {
      isAutoTerminatingLimitRef.current = false;
      hasTriggeredTenMinWarningRef.current = false;
      return;
    }

    const checkSessionLimit = async () => {
      if (isAutoTerminatingLimitRef.current) return;

      const serverNow = getServerNow();
      let currentAccrued = 0;
      if (profileRef.current) {
        currentAccrued = calculateMemberElapsedStudySeconds(profileRef.current, serverNow);
      } else {
        currentAccrued = calculateActiveStudySeconds(blocksRef.current, serverNow);
      }

      // 10-Minute Warning
      if (currentAccrued >= 10200 && currentAccrued < MAX_SESSION_STUDY_SECONDS) {
        if (!hasTriggeredTenMinWarningRef.current) {
          hasTriggeredTenMinWarningRef.current = true;
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("⏳ 10 Minutes Left in Study Session", {
                body: "Your 3-hour study session will automatically end in 10 minutes. Wrap up your goals or take a break to save your streak!",
                icon: "/icon-192.png",
              });
            } catch {}
          }
        }
      }

      if (currentAccrued >= MAX_SESSION_STUDY_SECONDS) {
        isAutoTerminatingLimitRef.current = true;
        setSavedStudySecondsOnLimit(MAX_SESSION_STUDY_SECONDS);

        try {
          await finishSession([]);
        } catch (terminateErr) {
          console.warn("Auto-termination on 3-hour limit:", terminateErr);
        } finally {
          setError(null);
          setIsSessionLimitNoticeOpen(true);
          if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
        }
      }
    };

    checkSessionLimit();
    const intervalId = setInterval(checkSessionLimit, 2000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") checkSessionLimit();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [currentStatus, finishSession]);

  // -----------------------------------------------------------------------
  // LIVE TIMER TICK LOOP (1-Second Local Precision)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (currentStatus !== "studying") return;

    const computeCurrentSeconds = (now: Date) => {
      const p = profileRef.current;
      const b = blocksRef.current;
      if (p && !localStatusOverride) {
        return calculateMemberElapsedStudySeconds(p, now);
      }
      return calculateActiveStudySeconds(b, now);
    };

    const tick = () => {
      setElapsedStudySeconds(computeCurrentSeconds(getServerNow()));
    };

    tick();
    const intervalId = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [currentStatus, localStatusOverride]);

  // -----------------------------------------------------------------------
  // START SESSION
  // -----------------------------------------------------------------------
  const startSession = async () => {
    dismissedBreakExpiryRef.current = false;
    const now = Date.now();
    if (now - lastActionTimestampRef.current < 250) return;
    lastActionTimestampRef.current = now;

    const currentSeq = ++actionSeqRef.current;
    setError(null);

    const nowIso = getServerNow().toISOString();
    const newBlock: SessionBlock = {
      id: "block_" + now,
      user_id: profileRef.current?.id || "offline_user",
      session_id: null,
      block_type: "study",
      start_time: nowIso,
      end_time: null,
    };

    // 1. Commit active session to disk immediately (Survived closed app)
    saveOfflineActiveSession({
      sessionId: "session_" + now,
      userId: profileRef.current?.id || "offline_user",
      startTime: nowIso,
      status: "studying",
      elapsedStudySeconds: 0,
      lastResumedAt: nowIso,
      breakStartedAt: null,
      blocks: [newBlock as OfflineSessionBlock],
      updatedAt: nowIso,
    });

    // 2. Instant UI transition at t=0
    setLocalStatusOverride("studying");
    setBlocks([newBlock]);
    setElapsedStudySeconds(0);
    if (onStatusChangeRef.current) onStatusChangeRef.current("studying");

    // 3. Remote RPC with 10s safety timeout
    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_start_session", { p_focus: null }),
        "Start session RPC"
      );

      if (currentSeq !== actionSeqRef.current) return;

      if (!rpcErr && data) {
        removeActiveTransitionActions();
        const res = data as { success: boolean; server_now?: string };
        if (res.server_now) calibrateWithServerTime(res.server_now);
        await fetchSessionBlocks();
      } else if (rpcErr) {
        enqueueSessionAction("start_session");
      }
    } catch (err) {
      console.warn("Start session fast sync timed out or offline; safely queued:", err);
      if (currentSeq === actionSeqRef.current) {
        enqueueSessionAction("start_session");
      }
    }
  };

  // -----------------------------------------------------------------------
  // PAUSE SESSION
  // -----------------------------------------------------------------------
  const pauseSession = async () => {
    const now = Date.now();
    if (now - lastActionTimestampRef.current < 250) return;
    lastActionTimestampRef.current = now;

    const currentSeq = ++actionSeqRef.current;
    setError(null);

    const nowIso = getServerNow().toISOString();
    const currentStudySeconds = elapsedStudySecondsRef.current;
    initialBreakStartIsoRef.current = nowIso;

    // 1. Close current study block and open break block
    const updatedBlocks: SessionBlock[] = blocksRef.current.map((b) =>
      !b.end_time && b.block_type === "study" ? { ...b, end_time: nowIso } : b
    );
    const breakBlock: SessionBlock = {
      id: "block_break_" + now,
      user_id: profileRef.current?.id || "offline_user",
      session_id: null,
      block_type: "break",
      start_time: nowIso,
      end_time: null,
    };
    updatedBlocks.push(breakBlock);

    // 2. Persist to disk (Survived closed app)
    updateOfflineActiveSession((prev) => ({
      ...prev,
      status: "break",
      breakStartedAt: nowIso,
      elapsedStudySeconds: currentStudySeconds,
      blocks: updatedBlocks as OfflineSessionBlock[],
      updatedAt: nowIso,
    }));

    if (typeof window !== "undefined") {
      try {
        const localBreakStartMs = now;
        localStorage.setItem(
          "studyroom_active_break",
          JSON.stringify({
            userId: profileRef.current?.id || "offline_user",
            breakStartedAt: new Date(localBreakStartMs).toISOString(),
            localBreakStartMs,
            serverBreakStartedAt: nowIso,
            accruedSeconds: currentStudySeconds,
          })
        );
        if ((window as any).AndroidBridge?.onSessionStateResolved) {
          (window as any).AndroidBridge.onSessionStateResolved(
            true,
            localBreakStartMs,
            currentStudySeconds,
            false,
            0,
            ""
          );
        }
      } catch {}
    }

    // 3. Instant UI transition at t=0
    setLocalStatusOverride("break");
    setBlocks(updatedBlocks);
    setElapsedStudySeconds(currentStudySeconds);
    if (onStatusChangeRef.current) onStatusChangeRef.current("break");

    // 4. Remote RPC with 10s safety timeout
    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_pause_session"),
        "Pause session RPC"
      );

      if (currentSeq !== actionSeqRef.current) return;

      if (!rpcErr && data) {
        removeActiveTransitionActions();
        const res = data as { success: boolean; server_now?: string };
        if (res.server_now) calibrateWithServerTime(res.server_now);
        await fetchSessionBlocks();
      } else if (rpcErr) {
        enqueueSessionAction("pause_session", { elapsedStudySeconds: currentStudySeconds });
      }
    } catch (err) {
      console.warn("Pause session fast sync timed out or offline; safely queued:", err);
      if (currentSeq === actionSeqRef.current) {
        enqueueSessionAction("pause_session", { elapsedStudySeconds: currentStudySeconds });
      }
    }
  };

  // -----------------------------------------------------------------------
  // RESUME SESSION
  // -----------------------------------------------------------------------
  const resumeSession = async (): Promise<{ success: boolean; expired?: boolean }> => {
    const now = Date.now();
    if (now - lastActionTimestampRef.current < 250) return { success: false };
    lastActionTimestampRef.current = now;

    const currentSeq = ++actionSeqRef.current;
    setError(null);

    initialBreakStartIsoRef.current = null;
    const nowIso = getServerNow().toISOString();

    // 1. Close current break block and open study block
    const updatedBlocks: SessionBlock[] = blocksRef.current.map((b) =>
      !b.end_time && b.block_type === "break" ? { ...b, end_time: nowIso } : b
    );
    const studyBlock: SessionBlock = {
      id: "block_study_" + now,
      user_id: profileRef.current?.id || "offline_user",
      session_id: null,
      block_type: "study",
      start_time: nowIso,
      end_time: null,
    };
    updatedBlocks.push(studyBlock);

    // 2. Persist to disk
    updateOfflineActiveSession((prev) => ({
      ...prev,
      status: "studying",
      breakStartedAt: null,
      lastResumedAt: nowIso,
      blocks: updatedBlocks as OfflineSessionBlock[],
      updatedAt: nowIso,
    }));

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("studyroom_active_break");
        if ((window as any).AndroidBridge?.onSessionStateResolved) {
          (window as any).AndroidBridge.onSessionStateResolved(
            false,
            0,
            elapsedStudySecondsRef.current,
            true,
            now,
            profileRef.current?.current_focus || ""
          );
        }
      } catch {}
    }

    // 3. Instant UI transition at t=0
    setLocalStatusOverride("studying");
    setBlocks(updatedBlocks);
    if (onStatusChangeRef.current) onStatusChangeRef.current("studying");

    // 4. Remote RPC with 10s safety timeout
    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_resume_session"),
        "Resume session RPC"
      );

      if (currentSeq !== actionSeqRef.current) return { success: true };

      if (!rpcErr && data) {
        removeActiveTransitionActions();
        const res = data as { success: boolean; server_now?: string; error?: string };
        if (res.server_now) calibrateWithServerTime(res.server_now);
        if (!res.success && res.error === "break_expired") {
          const accruedSeconds = profileRef.current?.active_study_seconds_snapshot ?? elapsedStudySeconds;
          setSavedStudySecondsOnBreakExpiry(accruedSeconds);
          setIsBreakExpiredNoticeOpen(true);
          await finishSession([]);
          return { success: false, expired: true };
        }
        await fetchSessionBlocks();
      } else if (rpcErr) {
        const msg = (rpcErr.message || "").toLowerCase();
        const isActuallyExpired = Boolean(
          profileRef.current && isMemberBreakExpired(profileRef.current, getServerNow())
        );
        if (msg.includes("not currently on break") && isActuallyExpired) {
          const accruedSeconds = profileRef.current?.active_study_seconds_snapshot ?? elapsedStudySeconds;
          setSavedStudySecondsOnBreakExpiry(accruedSeconds);
          setIsBreakExpiredNoticeOpen(true);
          return { success: false, expired: true };
        }
        if (msg.includes("not currently on break")) {
          // Break was not expired; session was already resumed or stopped from another device
          setLocalStatusOverride(null);
          await fetchSessionBlocks();
          return { success: true };
        }
        enqueueSessionAction("resume_session");
      }
    } catch (err) {
      console.warn("Resume session fast sync timed out or offline; safely queued:", err);
      if (currentSeq === actionSeqRef.current) {
        enqueueSessionAction("resume_session");
      }
    }

    return { success: true };
  };

  const closeBreakExpiredNotice = useCallback(async () => {
    dismissedBreakExpiryRef.current = true;
    setIsBreakExpiredNoticeOpen(false);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("studyroom_active_break");
      } catch {}
    }
    if (profile?.last_break_expired_study_seconds !== null && profile?.last_break_expired_study_seconds !== undefined) {
      profile.last_break_expired_study_seconds = null;
      try {
        await (supabase as unknown as RpcCaller).rpc("rpc_acknowledge_break_expiry");
      } catch (err) {
        console.warn("rpc_acknowledge_break_expiry error:", err);
      }
    }
    if (onStatusChangeRef.current) onStatusChangeRef.current();
  }, [supabase, profile]);

  const closeSessionLimitNotice = () => {
    setIsSessionLimitNoticeOpen(false);
  };

  const openBreakBlock = blocks.find((b) => b.block_type === "break" && !b.end_time);
  const breakStartedAt =
    initialBreakStartIsoRef.current ||
    openBreakBlock?.start_time ||
    profile?.break_started_at ||
    null;

  return {
    status: effectiveStatus,
    rawStatus: currentStatus,
    focus: profile?.current_focus ?? null,
    elapsedStudySeconds,
    breakStartedAt,
    actionLoading,
    error,
    isBreakExpiredNoticeOpen,
    savedStudySecondsOnBreakExpiry,
    closeBreakExpiredNotice,
    isSessionLimitNoticeOpen,
    savedStudySecondsOnLimit,
    closeSessionLimitNotice,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    refreshBlocks: fetchSessionBlocks,
  };
}
