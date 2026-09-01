"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { StudySession } from "@/lib/supabase/types";

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

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
      // Auto-pruning query: Filter records up to 90 days (3 months)
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
        const { data: rpcData, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_get_study_history");
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
        const { data, error: rpcErr } = await (supabase as unknown as RpcCaller).rpc("rpc_clear_study_history");
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
    refreshHistory: fetchHistory,
    clearHistory,
  };
}
