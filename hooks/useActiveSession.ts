"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, SessionBlock, UserStatus } from "@/lib/supabase/types";
import {
  calculateActiveStudySeconds,
  calculateMemberElapsedStudySeconds,
  isMemberTimerCalibrating,
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
  getServerTimeOffset,
} from "@/lib/time/clockSync";
import {
  with10sTimeout,
  saveOfflineActiveSession,
  getOfflineActiveSession,
  clearOfflineActiveSession,
  purgeStaleActiveSession,
  saveActiveStudyState,
  getActiveStudyState,
  clearActiveStudyState,
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
import { getDateInTimezone, getTimeUntilMidnight } from "@/lib/scoring/streak";
import { triggerHapticFeedback } from "@/lib/utils/haptics";
import { useScreenWakeLock } from "@/hooks/useScreenWakeLock";

export interface TenMinuteWarningState {
  active: boolean;
  type: "session" | "break";
  remainingSeconds: number;
}

export type SessionSyncStatus = "synced" | "syncing" | "reconnecting" | "no_network" | "error";
export type SessionMutationType = "start" | "pause" | "resume" | "stop" | null;

export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return null;
  }
  try {
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  } catch {
    return null;
  }
}

type RpcCaller = {
  rpc: (
    name: string,
    params?: Record<string, unknown>
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export function useActiveSession(
  profile: UserProfile | null,
  onStatusChange?: (newStatus?: UserStatus, details?: Partial<UserProfile>) => void,
  updateProfileOptimistic?: (partial: Partial<UserProfile>) => void,
  connectionState?: "connected" | "reconnecting" | "offline"
) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [elapsedStudySeconds, setElapsedStudySeconds] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deterministic mutation state machine
  const [mutationPending, setMutationPending] = useState<SessionMutationType>(null);
  const mutationPendingRef = useRef<SessionMutationType>(null);
  mutationPendingRef.current = mutationPending;

  const [syncStatus, setSyncStatus] = useState<SessionSyncStatus>("synced");

  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const updateProfileOptimisticRef = useRef(updateProfileOptimistic);
  useEffect(() => {
    updateProfileOptimisticRef.current = updateProfileOptimistic;
  }, [updateProfileOptimistic]);

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
  const hasTriggeredTenMinBreakWarningRef = useRef(false);
  const isTenMinWarningDismissedRef = useRef(false);

  // Realtime Unified Cross-Device Goal Update Popup State
  const [isGoalUpdateModalOpen, setIsGoalUpdateModalOpen] = useState(false);
  const [pendingGoalSessionId, setPendingGoalSessionId] = useState<string | null>(null);
  const [pendingGoalSeconds, setPendingGoalSeconds] = useState(0);
  const [pendingGoalReason, setPendingGoalReason] = useState<string>("manual_stop");
  const hasCompletedGoalsRef = useRef(false);
  const isLocallyAwaitingGoalUpdateRef = useRef(false);

  // 10-Minute Earlier Warning State (session limit & break limit)
  const [tenMinuteWarning, setTenMinuteWarning] = useState<TenMinuteWarningState | null>(null);

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

  // Calibration state check: studying user awaiting authoritative timing info
  const isTimerCalibrating = Boolean(
    effectiveStatus === "studying" &&
    profile &&
    isMemberTimerCalibrating(profile)
  );

  // Truthful Sync Status Semantics (Single Authoritative Source):
  // 1. "syncing": mutation currently in flight OR timer calibration / reconciliation occurring
  // 2. "no_network": device indicates no usable network connection (navigator.onLine === false)
  // 3. "error": requested session mutation failed
  // 4. "reconnecting": realtime / network connection is being restored
  // 5. "synced": latest mutation acknowledged, authoritative state reconciled, valid timer, no mutation/reconciliation pending
  useEffect(() => {
    if (mutationPending !== null) {
      setSyncStatus("syncing");
    } else if (!isOnline || (typeof navigator !== "undefined" && !navigator.onLine)) {
      setSyncStatus("no_network");
    } else if (error) {
      setSyncStatus("error");
    } else if (connectionState === "reconnecting") {
      setSyncStatus("reconnecting");
    } else if (isTimerCalibrating) {
      setSyncStatus("syncing");
    } else {
      setSyncStatus("synced");
    }
  }, [mutationPending, isOnline, error, connectionState, isTimerCalibrating]);

  // Screen Wake Lock: keep screen active during live study mode
  useScreenWakeLock(effectiveStatus === "studying");

  // Reset 10-minute warning dismissal when session status changes
  useEffect(() => {
    isTenMinWarningDismissedRef.current = false;
  }, [currentStatus]);

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
  const lastUserClickTimestampRef = useRef<number>(0);
  const localOverrideSetTimestampRef = useRef<number>(0);
  const initialBreakStartIsoRef = useRef<string | null>(null);

  const applyLocalStatusOverride = useCallback((status: UserStatus | null) => {
    localOverrideSetTimestampRef.current = status ? Date.now() : 0;
    setLocalStatusOverride(status);
  }, []);

  // Clear local override when server profile catches up to the intended state,
  // without relying on any arbitrary timeouts.
  useEffect(() => {
    if (!localStatusOverride) return;
    if (profile && profile.current_status === localStatusOverride && mutationPendingRef.current === null) {
      setLocalStatusOverride(null);
    }
  }, [profile, localStatusOverride]);

  // Synchronize cross-device pending goal update popup when profile updates
  useEffect(() => {
    if (!profile) return;
    if (profile.pending_goal_session_id) {
      hasCompletedGoalsRef.current = false;
      setPendingGoalSessionId(profile.pending_goal_session_id);
      setPendingGoalSeconds(profile.pending_goal_seconds || profile.last_break_expired_study_seconds || 0);
      setPendingGoalReason(profile.pending_goal_reason || "manual_stop");
      setIsGoalUpdateModalOpen(true);
    } else if (profile.pending_goal_session_id === null) {
      // Cleared across devices by another session update
      if (!isLocallyAwaitingGoalUpdateRef.current) {
        setIsGoalUpdateModalOpen(false);
        setPendingGoalSessionId(null);
      }
    }
  }, [profile?.pending_goal_session_id, profile?.pending_goal_seconds, profile?.pending_goal_reason, profile]);

  // Clean up stale in-memory state if user changes or logs out
  const previousUserIdRef = useRef<string | undefined>(profile?.id);
  useEffect(() => {
    if (previousUserIdRef.current && previousUserIdRef.current !== profile?.id) {
      setBlocks([]);
      setElapsedStudySeconds(0);
      applyLocalStatusOverride(null);
      setIsGoalUpdateModalOpen(false);
      setPendingGoalSessionId(null);
      setIsSessionLimitNoticeOpen(false);
      setIsBreakExpiredNoticeOpen(false);
    }
    previousUserIdRef.current = profile?.id;
  }, [profile?.id, applyLocalStatusOverride]);

  // Clean up stale cache immediately when external device marks profile offline
  useEffect(() => {
    if (profile && profile.current_status === "offline" && !localStatusOverride) {
      purgeStaleActiveSession();
      setBlocks([]);
      setElapsedStudySeconds(0);
    }
  }, [profile?.current_status, localStatusOverride, profile]);

  // Immediate elapsed study seconds sync when on break
  useEffect(() => {
    if (currentStatus === "break" && profile) {
      const accrued = calculateMemberElapsedStudySeconds(profile, getServerNow());
      setElapsedStudySeconds(accrued);
    }
  }, [currentStatus, profile?.active_study_seconds_snapshot, profile]);

  // -----------------------------------------------------------------------
  // RESTORATION ON MOUNT: Check disk for active session (Closed-App Support)
  // -----------------------------------------------------------------------
  useEffect(() => {
    sanitizeSessionQueue();

    const currentUid = profileRef.current?.id;
    const offlineSession = getOfflineActiveSession(currentUid);
    if (!offlineSession) return;

    // Reject and purge any offline session belonging to a different user account
    if (currentUid && offlineSession.userId && offlineSession.userId !== currentUid) {
      purgeStaleActiveSession();
      clearOfflineActiveSession();
      clearActiveStudyState();
      setBlocks([]);
      setElapsedStudySeconds(0);
      return;
    }

    // Purge stale active session if older than 24 hours (abandoned session)
    if (
      offlineSession.startTime &&
      Date.now() - new Date(offlineSession.startTime).getTime() > 24 * 3600 * 1000
    ) {
      purgeStaleActiveSession();
      clearOfflineActiveSession();
      clearActiveStudyState();
      setBlocks([]);
      setElapsedStudySeconds(0);
      return;
    }

    // If server profile authoritatively indicates user is offline, discard stale disk cache
    if (profileRef.current && profileRef.current.current_status === "offline") {
      purgeStaleActiveSession();
      clearOfflineActiveSession();
      clearActiveStudyState();
      setBlocks([]);
      setElapsedStudySeconds(0);
      return;
    }

    const isOfflineMode = typeof navigator !== "undefined" && !navigator.onLine;
    if (!isOfflineMode) {
      // In online mode, the server profile is authoritative. Stale disk blocks
      // must not override live study state or cause reload timer jumping.
      return;
    }

    const now = getServerNow();
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
        applyLocalStatusOverride("offline");
        if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
      } else {
        setBlocks(sessionBlocks);
        setElapsedStudySeconds(accrued);
        applyLocalStatusOverride("studying");
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
        applyLocalStatusOverride("offline");
        if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
      } else {
        setBlocks(sessionBlocks);
        setElapsedStudySeconds(offlineSession.elapsedStudySeconds || 0);
        applyLocalStatusOverride("break");
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
  }, [applyLocalStatusOverride]);

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
              const existingStudy = getActiveStudyState();
              if (profileRef.current?.session_start_time) {
                saveActiveStudyState({
                  userId: profileRef.current.id,
                  sessionStartTime: profileRef.current.session_start_time,
                  lastResumedAt: profileRef.current.last_resumed_at || existingStudy?.lastResumedAt || undefined,
                  snapshotSeconds: profileRef.current.active_study_seconds_snapshot ?? existingStudy?.snapshotSeconds ?? 0,
                  focus: profileRef.current.current_focus || "",
                });
              }
              (window as any).AndroidBridge.onSessionStateResolved(
                false,
                0,
                elapsedStudySecondsRef.current,
                true,
                studyStartMs,
                profileRef.current?.current_focus || ""
              );
            } else {
              clearActiveStudyState();
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
    // Never wipe optimistic state while a local action is mid-flight.
    // localStatusOverrideRef is set for the entire duration between a button
    // press and the server profile propagating back (up to 6 s). Returning
    // early here ensures the optimistic blocks/elapsed-seconds set by
    // startSession / pauseSession / resumeSession are not overwritten by a
    // stale server fetch triggered by the realtime session_blocks subscription.
    if (localStatusOverrideRef.current) return;

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
    async (
      completedTaskIds: string[] = [],
      reason: "manual_stop" | "session_limit" | "break_expired" = "manual_stop"
    ) => {
      const now = Date.now();
      if (reason === "manual_stop" && (mutationPendingRef.current !== null || now - lastUserClickTimestampRef.current < 300)) return;
      if (reason === "manual_stop") {
        lastUserClickTimestampRef.current = now;
      }

      const currentSeq = ++actionSeqRef.current;
      setError(null);
      setTenMinuteWarning(null);
      isLocallyAwaitingGoalUpdateRef.current = true;
      setMutationPending("stop");
      setSyncStatus("syncing");
      setActionLoading(true);

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

      // Determine authoritative study end time:
      // If ending while on break, active study concluded when the last study block ended.
      const studyBlocks = finalBlocks.filter((b) => b.block_type === "study");
      const lastStudyBlock = studyBlocks[studyBlocks.length - 1];
      const actualStudyEndIso =
        currentStatus === "break" && lastStudyBlock?.end_time
          ? lastStudyBlock.end_time
          : nowIso;

      // Calculate total break minutes from break blocks
      const totalBreakSeconds = finalBlocks
        .filter((b) => b.block_type === "break")
        .reduce((sum, b) => {
          const s = new Date(b.start_time).getTime();
          const e = new Date(b.end_time || nowIso).getTime();
          return sum + Math.max(0, !isNaN(s) && !isNaN(e) && e >= s ? (e - s) / 1000 : 0);
        }, 0);
      const breakMinutes = Math.max(0, Math.floor(totalBreakSeconds / 60));

      // 3. Build offline completed session record for immediate History view (with midnight splitting)
      const baseOfflineId = offlineSession?.sessionId || "offline_" + now;
      const sessionStartIso = offlineSession?.startTime || finalBlocks[0]?.start_time || nowIso;
      const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
      const startDateKey = getDateInTimezone(new Date(sessionStartIso), timezone);
      const endDateKey = getDateInTimezone(new Date(actualStudyEndIso), timezone);

      const offlineRecord: CompletedOfflineSessionRecord = {
        id: baseOfflineId,
        user_id: profileRef.current?.id || offlineSession?.userId || "offline_user",
        start_time: sessionStartIso,
        end_time: actualStudyEndIso,
        duration_minutes: durationMinutes,
        break_minutes: breakMinutes,
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

      if (startDateKey !== endDateKey) {
        const { hours: untilHours, minutes: untilMins } = getTimeUntilMidnight(new Date(sessionStartIso), timezone);
        const minsBeforeMidnight = Math.max(0, untilHours * 60 + untilMins);
        const minsBefore = Math.min(durationMinutes, minsBeforeMidnight);
        const minsAfter = Math.max(0, durationMinutes - minsBefore);
        const midnightDate = new Date(new Date(sessionStartIso).getTime() + minsBeforeMidnight * 60000);
        const midnightIso = midnightDate.toISOString();

        if (minsBefore > 0 || minsAfter === 0) {
          saveOfflineCompletedSession({
            ...offlineRecord,
            id: baseOfflineId + "_1",
            end_time: midnightIso,
            duration_minutes: minsBefore,
            completed_tasks: offlineRecord.completed_tasks,
          });
        }
        if (minsAfter > 0) {
          saveOfflineCompletedSession({
            ...offlineRecord,
            id: baseOfflineId + "_2",
            start_time: midnightIso,
            duration_minutes: minsAfter,
            completed_tasks: offlineRecord.completed_tasks,
          });
        }
      } else {
        saveOfflineCompletedSession(offlineRecord);
      }

      // Clean up active session from disk
      clearOfflineActiveSession();
      purgeStaleActiveSession();
      clearActiveStudyState();
      removeActiveTransitionActions();
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("studyroom_active_break");
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
      applyLocalStatusOverride("offline");
      setBlocks([]);
      setElapsedStudySeconds(0);
      dismissedBreakExpiryRef.current = true;
      const currentWeekly = profileRef.current?.weekly_study_seconds ?? 0;
      const updatedWeekly = currentWeekly + totalActiveSeconds;
      const currentTotalSessions = (profileRef.current?.total_sessions_count ?? 0) + 1;
      const currentWeeklySessions = (profileRef.current?.weekly_sessions_count ?? 0) + 1;

      if (onStatusChangeRef.current) {
        onStatusChangeRef.current("offline", {
          current_status: "offline",
          session_start_time: null,
          break_started_at: null,
          last_resumed_at: null,
          active_study_seconds_snapshot: 0,
          last_offline_at: nowIso,
          weekly_study_seconds: updatedWeekly,
          total_sessions_count: currentTotalSessions,
          weekly_sessions_count: currentWeeklySessions,
        });
      }

      // 5. Attempt immediate fast sync with 10s safety timeout
      try {
        const { data, error: rpcErr } = await with10sTimeout(
          (supabase as unknown as RpcCaller).rpc("rpc_finish_session", {
            p_completed_task_ids: completedTaskIds,
            p_reason: reason,
          }),
          "Finish session RPC"
        );

        if (currentSeq !== actionSeqRef.current) return;

        if (!rpcErr && data) {
          const res = data as { success: boolean; session_id?: string; server_now?: string; error?: string };
          const targetSessionId = res.session_id || baseOfflineId;
          const confirmedDetails: Partial<UserProfile> = {
            current_status: "offline",
            session_start_time: null,
            break_started_at: null,
            last_resumed_at: null,
            active_study_seconds_snapshot: 0,
            last_offline_at: res.server_now || nowIso,
            weekly_study_seconds: updatedWeekly,
            total_sessions_count: currentTotalSessions,
            weekly_sessions_count: currentWeeklySessions,
          };
          if (profileRef.current) {
            Object.assign(profileRef.current, confirmedDetails);
          }
          updateProfileOptimisticRef.current?.(confirmedDetails);
          setLocalStatusOverride(null);
          setMutationPending(null);
          setSyncStatus("synced");
          setActionLoading(false);
          if (onStatusChangeRef.current) {
            onStatusChangeRef.current("offline", confirmedDetails);
          }
          setPendingGoalSessionId(targetSessionId);
          setPendingGoalSeconds(durationMinutes * 60);
          setPendingGoalReason(reason);
          setIsGoalUpdateModalOpen(true);

          // Server accepted session; remove temporary offline duplicate & clear active transitions
          removeOfflineCompletedSession(offlineRecord.id);
          removeOfflineCompletedSession(baseOfflineId + "_1");
          removeOfflineCompletedSession(baseOfflineId + "_2");
          removeActiveTransitionActions();
        } else if (rpcErr) {
          // If network failed, enqueue to ensure it gets synced when reconnected
          enqueueSessionAction("finish_session", {
            userId: profileRef.current?.id,
            completedTaskIds,
            elapsedStudySeconds: totalActiveSeconds,
            payload: { session: offlineRecord, reason },
          });
          setMutationPending(null);
          setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
          setActionLoading(false);
          // Offline fallback goal modal trigger
          setPendingGoalSessionId(baseOfflineId);
          setPendingGoalSeconds(durationMinutes * 60);
          setPendingGoalReason(reason);
          setIsGoalUpdateModalOpen(true);
        }
      } catch (err) {
        console.warn("Fast finish sync timed out or offline; safely queued on disk:", err);
        if (currentSeq === actionSeqRef.current) {
          enqueueSessionAction("finish_session", {
            userId: profileRef.current?.id,
            completedTaskIds,
            elapsedStudySeconds: totalActiveSeconds,
            payload: { session: offlineRecord, reason },
          });
          setMutationPending(null);
          setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
          setActionLoading(false);
          setPendingGoalSessionId(baseOfflineId);
          setPendingGoalSeconds(durationMinutes * 60);
          setPendingGoalReason(reason);
          setIsGoalUpdateModalOpen(true);
        }
      }

      return { success: true };
    },
    [supabase, applyLocalStatusOverride, currentStatus]
  );

  // -----------------------------------------------------------------------
  // 1-HOUR BREAK INACTIVITY RULE MONITOR
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (currentStatus !== "break") {
      hasTriggeredTenMinBreakWarningRef.current = false;
      return;
    }

    const checkBreakTimeout = async () => {
      if (isAutoTerminatingRef.current) return;

      const openBreak = blocksRef.current.find((b) => b.block_type === "break" && !b.end_time);
      const breakStart = profileRef.current?.break_started_at || openBreak?.start_time;
      if (!breakStart) return;

      const serverNow = getServerNow();
      const breakStatus: BreakStatusResult = calculateBreakStatus(breakStart, serverNow);

      // 10-Minute Warning for Break Expiry (Fires in final 600s of 3600s break)
      if (breakStatus.elapsedBreakSeconds >= 3000 && !breakStatus.isExpired) {
        if (!isTenMinWarningDismissedRef.current) {
          setTenMinuteWarning({
            active: true,
            type: "break",
            remainingSeconds: breakStatus.remainingBreakSeconds,
          });
        }

        if (!hasTriggeredTenMinBreakWarningRef.current) {
          hasTriggeredTenMinBreakWarningRef.current = true;
          triggerHapticFeedback([100, 50, 100]);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("☕ 10 Minutes Left in Break", {
                body: "Your 1-hour break will expire in 10 minutes. Resume studying soon to keep your session active!",
                icon: "/icon-192.png",
                tag: "break-10m-warning",
              });
            } catch {}
          }
        }
      } else if (breakStatus.elapsedBreakSeconds < 3000) {
        setTenMinuteWarning((prev) => (prev?.type === "break" ? null : prev));
        hasTriggeredTenMinBreakWarningRef.current = false;
        isTenMinWarningDismissedRef.current = false;
      }

      if (breakStatus.isExpired) {
        setTenMinuteWarning(null);
        isAutoTerminatingRef.current = true;
        const accruedSeconds =
          profileRef.current?.active_study_seconds_snapshot || elapsedStudySecondsRef.current;
        setSavedStudySecondsOnBreakExpiry(accruedSeconds);

        try {
          await finishSession([], "break_expired");
        } catch (terminateErr) {
          console.warn("Auto-termination on break expiry notice:", terminateErr);
        } finally {
          setIsBreakExpiredNoticeOpen(true);
          setError(null);
          dismissedBreakExpiryRef.current = false;
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

      // 10-Minute Warning for 3-Hour Session Limit (Fires in final 600s of 10800s study limit)
      if (currentAccrued >= 10200 && currentAccrued < MAX_SESSION_STUDY_SECONDS) {
        const remainingSec = Math.max(0, MAX_SESSION_STUDY_SECONDS - currentAccrued);
        if (!isTenMinWarningDismissedRef.current) {
          setTenMinuteWarning({
            active: true,
            type: "session",
            remainingSeconds: remainingSec,
          });
        }

        if (!hasTriggeredTenMinWarningRef.current) {
          hasTriggeredTenMinWarningRef.current = true;
          triggerHapticFeedback([100, 50, 100]);
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            try {
              new Notification("⏳ 10 Minutes Left in Study Session", {
                body: "Your 3-hour study session will automatically end in 10 minutes. Wrap up your goals or take a break to save your streak!",
                icon: "/icon-192.png",
                tag: "session-10m-warning",
              });
            } catch {}
          }
        }
      } else if (currentAccrued < 10200) {
        setTenMinuteWarning((prev) => (prev?.type === "session" ? null : prev));
        hasTriggeredTenMinWarningRef.current = false;
        isTenMinWarningDismissedRef.current = false;
      }

      if (currentAccrued >= MAX_SESSION_STUDY_SECONDS) {
        setTenMinuteWarning(null);
        isAutoTerminatingLimitRef.current = true;
        setSavedStudySecondsOnLimit(MAX_SESSION_STUDY_SECONDS);

        try {
          await finishSession([], "session_limit");
        } catch (terminateErr) {
          console.warn("Auto-termination on 3-hour limit:", terminateErr);
        } finally {
          setIsSessionLimitNoticeOpen(true);
          setError(null);
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
      if (p && p.current_status === "studying") {
        return calculateMemberElapsedStudySeconds(p, now);
      }
      const b = blocksRef.current;
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
  // -----------------------------------------------------------------------
  // START SESSION
  // -----------------------------------------------------------------------
  const startSession = async () => {
    dismissedBreakExpiryRef.current = false;
    const now = Date.now();
    if (mutationPendingRef.current !== null || now - lastUserClickTimestampRef.current < 250) return;
    lastUserClickTimestampRef.current = now;
    isAutoTerminatingRef.current = false;
    isAutoTerminatingLimitRef.current = false;

    const currentSeq = ++actionSeqRef.current;
    setError(null);
    setMutationPending("start");
    setSyncStatus("syncing");
    setActionLoading(true);

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
    saveActiveStudyState({
      userId: newBlock.user_id,
      sessionStartTime: nowIso,
      lastResumedAt: nowIso,
      snapshotSeconds: 0,
      focus: profileRef.current?.current_focus || "",
    });

    // 2. Instant UI transition at t=0
    applyLocalStatusOverride("studying");
    setBlocks([newBlock]);
    setElapsedStudySeconds(0);
    if (onStatusChangeRef.current) {
      onStatusChangeRef.current("studying", {
        current_status: "studying",
        session_start_time: nowIso,
        break_started_at: null,
        active_study_seconds_snapshot: 0,
        last_resumed_at: nowIso,
      });
    }

    // 3. Remote RPC with 10s safety timeout
    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_start_session", { p_focus: null }),
        "Start session RPC"
      );

      if (currentSeq !== actionSeqRef.current) return;

      if (!rpcErr && data) {
        const res = data as { success: boolean; session_id?: string; server_now?: string; error?: string };
        const confirmedDetails: Partial<UserProfile> = {
          current_status: "studying",
          session_start_time: res.server_now || nowIso,
          break_started_at: null,
          active_study_seconds_snapshot: 0,
          last_resumed_at: res.server_now || nowIso,
        };
        if (profileRef.current) {
          Object.assign(profileRef.current, confirmedDetails);
        }
        updateProfileOptimisticRef.current?.(confirmedDetails);
        if (onStatusChangeRef.current) {
          onStatusChangeRef.current("studying", confirmedDetails);
        }
        removeActiveTransitionActions();
        await fetchSessionBlocks();
        setLocalStatusOverride(null);
        setMutationPending(null);
        setSyncStatus("synced");
        setActionLoading(false);
      } else if (rpcErr) {
        enqueueSessionAction("start_session", { userId: profileRef.current?.id });
        setMutationPending(null);
        setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
        setActionLoading(false);
      }
    } catch (err) {
      console.warn("Start session fast sync timed out or offline; safely queued:", err);
      if (currentSeq === actionSeqRef.current) {
        enqueueSessionAction("start_session", { userId: profileRef.current?.id });
        setMutationPending(null);
        setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
        setActionLoading(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // PAUSE SESSION
  // -----------------------------------------------------------------------
  const pauseSession = async () => {
    const now = Date.now();
    if (mutationPendingRef.current !== null || now - lastUserClickTimestampRef.current < 250) return;
    lastUserClickTimestampRef.current = now;
    isAutoTerminatingRef.current = false;

    const currentSeq = ++actionSeqRef.current;
    setError(null);
    setMutationPending("pause");
    setSyncStatus("syncing");
    setActionLoading(true);

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
    clearActiveStudyState();

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
    applyLocalStatusOverride("break");
    setBlocks(updatedBlocks);
    setElapsedStudySeconds(currentStudySeconds);
    if (onStatusChangeRef.current) {
      onStatusChangeRef.current("break", {
        current_status: "break",
        break_started_at: nowIso,
        last_resumed_at: null,
        active_study_seconds_snapshot: currentStudySeconds,
      });
    }

    // 4. Remote RPC with 10s safety timeout
    try {
      const { data, error: rpcErr } = await with10sTimeout(
        (supabase as unknown as RpcCaller).rpc("rpc_pause_session", {
          p_paused_at: nowIso,
          p_elapsed_study_seconds: currentStudySeconds,
        }),
        "Pause session RPC"
      );

      if (currentSeq !== actionSeqRef.current) return;

      if (!rpcErr && data) {
        const res = data as { success: boolean; server_now?: string; error?: string };
        const confirmedDetails: Partial<UserProfile> = {
          current_status: "break",
          break_started_at: res.server_now || nowIso,
          active_study_seconds_snapshot: currentStudySeconds,
          last_resumed_at: null,
        };
        if (profileRef.current) {
          Object.assign(profileRef.current, confirmedDetails);
        }
        updateProfileOptimisticRef.current?.(confirmedDetails);
        if (onStatusChangeRef.current) {
          onStatusChangeRef.current("break", confirmedDetails);
        }
        removeActiveTransitionActions();
        await fetchSessionBlocks();
        setLocalStatusOverride(null);
        setMutationPending(null);
        setSyncStatus("synced");
        setActionLoading(false);
      } else if (rpcErr) {
        enqueueSessionAction("pause_session", { userId: profileRef.current?.id, elapsedStudySeconds: currentStudySeconds });
        setMutationPending(null);
        setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
        setActionLoading(false);
      }
    } catch (err) {
      console.warn("Pause session fast sync timed out or offline; safely queued:", err);
      if (currentSeq === actionSeqRef.current) {
        enqueueSessionAction("pause_session", { userId: profileRef.current?.id, elapsedStudySeconds: currentStudySeconds });
        setMutationPending(null);
        setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
        setActionLoading(false);
      }
    }
  };

  // -----------------------------------------------------------------------
  // RESUME SESSION
  // -----------------------------------------------------------------------
  const resumeSession = async (): Promise<{ success: boolean; expired?: boolean }> => {
    const now = Date.now();
    if (mutationPendingRef.current !== null || now - lastUserClickTimestampRef.current < 250) return { success: false };
    lastUserClickTimestampRef.current = now;
    isAutoTerminatingRef.current = false;
    isAutoTerminatingLimitRef.current = false;

    const currentSeq = ++actionSeqRef.current;
    setError(null);
    setMutationPending("resume");
    setSyncStatus("syncing");
    setActionLoading(true);

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
    saveActiveStudyState({
      userId: profileRef.current?.id || "offline_user",
      sessionStartTime: profileRef.current?.session_start_time || nowIso,
      lastResumedAt: nowIso,
      snapshotSeconds: elapsedStudySecondsRef.current,
      focus: profileRef.current?.current_focus || "",
    });

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
    applyLocalStatusOverride("studying");
    setBlocks(updatedBlocks);
    const accruedSnapshot = elapsedStudySecondsRef.current;
    if (onStatusChangeRef.current) {
      onStatusChangeRef.current("studying", {
        current_status: "studying",
        break_started_at: null,
        last_resumed_at: nowIso,
        active_study_seconds_snapshot: accruedSnapshot,
      });
    }

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
        if (!res.success && res.error === "break_expired") {
          const accruedSeconds = profileRef.current?.active_study_seconds_snapshot ?? elapsedStudySeconds;
          setSavedStudySecondsOnBreakExpiry(accruedSeconds);
          setIsBreakExpiredNoticeOpen(true);
          setMutationPending(null);
          setActionLoading(false);
          await finishSession([], "break_expired");
          return { success: false, expired: true };
        }
        const confirmedDetails: Partial<UserProfile> = {
          current_status: "studying",
          break_started_at: null,
          last_resumed_at: res.server_now || nowIso,
          active_study_seconds_snapshot: accruedSnapshot,
        };
        if (profileRef.current) {
          Object.assign(profileRef.current, confirmedDetails);
        }
        updateProfileOptimisticRef.current?.(confirmedDetails);
        if (onStatusChangeRef.current) {
          onStatusChangeRef.current("studying", confirmedDetails);
        }
        await fetchSessionBlocks();
        setLocalStatusOverride(null);
        setMutationPending(null);
        setSyncStatus("synced");
        setActionLoading(false);
      } else if (rpcErr) {
        const msg = (rpcErr.message || "").toLowerCase();
        const isActuallyExpired = Boolean(
          profileRef.current && isMemberBreakExpired(profileRef.current, getServerNow())
        );
        if (msg.includes("not currently on break") && isActuallyExpired) {
          const accruedSeconds = profileRef.current?.active_study_seconds_snapshot ?? elapsedStudySeconds;
          setSavedStudySecondsOnBreakExpiry(accruedSeconds);
          setIsBreakExpiredNoticeOpen(true);
          setMutationPending(null);
          setActionLoading(false);
          return { success: false, expired: true };
        }
        if (msg.includes("not currently on break")) {
          // Break was not expired; session was already resumed or stopped from another device
          applyLocalStatusOverride(null);
          await fetchSessionBlocks();
          setMutationPending(null);
          setSyncStatus("synced");
          setActionLoading(false);
          return { success: true };
        }
        enqueueSessionAction("resume_session", { userId: profileRef.current?.id });
        setMutationPending(null);
        setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
        setActionLoading(false);
      }
    } catch (err) {
      console.warn("Resume session fast sync timed out or offline; safely queued:", err);
      if (currentSeq === actionSeqRef.current) {
        enqueueSessionAction("resume_session", { userId: profileRef.current?.id });
        setMutationPending(null);
        setSyncStatus(typeof navigator !== "undefined" && !navigator.onLine ? "no_network" : "error");
        setActionLoading(false);
      }
    }

    return { success: true };
  };

  const isValidUuid = (id?: string | null): boolean =>
    Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

  const completeSessionGoals = useCallback(
    async (sessionId: string, completedTaskIds: string[]) => {
      isLocallyAwaitingGoalUpdateRef.current = false;
      hasCompletedGoalsRef.current = true;
      setIsGoalUpdateModalOpen(false);
      setPendingGoalSessionId(null);

      const targetUuid = isValidUuid(sessionId) ? sessionId : null;

      try {
        const { error: rpcErr } = await with10sTimeout(
          (supabase as unknown as RpcCaller).rpc("rpc_complete_session_goals", {
            p_session_id: targetUuid,
            p_completed_task_ids: completedTaskIds,
          }),
          "Complete session goals RPC"
        );

        if (rpcErr) {
          enqueueSessionAction("complete_session_goals", {
            userId: profileRef.current?.id,
            completedTaskIds,
            payload: { sessionId: targetUuid || sessionId },
          });
        }
      } catch (err) {
        console.warn("Complete session goals timed out or offline; safely queued:", err);
        enqueueSessionAction("complete_session_goals", {
          userId: profileRef.current?.id,
          completedTaskIds,
          payload: { sessionId: targetUuid || sessionId },
        });
      }
    },
    [supabase]
  );

  const closeGoalUpdateModal = useCallback(async () => {
    isLocallyAwaitingGoalUpdateRef.current = false;
    setIsGoalUpdateModalOpen(false);
    if (hasCompletedGoalsRef.current) {
      hasCompletedGoalsRef.current = false;
      return;
    }
    const sid = pendingGoalSessionId;
    setPendingGoalSessionId(null);
    const targetUuid = isValidUuid(sid) ? sid : null;
    if (targetUuid) {
      try {
        await (supabase as unknown as RpcCaller).rpc("rpc_complete_session_goals", {
          p_session_id: targetUuid,
          p_completed_task_ids: [],
        });
      } catch {}
    }
  }, [supabase, pendingGoalSessionId]);

  const dismissTenMinuteWarning = useCallback(() => {
    isTenMinWarningDismissedRef.current = true;
    setTenMinuteWarning(null);
  }, []);

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
    mutationPending,
    syncStatus,
    isBreakExpiredNoticeOpen,
    savedStudySecondsOnBreakExpiry,
    closeBreakExpiredNotice,
    isSessionLimitNoticeOpen,
    savedStudySecondsOnLimit,
    closeSessionLimitNotice,
    // Cross-device unified goal update popup
    isGoalUpdateModalOpen,
    pendingGoalSessionId,
    pendingGoalSeconds,
    pendingGoalReason,
    completeSessionGoals,
    closeGoalUpdateModal,
    // 10-Minute Earlier Warning Alert
    tenMinuteWarning,
    dismissTenMinuteWarning,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    refreshBlocks: fetchSessionBlocks,
  };
}
