"use client";

import React, { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, Trophy, Target, History, Settings } from "lucide-react";

export const BottomNav = memo(function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { href: "/room", label: "Room", icon: Users },
    { href: "/leaderboard", label: "Rankings", icon: Trophy },
    { href: "/goals", label: "Goals", icon: Target },
    { href: "/history", label: "History", icon: History },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-xl border-t border-zinc-800/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_30px_rgba(0,0,0,0.8)]"
      aria-label="Main application navigation"
    >
      <div className="max-w-md mx-auto flex items-center justify-around h-16 px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all duration-150 touch-manipulation transform-gpu ${
                isActive
                  ? "bg-zinc-900 text-zinc-100 border border-zinc-800 shadow-inner scale-105"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50"
              }`}
            >
              <Icon
                className={`w-4 h-4 mb-0.5 transition-transform duration-150 ${
                  isActive ? "text-zinc-100" : "text-zinc-500"
                }`}
              />
              <span className={isActive ? "text-zinc-100 font-extrabold" : "text-zinc-500"}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
});
