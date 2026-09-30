"use client";

import React, { memo, useState, useEffect, useRef, useCallback, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  Trophy,
  Flame,
  Target,
  History,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { AuthContext } from "@/components/auth/AuthProvider";

export const NAV_INACTIVITY_MS = 20_000;

interface BottomNavProps {
  isStudying?: boolean;
}

export const BottomNav = memo(function BottomNav({ isStudying }: BottomNavProps = {}) {
  const pathname = usePathname() || "";
  const authContext = useContext(AuthContext);

  // Determine if user is in an active study session
  const effectiveIsStudying =
    isStudying !== undefined
      ? isStudying
      : authContext?.profile?.current_status === "studying" ||
        authContext?.profile?.current_status === "break";

  // When studying: collapsed by default. When not studying: expanded by default.
  const [isCollapsed, setIsCollapsed] = useState(effectiveIsStudying);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const navItems = [
    { href: "/room", label: "Room", icon: Users },
    { href: "/leaderboard", label: "Rankings", icon: Trophy },
    { href: "/streak", label: "Streak", icon: Flame },
    { href: "/goals", label: "Goals", icon: Target },
    { href: "/history", label: "History", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const collapseNav = useCallback(() => {
    clearTimer();
    setIsCollapsed(true);
  }, [clearTimer]);

  const resetTimer = useCallback(() => {
    clearTimer();
    // Only auto-collapse on inactivity if in an active study session
    if (effectiveIsStudying) {
      timerRef.current = setTimeout(() => {
        setIsCollapsed(true);
      }, NAV_INACTIVITY_MS);
    }
  }, [clearTimer, effectiveIsStudying]);

  const expandNav = useCallback(() => {
    setIsCollapsed(false);
    resetTimer();
    // Return focus to active nav link after expand for keyboard accessibility
    requestAnimationFrame(() => {
      activeLinkRef.current?.focus();
    });
  }, [resetTimer]);

  const prevPathnameRef = useRef(pathname);

  // Synchronize collapse state with study session transitions
  useEffect(() => {
    clearTimer();
    if (effectiveIsStudying) {
      // Necessarily collapse into the dot when study session is active
      setIsCollapsed(true);
    } else {
      // Must stay expanded in full original form when not in study session
      setIsCollapsed(false);
    }
  }, [effectiveIsStudying, clearTimer]);

  // Route change behavior: only triggers on actual pathname change
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      if (effectiveIsStudying) {
        // If navigating during a study session, show briefly then auto-collapse
        setIsCollapsed(false);
        resetTimer();
      } else {
        // Not in study session: remain expanded in full original form
        setIsCollapsed(false);
        clearTimer();
      }
    }
  }, [pathname, effectiveIsStudying, resetTimer, clearTimer]);

  // Interaction handlers on the nav container to reset inactivity countdown while studying
  const handleNavInteraction = useCallback(() => {
    if (!isCollapsed && effectiveIsStudying) {
      resetTimer();
    }
  }, [isCollapsed, effectiveIsStudying, resetTimer]);

  return (
    <>
      {/* Floating collapsed trigger at bottom-right */}
      {isCollapsed && (
        <button
          ref={triggerRef}
          type="button"
          onClick={expandNav}
          aria-label="Open navigation panel"
          className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-50 flex items-center justify-center p-2 rounded-full cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 motion-reduce:transition-none"
          style={{
            bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
          }}
        >
          {/* Up arrow in White Filled Circle */}
          <span className="relative flex items-center justify-center w-7 h-7 rounded-full bg-white text-zinc-950 shadow-[0_4px_16px_rgba(0,0,0,0.6),_0_0_12px_rgba(255,255,255,0.4)] border border-white/90 backdrop-blur-md transition-all duration-200 group-hover:scale-110 group-hover:shadow-[0_4px_20px_rgba(255,255,255,0.6)] active:scale-95">
            <ChevronUp className="w-4 h-4 text-zinc-950 stroke-[2.75]" aria-hidden="true" />
          </span>
        </button>
      )}

      {/* Main navigation bottom panel */}
      <nav
        suppressHydrationWarning
        aria-label="Main application navigation"
        aria-hidden={isCollapsed}
        inert={isCollapsed ? true : undefined}
        onPointerDown={handleNavInteraction}
        onTouchStart={handleNavInteraction}
        onMouseEnter={handleNavInteraction}
        onMouseMove={handleNavInteraction}
        onFocus={handleNavInteraction}
        onKeyDown={handleNavInteraction}
        className={`fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(0,0,0,0.8)] motion-safe:transition-all duration-300 ease-in-out motion-reduce:transition-none ${
          isCollapsed
            ? "translate-y-full opacity-0 pointer-events-none"
            : "translate-y-0 opacity-100 pointer-events-auto"
        }`}
      >
        {/* Manual quick collapse button (arrow) */}
        <button
          type="button"
          onClick={collapseNav}
          aria-label="Collapse navigation panel"
          tabIndex={isCollapsed ? -1 : 0}
          className="absolute -top-3.5 right-4 z-10 flex items-center justify-center w-7 h-7 rounded-full bg-zinc-900 border border-zinc-700/80 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500 shadow-md transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none cursor-pointer"
        >
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="max-w-md mx-auto flex items-center justify-around h-16 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));

            return (
              <Link
                key={item.href}
                href={item.href}
                ref={isActive ? activeLinkRef : undefined}
                prefetch={true}
                tabIndex={isCollapsed ? -1 : 0}
                aria-current={isActive ? "page" : undefined}
                className={`group flex flex-col items-center justify-center min-w-[46px] sm:min-w-[52px] min-h-[44px] px-1 sm:px-2 py-1 sm:py-1.5 rounded-2xl text-[10px] font-bold transition-all duration-150 touch-manipulation select-none active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:transition-none ${
                  isActive
                    ? item.href === "/streak"
                      ? "bg-white text-zinc-950 shadow-[0_2px_14px_rgba(255,255,255,0.22)] scale-105 ring-1 ring-amber-400/40"
                      : "bg-white text-zinc-950 shadow-[0_2px_14px_rgba(255,255,255,0.22)] scale-105"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 active:bg-zinc-900"
                }`}
              >
                <Icon
                  aria-hidden="true"
                  className={`w-4 h-4 mb-0.5 transition-transform duration-150 motion-reduce:transition-none ${
                    isActive
                      ? item.href === "/streak"
                        ? "text-amber-500 fill-amber-500 stroke-[2.25] motion-safe:animate-pulse motion-reduce:animate-none"
                        : "text-zinc-950 stroke-[2.25]"
                      : "text-zinc-400 group-hover:text-zinc-200"
                  }`}
                />
                <span
                  className={
                    isActive
                      ? "text-zinc-950 font-black text-[10.5px] tracking-tight"
                      : "text-zinc-400 group-hover:text-zinc-200 font-bold"
                  }
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
});
