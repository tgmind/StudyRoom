"use client";

import React, { memo, useState, useEffect } from "react";
import Image from "next/image";
import { ChevronUp, ChevronDown } from "lucide-react";

const BLUR_PLACEHOLDER =
  "data:image/webp;base64,UklGRjwAAABXRUJQVlA4IDAAAACwAQCdASoQAAkABUB8JZQC7AEQ+QmQAP7s1zVpm3QYRvKB32gbJ+TGbjwn+BNAAAA=";

const STORAGE_KEY = "sr_goals_hero_collapsed";

export const GoalsHeroBanner = memo(function GoalsHeroBanner() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setIsCollapsed(true);
      }
    } catch {
      // Ignore storage access issues
    }
  }, []);

  const toggleCollapsed = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Ignore storage access issues
      }
      return next;
    });
  };

  if (mounted && isCollapsed) {
    return (
      <div className="relative w-full overflow-hidden rounded-xl bg-zinc-950/40 border border-zinc-800/40 px-3 py-2 flex items-center justify-between text-xs transition-all duration-300">
        <div className="flex items-center space-x-2 text-zinc-300 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-semibold tracking-wide text-zinc-300 truncate">
            The Summit Awaits • Every focused hour illuminates the path
          </span>
        </div>
        <button
          type="button"
          onClick={toggleCollapsed}
          className="flex items-center space-x-1 text-[11px] font-medium text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-0.5 rounded-md hover:bg-zinc-800/50 shrink-0"
          title="Expand motivational banner"
          aria-label="Expand motivational banner"
        >
          <span>View</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full group transition-all duration-300">
      {/* Ambient Atmospheric Glow matching the illustration's dual lighting (Warm Amber Dawn on right, Indigo Night on left) */}
      <div
        className="pointer-events-none absolute -inset-1 rounded-2xl opacity-40 blur-2xl transition-opacity duration-700 group-hover:opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 65% 55% at 80% 40%, rgba(245, 158, 11, 0.16), transparent 70%), radial-gradient(ellipse 60% 55% at 20% 60%, rgba(139, 92, 246, 0.14), transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* Main Banner Visual Frame - Seamlessly merged into the page with multi-angle vignette fades */}
      <div className="relative w-full h-28 min-[420px]:h-32 sm:h-40 md:h-44 lg:h-48 overflow-hidden rounded-2xl sm:rounded-3xl border border-white/[0.06] shadow-2xl bg-[#090a0f]">
        {/* Next.js Optimized WebP Hero Image with zero Cumulative Layout Shift */}
        <Image
          src="/images/goals/motivational-summit.webp"
          alt="Late night study desk overlooking illuminated mountain path to the summit"
          fill
          priority
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 85vw, 1024px)"
          placeholder="blur"
          blurDataURL={BLUR_PLACEHOLDER}
          className="object-cover object-[center_36%] transition-transform duration-1000 ease-out group-hover:scale-[1.015]"
        />

        {/* Seamless Vignette: Top dissolve into dark page header */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-10 sm:h-12 bg-gradient-to-b from-[#090a0f] via-[#090a0f]/40 to-transparent"
          aria-hidden="true"
        />

        {/* Seamless Vignette: Bottom dissolve into goals workspace */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-14 sm:h-16 bg-gradient-to-t from-[#090a0f] via-[#090a0f]/60 to-transparent"
          aria-hidden="true"
        />

        {/* Seamless Vignette: Left & Right edge soft falloff */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-8 sm:w-12 bg-gradient-to-r from-[#090a0f]/75 to-transparent"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-8 sm:w-12 bg-gradient-to-l from-[#090a0f]/75 to-transparent"
          aria-hidden="true"
        />

        {/* Ultra-subtle cinematic radial tint for depth */}
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(9,10,15,0.6)_100%)]"
          aria-hidden="true"
        />

        {/* Discreet Collapse Button */}
        <div className="absolute bottom-2.5 sm:bottom-3.5 right-3 sm:right-4 flex items-center pointer-events-none">
          <button
            type="button"
            onClick={toggleCollapsed}
            className="p-1.5 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-md border border-white/10 text-zinc-400 hover:text-zinc-200 transition-all pointer-events-auto opacity-70 hover:opacity-100 shadow-md cursor-pointer"
            title="Minimize motivation banner"
            aria-label="Minimize motivation banner"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
