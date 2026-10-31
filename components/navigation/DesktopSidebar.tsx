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
  Crown,
  BookOpen,
  ArrowRight,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { StudyRoomLogo } from "@/components/ui/StudyRoomLogo";
import { resolveAvatarUrl, getAvatarScaleStyle } from "@/lib/avatars/manifest";

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

export interface DesktopSidebarProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const DesktopSidebar = memo(function DesktopSidebar({
  isCollapsed = false,
  onToggleCollapse,
}: DesktopSidebarProps) {
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
      className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 bg-zinc-950 border-r border-zinc-800/80 z-40 select-none shadow-[4px_0_24px_rgba(0,0,0,0.5)] transition-[width] duration-300 ease-in-out ${
        isCollapsed ? "lg:w-16" : "lg:w-64 xl:w-72"
      }`}
    >
      {/* Top Header / Branding */}
      <div
        className={`h-16 border-b border-zinc-800/80 shrink-0 flex items-center transition-all duration-300 ${
          isCollapsed ? "justify-center px-2" : "justify-between px-5"
        }`}
      >
        <Link
          href="/room"
          className="flex items-center space-x-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-lg p-1"
          aria-label="StudyRoom Home"
          title="StudyRoom Home"
        >
          <StudyRoomLogo className="w-8 h-8 group-hover:scale-105 transition-transform shrink-0" />
          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="text-base font-black tracking-tight text-zinc-100 group-hover:text-white transition-colors">
                StudyRoom
              </span>
              <span className="text-[10px] font-semibold text-zinc-500 block -mt-0.5 truncate">
                Live Group Study
              </span>
            </div>
          )}
        </Link>

        {/* Action button: Collapse toggle or PWA badge */}
        {!isCollapsed ? (
          <div className="flex items-center space-x-1.5">
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>PWA</span>
            </div>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand sidebar"
              aria-label="Expand sidebar"
              className="absolute -right-3 top-5 w-6 h-6 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 hover:text-white flex items-center justify-center shadow-lg transition-transform hover:scale-110 z-50 cursor-pointer"
            >
              <PanelLeft className="w-3 h-3" />
            </button>
          )
        )}
      </div>

      {/* Active Study Session Notification Card (if user is in a session) */}
      {isSessionActive && (
        <div
          className={`transition-all duration-300 ${
            isCollapsed
              ? "mx-2 mt-2 p-2 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-col items-center justify-center text-center shadow-md cursor-pointer"
              : "mx-3 mt-3 p-3 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-lg space-y-2"
          }`}
          title={
            isStudying
              ? `Studying Now: ${profile?.current_focus || "Focus Session"}`
              : "On Break"
          }
        >
          {isCollapsed ? (
            <Link href="/room" className="flex flex-col items-center space-y-1">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isStudying
                    ? "bg-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.8)] animate-pulse"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              <span className="text-[9px] font-black uppercase text-zinc-400">
                {isStudying ? "Live" : "Rest"}
              </span>
              <span className="sr-only">
                {isStudying ? "Studying Now" : "On Break"}
              </span>
            </Link>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      {/* Main Navigation Menu */}
      <nav
        aria-label="Main menu"
        className={`flex-1 py-3 space-y-1 overflow-y-auto transition-all ${
          isCollapsed ? "px-2" : "px-3"
        }`}
      >
        {!isCollapsed && (
          <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Navigation
          </div>
        )}
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
              title={item.label}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              className={`group flex items-center rounded-xl text-xs font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isCollapsed
                  ? "justify-center p-2.5 my-1"
                  : "justify-between px-3 py-2.5"
              } ${
                isActive
                  ? "bg-white text-zinc-950 shadow-[0_2px_12px_rgba(255,255,255,0.18)] font-black"
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70"
              }`}
            >
              <div
                className={`flex items-center min-w-0 ${
                  isCollapsed ? "justify-center" : "space-x-3"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive
                      ? item.href === "/streak"
                        ? "text-amber-500 fill-amber-500 stroke-[2.25]"
                        : "text-zinc-950 stroke-[2.25]"
                      : "text-zinc-400 group-hover:text-zinc-200"
                  }`}
                />
                <span className={isCollapsed ? "sr-only" : "truncate"}>
                  {item.label}
                </span>
              </div>

              {/* Indicator dot or tag (expanded only) */}
              {!isCollapsed && isActive && (
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
        <div className={isCollapsed ? "pt-2" : "pt-3"}>
          <Link
            href="/guide"
            prefetch={true}
            title="Feature Handbook"
            aria-label="Feature Handbook"
            className={`group flex items-center rounded-xl text-xs font-semibold transition-all ${
              isCollapsed ? "justify-center p-2.5" : "space-x-3 px-3 py-2"
            } ${
              pathname === "/guide"
                ? "bg-violet-500/15 text-violet-300 border border-violet-500/30"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40"
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0 text-violet-400" />
            <span className={isCollapsed ? "sr-only" : "truncate"}>
              Feature Handbook
            </span>
          </Link>
        </div>
      </nav>

      {/* User Profile or Guest Sign-In Footer */}
      {user ? (
        <div
          className={`border-t border-zinc-800/80 bg-zinc-950/80 shrink-0 transition-all ${
            isCollapsed ? "p-2 flex justify-center" : "p-3"
          }`}
        >
          <Link
            href="/settings"
            title={`Account & Settings: ${profile?.display_name || "Study Member"}`}
            aria-label={`Account & Settings: ${profile?.display_name || "Study Member"}`}
            className={`flex items-center rounded-xl hover:bg-zinc-900 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              isCollapsed ? "p-1.5 justify-center" : "justify-between p-2"
            }`}
          >
            <div
              className={`flex items-center min-w-0 ${
                isCollapsed ? "justify-center" : "space-x-2.5"
              }`}
            >
              <div
                className={`relative w-8 h-8 rounded-full ${
                  resolveAvatarUrl(profile?.avatar_id, profile?.avatar_url) ? "bg-white" : "bg-zinc-800"
                } border border-zinc-700 overflow-hidden flex items-center justify-center text-xs font-extrabold text-zinc-200 shrink-0 shadow-inner`}
              >
                {resolveAvatarUrl(profile?.avatar_id, profile?.avatar_url) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveAvatarUrl(profile?.avatar_id, profile?.avatar_url)!}
                    alt={profile?.display_name || "User"}
                    style={getAvatarScaleStyle(profile?.avatar_url)}
                    className="w-full h-full object-cover object-center bg-white"
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

              {!isCollapsed && (
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
              )}
            </div>

            {!isCollapsed && (
              <Settings className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0 ml-1.5" />
            )}
          </Link>
        </div>
      ) : (
        <div className={`p-3 border-t border-zinc-800/80 bg-zinc-950/80 shrink-0 ${isCollapsed ? "p-2" : ""}`}>
          <Link
            href="/login"
            title="Sign In to StudyRoom"
            aria-label="Sign In to StudyRoom"
            className={`w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-extrabold flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-violet-600/20 ${
              isCollapsed ? "px-2" : "px-3"
            }`}
          >
            {isCollapsed ? (
              <ArrowRight className="w-4 h-4" />
            ) : (
              <>
                <span>Sign In to StudyRoom</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </Link>
        </div>
      )}
    </aside>
  );
});
