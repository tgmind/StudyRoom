"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudySession } from "@/lib/supabase/types";

export function useStudyHistory(userId?: string) {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchHistory = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      // Query study sessions directly with 90-day retention window
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data, error: fetchErr } = await supabase
        .from("study_sessions")
        .select("*")
        .eq("user_id", userId)
        .gte("start_time", ninetyDaysAgo.toISOString())
        .order("start_time", { ascending: false });

      if (fetchErr) {
        // Fallback to RPC if direct table select has issue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: rpcData, error: rpcErr } = await (supabase as any).rpc("rpc_get_study_history");
        if (rpcErr) throw fetchErr;
        setSessions((rpcData || []) as StudySession[]);
        return;
      }

      setSessions((data || []) as StudySession[]);
    } catch (err) {
      console.error("Failed to fetch study history:", err);
      setError(err instanceof Error ? err.message : "Failed to load study history");
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const clearHistory = async () => {
    if (!userId || actionLoading) return;

    setActionLoading(true);
    setError(null);

    try {
      const { error: deleteErr } = await supabase
        .from("study_sessions")
        .delete()
        .eq("user_id", userId);

      if (deleteErr) {
        // Fallback to RPC
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: rpcErr } = await (supabase as any).rpc("rpc_clear_study_history");
        if (rpcErr) throw deleteErr;
        setSessions([]);
        return data;
      }

      setSessions([]);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to clear history";
      setError(msg);
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  return {
    sessions,
    loading,
    actionLoading,
    error,
    clearHistory,
    refreshHistory: fetchHistory,
  };
}
