"use client";

import React, { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Trophy,
  Flame,
  Target,
  History,
  CalendarDays,
  Settings,
  Globe,
  Crown,
  BookOpen,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { StudyRoomLogo } from "@/components/ui/StudyRoomLogo";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/room", label: "Study Room", icon: Users, description: "Live group study room" },
  {
    href: "/leaderboard",
    label: "Rankings & Global Analytics",
    icon: Trophy,
    description: "Weekly 50/30/20 leaderboard & community metrics",
  },
  { href: "/streak", label: "Streak", icon: Flame, description: "Habit heatmap & consistency" },
  { href: "/goals", label: "Goals", icon: Target, description: "Continuous 20h commitments" },
  { href: "/history", label: "History", icon: History, description: "Timestamp session archives" },
  { href: "/planner", label: "Planner", icon: CalendarDays, description: "Exam countdowns & prep slots" },
  { href: "/settings", label: "Settings", icon: Settings, description: "Profile & preferences" },
];

export const DesktopSidebar = memo(function DesktopSidebar() {
  const pathname = usePathname() || "";
  const { user, profile } = useAuth();

  const isStudying = profile?.current_status === "studying";
  const isBreak = profile?.current_status === "break";
  const isSessionActive = isStudying || isBreak;

  const initials = profile?.display_name
    ? profile.display_name.substring(0, 2).toUpperCase()
    : "??";

  return (
    <aside
      aria-label="Desktop application navigation"
      className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-64 xl:w-72 bg-zinc-950 border-r border-zinc-800/80 z-40 select-none shadow-[4px_0_24px_rgba(0,0,0,0.5)]"
    >
      {/* Top Header / Branding */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-zinc-800/80 shrink-0">
        <Link
          href="/room"
          className="flex items-center space-x-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg p-1"
          aria-label="StudyRoom Home"
        >
          <StudyRoomLogo className="w-8 h-8 group-hover:scale-105 transition-transform" />
          <div>
            <span className="text-base font-black tracking-tight text-zinc-100 group-hover:text-white transition-colors">
              StudyRoom
            </span>
            <span className="text-[10px] font-semibold text-zinc-500 block -mt-0.5">
              Live Group Study
            </span>
          </div>
        </Link>

        {/* Subtle Live Beacon */}
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>PWA</span>
        </div>
      </div>

      {/* Active Study Session Notification Card (if user is in a session) */}
      {isSessionActive && (
        <div className="mx-3 mt-3 p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  isStudying
                    ? "bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.8)] animate-pulse"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              <span
                className={`text-[11px] font-extrabold uppercase tracking-wider ${
                  isStudying ? "text-fuchsia-300" : "text-amber-300"
                }`}
              >
                {isStudying ? "Studying Now" : "On Break"}
              </span>
            </div>
            <Link
              href="/room"
              className="text-[10px] font-bold text-zinc-400 hover:text-zinc-200 transition-colors flex items-center space-x-0.5"
            >
              <span>Room</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {profile?.current_focus && (
            <p className="text-[11px] text-zinc-300 font-medium truncate" title={profile.current_focus}>
              {profile.current_focus}
            </p>
          )}
        </div>
      )}

      {/* Main Navigation Menu */}
      <nav aria-label="Main menu" className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Navigation
        </div>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isRankingsOrAnalytics =
            item.href === "/leaderboard" &&
            (pathname === "/leaderboard" ||
              pathname.startsWith("/leaderboard/") ||
              pathname === "/analytics" ||
              pathname.startsWith("/analytics/"));

          const isActive =
            isRankingsOrAnalytics ||
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href + "/"));

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              aria-current={isActive ? "page" : undefined}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isActive
                  ? "bg-white text-zinc-950 shadow-[0_2px_12px_rgba(255,255,255,0.18)] font-black"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70"
              }`}
            >
              <div className="flex items-center space-x-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive
                      ? item.href === "/streak"
                        ? "text-amber-500 fill-amber-500 stroke-[2.25]"
                        : "text-zinc-950 stroke-[2.25]"
                      : "text-zinc-400 group-hover:text-zinc-200"
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {/* Indicator dot or tag */}
              {isActive && (
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    item.href === "/streak" ? "bg-amber-500" : "bg-zinc-950"
                  }`}
                />
              )}
            </Link>
          );
        })}

        {/* Feature Guide Quick Link */}
        <div className="pt-3">
          <Link
            href="/guide"
            prefetch={true}
            className={`group flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              pathname === "/guide"
                ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0 text-violet-400" />
            <span className="truncate">Feature Handbook</span>
          </Link>
        </div>
      </nav>

      {/* User Profile or Guest Sign-In Footer */}
      {user ? (
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/80 shrink-0">
          <Link
            href="/settings"
            title="Account & Settings"
            className="flex items-center justify-between p-2 rounded-xl hover:bg-zinc-900 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="relative w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 overflow-hidden flex items-center justify-center text-xs font-extrabold text-zinc-200 shrink-0 shadow-inner">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
                {profile?.has_achiever_badge && (
                  <div className="absolute -top-1 -right-1">
                    <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 drop-shadow" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-1 min-w-0">
                  <span className="text-xs font-bold text-zinc-200 group-hover:text-white truncate block">
                    {profile?.display_name || "Study Member"}
                  </span>
                </div>
                <span className="text-[10px] text-zinc-500 block truncate">
                  {profile?.has_achiever_badge ? "⭐ Weekly Achiever" : "Account & Profile"}
                </span>
              </div>
            </div>

            <Settings className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0 ml-1.5" />
          </Link>
        </div>
      ) : (
        <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/80 shrink-0">
          <Link
            href="/login"
            className="w-full py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-violet-600/20"
          >
            <span>Sign In to StudyRoom</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </aside>
  );
});
