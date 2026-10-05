"use client";

import React, { memo, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Trophy, Sparkles, X, ArrowRight } from "lucide-react";

interface GlobalAnalyticsAlertProps {
  userId?: string;
}

type RpcCaller = {
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export const GlobalAnalyticsAlert = memo(function GlobalAnalyticsAlert({
  userId,
}: GlobalAnalyticsAlertProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [periodId, setPeriodId] = useState<string | null>(null);
  const [isDismissing, setIsDismissing] = useState(false);
  const supabase = createClient();

  // Check server-authoritative alert status
  useEffect(() => {
    if (!userId) return;

    let isCancelled = false;

    const checkAlertStatus = async () => {
      try {
        const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
        const { data, error } = await (supabase as unknown as RpcCaller).rpc(
          "rpc_get_user_analytics_alert_status",
          { p_timezone: timezone }
        );

        if (error || !data) return;

        const result = data as {
          show_alert: boolean;
          celebration_period_id?: string;
          achiever_name?: string;
        };

        if (!isCancelled && result.show_alert && result.celebration_period_id) {
          setPeriodId(result.celebration_period_id);
          setIsVisible(true);
        }
      } catch (err) {
        console.warn("[GlobalAnalyticsAlert] status check:", err);
      }
    };

    checkAlertStatus();

    return () => {
      isCancelled = true;
    };
  }, [userId, supabase]);

  const handleAction = useCallback(
    async (action: "dismissed" | "viewed") => {
      if (!periodId) return;

      setIsDismissing(true);

      // Optimistic exit animation
      setTimeout(() => {
        setIsVisible(false);
      }, 200);

      try {
        await (supabase as unknown as RpcCaller).rpc("rpc_acknowledge_analytics_alert", {
          p_period_id: periodId,
          p_action: action,
        });
      } catch (err) {
        console.warn("[GlobalAnalyticsAlert] acknowledge notice:", err);
      }

      if (action === "viewed") {
        router.push("/analytics");
      }
    },
    [periodId, supabase, router]
  );

  if (!isVisible || !periodId) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`w-full rounded-2xl bg-gradient-to-r from-amber-500/15 via-zinc-900/90 to-yellow-500/10 border border-amber-500/35 p-3.5 sm:p-4 shadow-[0_4px_24px_rgba(245,158,11,0.12)] backdrop-blur-md transition-all duration-200 ${
        isDismissing ? "opacity-0 scale-98 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      <div className="flex items-start sm:items-center justify-between gap-3">
        {/* Left Icon and Message */}
        <div className="flex items-start space-x-3 min-w-0 flex-1">
          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-300 shrink-0 mt-0.5 sm:mt-0 shadow-sm">
            <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex items-center space-x-1.5 text-amber-300 text-[10px] sm:text-xs font-black uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>Weekly Roll Rollover Complete</span>
            </div>
            <p className="text-xs sm:text-sm font-semibold text-zinc-100 leading-snug">
              The new Global Analytics have been updated for the past week. See who is the new Achiever and analyse your Global Ranks
            </p>
          </div>
        </div>

        {/* Dismiss Icon for Compact Mobile */}
        <button
          type="button"
          onClick={() => handleAction("dismissed")}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/80 transition-colors sm:hidden shrink-0 touch-manipulation"
          aria-label="Dismiss alert"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="flex items-center justify-end gap-2 pt-2.5 sm:pt-2 mt-1 sm:mt-0 border-t border-zinc-800/50 sm:border-t-0">
        <button
          type="button"
          onClick={() => handleAction("dismissed")}
          className="px-3 py-1.5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 text-xs font-bold transition-all touch-manipulation inline-flex items-center justify-center shrink-0"
        >
          Dismiss
        </button>

        <button
          type="button"
          onClick={() => handleAction("viewed")}
          className="flex-1 sm:flex-initial px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-zinc-950 text-xs font-black transition-all shadow-[0_2px_12px_rgba(245,158,11,0.3)] hover:shadow-[0_2px_16px_rgba(245,158,11,0.5)] flex items-center justify-center space-x-1.5 touch-manipulation active:scale-95"
        >
          <span>Go to Global Analytics</span>
          <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>
    </div>
  );
});
