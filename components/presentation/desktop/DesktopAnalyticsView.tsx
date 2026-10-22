"use client";

import React, { memo, useState, useEffect } from "react";
import { DesktopLeaderboardView } from "./DesktopLeaderboardView";
import { UserProfile, GlobalAnalyticsPayload, LeaderboardEntry } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/client";
import { getServerNow } from "@/lib/time/clockSync";
import { getWeekStartTimestamp } from "@/lib/time/format";
import { isAdminUserId } from "@/hooks/useAdmin";

export interface DesktopAnalyticsViewProps {
  profile: UserProfile | null;
  user: any;
  analytics: GlobalAnalyticsPayload | null;
  loading: boolean;
  error: string | null;
  fetchAnalytics: (isBackground?: boolean) => Promise<void>;
}

export const DesktopAnalyticsView = memo(function DesktopAnalyticsView({
  profile,
  user,
  analytics,
  loading: analyticsLoading,
  error: analyticsError,
  fetchAnalytics,
}: DesktopAnalyticsViewProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    let isCancelled = false;
    async function loadLeaderboard() {
      try {
        const timezone = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata";
        const serverNow = getServerNow();
        const currentWeekStartIso = new Date(getWeekStartTimestamp(serverNow, timezone)).toISOString();

        const { data, error } = await (supabase as any).rpc("rpc_get_leaderboard", {
          p_timezone: timezone,
          p_week_start: currentWeekStartIso,
        });

        if (!error && data && !isCancelled) {
          const rawEntries = (data as LeaderboardEntry[]) || [];
          const filtered = rawEntries.filter((e) => !isAdminUserId(e.user_id));
          setEntries(filtered);
        }
      } catch {
        // fallback
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }
    loadLeaderboard();
    return () => {
      isCancelled = true;
    };
  }, [supabase]);

  const userRankIndex = entries.findIndex((e) => e.user_id === user?.id);
  const userEntry = userRankIndex !== -1 ? entries[userRankIndex] : null;
  const userRank = userRankIndex !== -1 ? userRankIndex + 1 : null;

  return (
    <DesktopLeaderboardView
      profile={profile}
      user={user}
      entries={entries}
      loading={loading}
      error={null}
      userEntry={userEntry}
      userRank={userRank}
      isModalOpen={isModalOpen}
      setIsModalOpen={setIsModalOpen}
      analytics={analytics}
      analyticsLoading={analyticsLoading}
      analyticsError={analyticsError}
      fetchAnalytics={fetchAnalytics}
    />
  );
});
