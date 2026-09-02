"use client";

import React from "react";
import { Users, BookOpen, Clock, Coffee, Wifi, BarChart3 } from "lucide-react";
import type { PlatformStats } from "@/hooks/useAdmin";

interface AdminStatsBarProps {
  stats: PlatformStats | null;
  loading: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}

function StatCard({ icon, label, value, accent }: StatCardProps) {
  return (
    <div className={`p-3 rounded-xl bg-zinc-900/80 border ${accent} space-y-1`}>
      <div className="flex items-center space-x-1.5">
        {icon}
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
      </div>
      <p className="text-lg font-black text-zinc-100 tabular-nums">{value}</p>
    </div>
  );
}

export function AdminStatsBar({ stats, loading }: AdminStatsBarProps) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-900/50 border border-zinc-800/80 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      <StatCard
        icon={<Users className="w-3.5 h-3.5 text-violet-400" />}
        label="Total Users"
        value={stats.total_users}
        accent="border-violet-500/20"
      />
      <StatCard
        icon={<BookOpen className="w-3.5 h-3.5 text-fuchsia-400" />}
        label="Studying"
        value={stats.studying}
        accent="border-fuchsia-500/20"
      />
      <StatCard
        icon={<Coffee className="w-3.5 h-3.5 text-amber-400" />}
        label="On Break"
        value={stats.on_break}
        accent="border-amber-500/20"
      />
      <StatCard
        icon={<Wifi className="w-3.5 h-3.5 text-zinc-400" />}
        label="Offline"
        value={stats.offline}
        accent="border-zinc-700/50"
      />
      <StatCard
        icon={<BarChart3 className="w-3.5 h-3.5 text-purple-400" />}
        label="Weekly Sessions"
        value={stats.weekly_sessions}
        accent="border-purple-500/20"
      />
      <StatCard
        icon={<Clock className="w-3.5 h-3.5 text-rose-400" />}
        label="Weekly Hours"
        value={`${stats.weekly_hours}h`}
        accent="border-rose-500/20"
      />
    </div>
  );
}
