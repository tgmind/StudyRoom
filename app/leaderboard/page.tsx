"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase/client";
import { LeaderboardEntry } from "@/lib/supabase/types";
import { TopHeader } from "@/components/navigation/TopHeader";
import { BottomNav } from "@/components/navigation/BottomNav";
import { LeaderboardCard } from "@/components/leaderboard/LeaderboardCard";
import { ScoringBreakdown } from "@/components/leaderboard/ScoringBreakdown";
import { Trophy, HelpCircle, Star } from "lucide-react";

export default function LeaderboardPage() {
  const { user, profile } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: rpcErr } = await supabase.rpc("rpc_get_leaderboard");

      if (rpcErr) throw rpcErr;

      setEntries((data as unknown as LeaderboardEntry[]) || []);
    } catch (err) {
      console.error("Failed to fetch leaderboard:", err);
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const userRankIndex = entries.findIndex((e) => e.user_id === user?.id);
  const userEntry = userRankIndex !== -1 ? entries[userRankIndex] : null;
  const userRank = userRankIndex !== -1 ? userRankIndex + 1 : null;

  return (
    <div className="flex-1 flex flex-col min-h-screen pb-20">
      <TopHeader profile={profile} />

      <div className="flex-1 p-4 space-y-5 max-w-xl mx-auto w-full">
        {/* Header & Explainer Button */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center space-x-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <span>Weekly Leaderboard</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              50% Study Hours • 30% Goal Completion • 20% Consistency
            </p>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="View scoring methodology"
            aria-label="View scoring methodology"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Current User Rank Highlight Card */}
        {userEntry && userRank && (
          <div className="p-4 bg-zinc-900 border border-zinc-700 rounded-xl flex items-center justify-between shadow-md">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-400 block">
                Your Current Rank
              </span>
              <div className="text-lg font-extrabold text-zinc-100 flex items-center space-x-2 mt-0.5">
                <span>Rank #{userRank}</span>
                <span className="text-xs font-mono font-normal text-zinc-400">
                  (Score {userEntry.score.toFixed(1)})
                </span>
              </div>
            </div>
            {userRank === 1 && (
              <div className="flex items-center space-x-1 text-xs font-bold text-amber-400 bg-amber-950/60 px-3 py-1.5 rounded-full border border-amber-500/40">
                <Star className="w-4 h-4 fill-amber-400" />
                <span>#1 Achiever</span>
              </div>
            )}
          </div>
        )}

        {/* Leaderboard Entries List */}
        <div className="space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className="w-full h-24 bg-zinc-900/60 border border-zinc-800 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : error ? (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-center text-xs text-red-300">
              {error}
            </div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500">
              No study data recorded for this week yet. Complete your first study session to get ranked!
            </div>
          ) : (
            entries.map((entry, index) => (
              <LeaderboardCard
                key={entry.user_id}
                entry={entry}
                rank={index + 1}
                isCurrentUser={entry.user_id === user?.id}
              />
            ))
          )}
        </div>
      </div>

      <ScoringBreakdown
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />

      <BottomNav />
    </div>
  );
}
