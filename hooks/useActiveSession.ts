"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { UserProfile, SessionBlock, UserStatus } from "@/lib/supabase/types";
import { calculateActiveStudySeconds, calculateMemberElapsedStudySeconds } from "@/lib/time/format";

export function useActiveSession(profile: UserProfile | null, onStatusChange?: () => void) {
  const [blocks, setBlocks] = useState<SessionBlock[]>([]);
  const [elapsedStudySeconds, setElapsedStudySeconds] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("rpc_start_session", {
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("rpc_pause_session");
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("rpc_resume_session");
      if (rpcErr) throw rpcErr;

      const res = data as unknown as { success: boolean; error?: string };
      if (!res.success) throw new Error(res.error || "Failed to resume session");

      await fetchSessionBlocks();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Resume session failed";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const finishSession = async (completedTaskIds: string[] = []) => {
    if (actionLoading) return;
    setActionLoading(true);
    setError(null);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: rpcErr } = await (supabase as any).rpc("rpc_finish_session", {
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
  };

  return {
    status: currentStatus,
    focus: profile?.current_focus ?? null,
    elapsedStudySeconds,
    actionLoading,
    error,
    startSession,
    pauseSession,
    resumeSession,
    finishSession,
    refreshBlocks: fetchSessionBlocks,
  };
}
