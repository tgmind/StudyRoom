"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, SessionBlock, UserStatus } from "@/lib/supabase/types";
import { calculateActiveStudySeconds, calculateMemberElapsedStudySeconds } from "@/lib/time/format";
import { calculateBreakStatus, BreakStatusResult } from "@/lib/time/break";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export function useActiveSession(profile: UserProfile | null, onStatusChange?: () => void) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [elapsedStudySeconds, setElapsedStudySeconds] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1-Hour Break Expiry State
  const [isBreakExpiredNoticeOpen, setIsBreakExpiredNoticeOpen] = useState(false);
  const [savedStudySecondsOnBreakExpiry, setSavedStudySecondsOnBreakExpiry] = useState(0);
  const isAutoTerminatingRef = useRef(false);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  const supabase = createClient();
  const currentStatus: UserStatus = profile?.current_status ?? "offline";

  // Fetch session blocks for current unfinalized session
  const fetchSessionBlocks = useCallback(async () => {
    if (!profile || profile.current_status === "offline") {
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

      // Compute authoritative elapsed seconds
      if (profile) {
        setElapsedStudySeconds(calculateMemberElapsedStudySeconds(profile, new Date()));
      } else {
        setElapsedStudySeconds(calculateActiveStudySeconds(fetchedBlocks, new Date()));
      }
    } catch (err) {
      console.error("Failed to fetch session blocks:", err);
    }
  }, [supabase, profile]);

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
        };

        if (!res.success) throw new Error(res.error || "Failed to finish session");

        setBlocks([]);
        setElapsedStudySeconds(0);
        if (onStatusChange) onStatusChange();

        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Finish session failed";
        setError(msg);
        throw err;
      } finally {
        setActionLoading(false);
      }
    },
    [supabase, onStatusChange]
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

      const breakStatus: BreakStatusResult = calculateBreakStatus(breakStart, new Date());

      if (breakStatus.isExpired) {
        isAutoTerminatingRef.current = true;
        const accruedSeconds = profile.active_study_seconds_snapshot ?? elapsedStudySecondsRef.current;
        setSavedStudySecondsOnBreakExpiry(accruedSeconds);

        try {
          // Terminate session with no additional task completions
          await finishSession([]);
          setIsBreakExpiredNoticeOpen(true);
          if (onStatusChangeRef.current) onStatusChangeRef.current();
        } catch (terminateErr) {
          console.error("Auto-termination on break expiry failed:", terminateErr);
        }
      }
    };

    // Check immediately on mount/update
    checkBreakTimeout();

    // Check every 2 seconds while on break
    const intervalId = setInterval(checkBreakTimeout, 2000);
    return () => clearInterval(intervalId);
  }, [currentStatus, profile, blocks, finishSession]);

  // Periodic UI refresh loop: Only ticks when actively 'studying'; frozen on 'break' or 'offline'
  useEffect(() => {
    if (currentStatus === "offline") {
      setElapsedStudySeconds(0);
      return;
    }

    const computeCurrentSeconds = (now: Date) => {
      if (profile) {
        return calculateMemberElapsedStudySeconds(profile, now);
      }
      return calculateActiveStudySeconds(blocks, now);
    };

    if (currentStatus === "break") {
      // Freeze timer at current calculated active study duration
      setElapsedStudySeconds(computeCurrentSeconds(new Date()));
      return;
    }

    // Actively studying: tick every 1 second
    setElapsedStudySeconds(computeCurrentSeconds(new Date()));
    const intervalId = setInterval(() => {
      setElapsedStudySeconds(computeCurrentSeconds(new Date()));
    }, 1000);

    return () => clearInterval(intervalId);
  }, [currentStatus, profile, blocks]);

  const startSession = async (focusTag?: string | null) => {
    if (actionLoading) return;
    setActionLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_start_session", {
        p_focus: focusTag ?? null,
      });

      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to start session");

      await fetchSessionBlocks();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Start session failed";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const pauseSession = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_pause_session");
      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to pause session");

      await fetchSessionBlocks();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Pause session failed";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const resumeSession = async () => {
    if (actionLoading) return;
    setActionLoading(true);
    setError(null);

    try {
      const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_resume_session");
      if (rpcErr) throw rpcErr;

      const res = data as unknown as {
        success: boolean;
        error?: string;
        message?: string;
      };

      if (!res.success) {
        if (res.error === "break_expired") {
          const accruedSeconds = profile?.active_study_seconds_snapshot ?? elapsedStudySeconds;
          setSavedStudySecondsOnBreakExpiry(accruedSeconds);
          setIsBreakExpiredNoticeOpen(true);
          await fetchSessionBlocks();
          if (onStatusChange) onStatusChange();
          return;
        }
        throw new Error(res.error || res.message || "Failed to resume session");
      }

      await fetchSessionBlocks();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resume session failed";
      if (msg.toLowerCase().includes("break") && msg.toLowerCase().includes("1 hour")) {
        const accruedSeconds = profile?.active_study_seconds_snapshot ?? elapsedStudySeconds;
        setSavedStudySecondsOnBreakExpiry(accruedSeconds);
        setIsBreakExpiredNoticeOpen(true);
        if (onStatusChange) onStatusChange();
      } else {
        setError(msg);
        throw err;
      }
    } finally {
      setActionLoading(false);
    }
  };

  const closeBreakExpiredNotice = () => {
    setIsBreakExpiredNoticeOpen(false);
  };

  const openBreakBlock = blocks.find((b) => b.block_type === "break" && !b.end_time);
  const breakStartedAt = profile?.break_started_at || openBreakBlock?.start_time || null;

  return {
    status: currentStatus,
    focus: profile?.current_focus ?? null,
    elapsedStudySeconds,
    breakStartedAt,
    actionLoading,
    error,
    isBreakExpiredNoticeOpen,
    savedStudySecondsOnBreakExpiry,
    closeBreakExpiredNotice,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    refreshBlocks: fetchSessionBlocks,
  };
}
