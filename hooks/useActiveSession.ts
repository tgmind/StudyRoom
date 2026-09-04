"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, SessionBlock, UserStatus } from "@/lib/supabase/types";
import { calculateActiveStudySeconds, calculateMemberElapsedStudySeconds, MAX_SESSION_STUDY_SECONDS } from "@/lib/time/format";
import { calculateBreakStatus, BreakStatusResult, getEffectiveMemberStatus, isMemberBreakExpired } from "@/lib/time/break";
import { getServerNow, calibrateWithServerTime } from "@/lib/time/clockSync";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export function useActiveSession(profile: UserProfile | null, onStatusChange?: (newStatus?: UserStatus) => void) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [elapsedStudySeconds, setElapsedStudySeconds] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1-Hour Break Expiry State
  const [isBreakExpiredNoticeOpen, setIsBreakExpiredNoticeOpen] = useState(false);
  const [savedStudySecondsOnBreakExpiry, setSavedStudySecondsOnBreakExpiry] = useState(0);
  const isAutoTerminatingRef = useRef(false);

  // 3-Hour Maximum Session Limit State
  const [isSessionLimitNoticeOpen, setIsSessionLimitNoticeOpen] = useState(false);
  const [savedStudySecondsOnLimit, setSavedStudySecondsOnLimit] = useState(0);
  const isAutoTerminatingLimitRef = useRef(false);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const supabase = createClient();
  const currentStatus: UserStatus = profile?.current_status ?? "offline";
  const effectiveStatus: UserStatus = profile ? getEffectiveMemberStatus(profile, getServerNow()) : "offline";

  // Fetch session blocks for current unfinalized session
  const fetchSessionBlocks = useCallback(async () => {
    if (!profile || effectiveStatus === "offline" || profile.current_status === "offline") {
      setBlocks([]);
      setElapsedStudySeconds(0);
      return;
    }

    try {
      const { data, error: blockErr } = await supabase
        .from("session_blocks")
        .select("*")
        .eq("user_id", profile.id)
        .is("session_id", null)
        .order("start_time", { ascending: true });

      if (blockErr) {
        console.error("Error fetching session blocks:", blockErr);
        return;
      }

      const fetchedBlocks = (data || []) as SessionBlock[];
      setBlocks(fetchedBlocks);

      // Compute authoritative elapsed seconds with server synchronized atomic time
      if (profile) {
        setElapsedStudySeconds(calculateMemberElapsedStudySeconds(profile, getServerNow()));
      } else {
        setElapsedStudySeconds(calculateActiveStudySeconds(fetchedBlocks, getServerNow()));
      }
    } catch (err) {
      console.error("Failed to fetch session blocks:", err);
    }
  }, [supabase, profile, effectiveStatus]);

  useEffect(() => {
    fetchSessionBlocks();
  }, [fetchSessionBlocks]);

  const actionLoadingRef = useRef(actionLoading);
  actionLoadingRef.current = actionLoading;

  const elapsedStudySecondsRef = useRef(elapsedStudySeconds);
  elapsedStudySecondsRef.current = elapsedStudySeconds;

  const finishSession = useCallback(
    async (completedTaskIds: string[] = []) => {
      if (actionLoadingRef.current) return;
      actionLoadingRef.current = true;
      setActionLoading(true);
      setError(null);

      try {
        const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_finish_session", {
          p_completed_task_ids: completedTaskIds,
        });

        if (rpcErr) throw rpcErr;

        const res = data as unknown as {
          success: boolean;
          session_id?: string;
          duration_minutes?: number;
          error?: string;
          server_now?: string;
        };

        if (res?.server_now) {
          calibrateWithServerTime(res.server_now);
        }

        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("studyroom_active_break");
          } catch {}
        }

        if (!res.success) {
          if (res.error?.toLowerCase().includes("no active session")) {
            setBlocks([]);
            setElapsedStudySeconds(0);
            if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
            return { ...res, success: true };
          }
          throw new Error(res.error || "Failed to finish session");
        }

        setBlocks([]);
        setElapsedStudySeconds(0);
        if (onStatusChangeRef.current) onStatusChangeRef.current("offline");

        return res;
      } catch (err) {
        if (typeof window !== "undefined") {
          try {
            localStorage.removeItem("studyroom_active_break");
          } catch {}
        }

        const msg = err instanceof Error ? err.message : "Finish session failed";
        if (
          msg.toLowerCase().includes("no active session") ||
          msg.toLowerCase().includes("not currently on break")
        ) {
          setBlocks([]);
          setElapsedStudySeconds(0);
          if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
          return { success: true };
        }
        setError(msg);
        throw err;
      } finally {
        actionLoadingRef.current = false;
        setActionLoading(false);
      }
    },
    [supabase]
  );

  // 1-Hour Break Inactivity Rule Monitor:
  // Automatically terminates session when break duration exceeds 1 hour (3600s)
  useEffect(() => {
    if (currentStatus !== "break" || !profile) {
      isAutoTerminatingRef.current = false;
      return;
    }

    // Determine break start timestamp
    const openBreakBlock = blocks.find((b) => b.block_type === "break" && !b.end_time);
    const breakStart = profile.break_started_at || openBreakBlock?.start_time;

    const checkBreakTimeout = async () => {
      if (isAutoTerminatingRef.current) return;

      const serverNow = getServerNow();
      const breakStatus: BreakStatusResult = calculateBreakStatus(breakStart, serverNow);

      if (breakStatus.isExpired) {
        isAutoTerminatingRef.current = true;
        const calculatedSeconds = calculateMemberElapsedStudySeconds(profile, serverNow);
        const accruedSeconds =
          profile.active_study_seconds_snapshot && profile.active_study_seconds_snapshot > 0
            ? profile.active_study_seconds_snapshot
            : calculatedSeconds > 0
            ? calculatedSeconds
            : elapsedStudySecondsRef.current;
        setSavedStudySecondsOnBreakExpiry(accruedSeconds);

        try {
          // Terminate session with no additional task completions
          await finishSession([]);
        } catch (terminateErr) {
          console.warn("Auto-termination on break expiry notice:", terminateErr);
        } finally {
          setError(null);
          setIsBreakExpiredNoticeOpen(true);
          if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
        }
      }
    };

    // Check immediately on mount/update
    checkBreakTimeout();

    // Check every 2 seconds while on break
    const intervalId = setInterval(checkBreakTimeout, 2000);

    // Instant check when user unlocks phone or focuses tab
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkBreakTimeout();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [currentStatus, profile, blocks, finishSession]);

  // 3-Hour Maximum Session Rule Monitor:
  // Automatically terminates session when active study time reaches or exceeds 3 hours (10800s)
  useEffect(() => {
    if (currentStatus !== "studying" && currentStatus !== "break") {
      isAutoTerminatingLimitRef.current = false;
      return;
    }

    const checkSessionLimit = async () => {
      if (isAutoTerminatingLimitRef.current) return;

      const serverNow = getServerNow();
      let currentAccrued = 0;
      if (profile) {
        currentAccrued = calculateMemberElapsedStudySeconds(profile, serverNow);
      } else {
        currentAccrued = calculateActiveStudySeconds(blocks, serverNow);
      }

      if (currentAccrued >= MAX_SESSION_STUDY_SECONDS) {
        isAutoTerminatingLimitRef.current = true;
        setSavedStudySecondsOnLimit(MAX_SESSION_STUDY_SECONDS);

        try {
          await finishSession([]);
        } catch (terminateErr) {
          console.warn("Auto-termination on 3-hour session limit:", terminateErr);
        } finally {
          setError(null);
          setIsSessionLimitNoticeOpen(true);
          if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
        }
      }
    };

    // Check immediately
    checkSessionLimit();

    // Check every 2 seconds
    const intervalId = setInterval(checkSessionLimit, 2000);

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        checkSessionLimit();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [currentStatus, profile, blocks, finishSession]);

  // Persist active break state to localStorage so background tab / phone sleep is trackable
  useEffect(() => {
    if (typeof window === "undefined" || !profile) return;
    if (currentStatus === "break" && profile.break_started_at) {
      try {
        const accruedSeconds = profile.active_study_seconds_snapshot ?? elapsedStudySecondsRef.current;
        localStorage.setItem(
          "studyroom_active_break",
          JSON.stringify({
            userId: profile.id,
            breakStartedAt: profile.break_started_at,
            accruedSeconds,
          })
        );
      } catch {
        // storage disabled or quota exceeded
      }
    } else if (currentStatus === "studying") {
      try {
        localStorage.removeItem("studyroom_active_break");
        localStorage.setItem(
          "studyroom_active_study",
          JSON.stringify({
            userId: profile.id,
            sessionStartTime: profile.session_start_time || new Date().toISOString(),
            lastResumedAt: profile.last_resumed_at || new Date().toISOString(),
            snapshotSeconds: profile.active_study_seconds_snapshot || 0,
          })
        );
      } catch {}
    } else if (currentStatus === "offline") {
      try {
        localStorage.removeItem("studyroom_active_break");
        localStorage.removeItem("studyroom_active_study");
      } catch {}
    }
  }, [currentStatus, profile]);

  // Check if an offline user had an expired break that ended while offline / in background
  useEffect(() => {
    if (typeof window === "undefined" || !profile || currentStatus === "break") return;

    // 1. Authoritative Server Check: Profile indicates last session ended due to expired break
    if (
      currentStatus === "offline" &&
      profile.last_break_expired_study_seconds !== undefined &&
      profile.last_break_expired_study_seconds !== null &&
      profile.last_break_expired_study_seconds > 0
    ) {
      setSavedStudySecondsOnBreakExpiry(profile.last_break_expired_study_seconds);
      setIsBreakExpiredNoticeOpen(true);
      try {
        localStorage.removeItem("studyroom_active_break");
      } catch {}
      return;
    }

    // 2. Client Fallback: Check localStorage if user was active on this specific device
    try {
      const stored = localStorage.getItem("studyroom_active_break");
      if (stored) {
        const data = JSON.parse(stored);
        if (data.userId === profile.id && data.breakStartedAt) {
          const breakStartMs = new Date(data.breakStartedAt).getTime();
          if (!isNaN(breakStartMs) && getServerNow().getTime() - breakStartMs >= 3600 * 1000) {
            setSavedStudySecondsOnBreakExpiry(data.accruedSeconds || 0);
            setIsBreakExpiredNoticeOpen(true);
          }
        }
        localStorage.removeItem("studyroom_active_break");
      }
    } catch {
      // storage error
    }

    // 3. Client Fallback for 3-hour study limit: Check if user was studying when app closed
    try {
      const storedStudy = localStorage.getItem("studyroom_active_study");
      if (storedStudy) {
        const data = JSON.parse(storedStudy);
        if (data.userId === profile.id) {
          const serverNow = getServerNow();
          const startMs = new Date(data.lastResumedAt || data.sessionStartTime).getTime();
          if (!isNaN(startMs)) {
            const accrued = (data.snapshotSeconds || 0) + Math.floor(Math.max(0, serverNow.getTime() - startMs) / 1000);
            if (accrued >= MAX_SESSION_STUDY_SECONDS) {
              setSavedStudySecondsOnLimit(MAX_SESSION_STUDY_SECONDS);
              setIsSessionLimitNoticeOpen(true);
            }
          }
        }
        localStorage.removeItem("studyroom_active_study");
      }
    } catch {
      // storage error
    }
  }, [profile, currentStatus]);

  const profileRef = useRef(profile);
  profileRef.current = profile;
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Immediate sync when profile or blocks updates
  useEffect(() => {
    if (currentStatus === "offline") {
      setElapsedStudySeconds(0);
      return;
    }
    const p = profileRef.current;
    const b = blocksRef.current;
    const serverNow = getServerNow();
    if (p) {
      setElapsedStudySeconds(calculateMemberElapsedStudySeconds(p, serverNow));
    } else {
      setElapsedStudySeconds(calculateActiveStudySeconds(b, serverNow));
    }
  }, [currentStatus, profile, blocks]);

  // Periodic UI refresh loop: Runs continuously without 4-second polling phase resets
  useEffect(() => {
    if (currentStatus !== "studying") {
      return;
    }

    const computeCurrentSeconds = (now: Date) => {
      const p = profileRef.current;
      const b = blocksRef.current;
      if (p) {
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
      if (document.visibilityState === "visible") {
        tick();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, [currentStatus]);

  const startSession = async (focusTag?: string | null) => {
    if (actionLoadingRef.current) return;
    actionLoadingRef.current = true;
    setActionLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_start_session", {
        p_focus: focusTag ?? null,
      });

      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string; server_now?: string };
      if (res?.server_now) {
        calibrateWithServerTime(res.server_now);
      }
      if (!res.success) throw new Error(res.error || "Failed to start session");

      await fetchSessionBlocks();
      if (onStatusChangeRef.current) onStatusChangeRef.current("studying");
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Start session failed";
      setError(msg);
      throw err;
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  };

  const pauseSession = async () => {
    if (actionLoadingRef.current) return;
    actionLoadingRef.current = true;
    setActionLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_pause_session");
      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string; server_now?: string };
      if (res?.server_now) {
        calibrateWithServerTime(res.server_now);
      }
      if (!res.success) throw new Error(res.error || "Failed to pause session");

      await fetchSessionBlocks();
      if (onStatusChangeRef.current) onStatusChangeRef.current("break");
      return res;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pause session failed";
      setError(msg);
      throw err;
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  };

  const resumeSession = async (): Promise<{ success: boolean; expired?: boolean }> => {
    if (actionLoadingRef.current) return { success: false };
    actionLoadingRef.current = true;
    setActionLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_resume_session");
      if (rpcErr) throw rpcErr;

      const res = data as unknown as {
        success: boolean;
        error?: string;
        message?: string;
        server_now?: string;
      };

      if (res?.server_now) {
        calibrateWithServerTime(res.server_now);
      }

      if (!res.success) {
        if (res.error === "break_expired") {
          const accruedSeconds = profile?.active_study_seconds_snapshot ?? elapsedStudySeconds;
          setSavedStudySecondsOnBreakExpiry(accruedSeconds);
          setIsBreakExpiredNoticeOpen(true);
          await fetchSessionBlocks();
          if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
          return { success: false, expired: true };
        }
        throw new Error(res.error || res.message || "Failed to resume session");
      }

      await fetchSessionBlocks();
      if (onStatusChangeRef.current) onStatusChangeRef.current("studying");
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resume session failed";
      if (
        (msg.toLowerCase().includes("break") && msg.toLowerCase().includes("1 hour")) ||
        (profile && isMemberBreakExpired(profile)) ||
        msg.toLowerCase().includes("not currently on break") ||
        msg.toLowerCase().includes("no active session")
      ) {
        const accruedSeconds = profile?.active_study_seconds_snapshot ?? elapsedStudySeconds;
        setSavedStudySecondsOnBreakExpiry(accruedSeconds);
        setIsBreakExpiredNoticeOpen(true);
        setError(null);
        if (onStatusChangeRef.current) onStatusChangeRef.current("offline");
        return { success: false, expired: true };
      } else {
        setError(msg);
        throw err;
      }
    } finally {
      actionLoadingRef.current = false;
      setActionLoading(false);
    }
  };

  const closeBreakExpiredNotice = () => {
    setIsBreakExpiredNoticeOpen(false);
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("studyroom_active_break");
      } catch {}
    }
    if (profile?.last_break_expired_study_seconds) {
      Promise.resolve((supabase as unknown as RpcCaller).rpc("rpc_acknowledge_break_expiry")).catch(() => {});
    }
  };

  const closeSessionLimitNotice = () => {
    setIsSessionLimitNoticeOpen(false);
  };

  const openBreakBlock = blocks.find((b) => b.block_type === "break" && !b.end_time);
  const breakStartedAt = profile?.break_started_at || openBreakBlock?.start_time || null;

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
