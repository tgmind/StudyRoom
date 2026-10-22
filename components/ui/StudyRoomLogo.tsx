"use client";

import React, { memo } from "react";

interface StudyRoomLogoProps {
  className?: string;
  size?: number;
  innerClassName?: string;
}

/**
 * Authentic StudyRoom emblem matching public/icons/icon-192x192.png and brand guidelines:
 * A minimalist dark rounded squircle container with a razor-sharp, centered solid white square.
 */
export const StudyRoomLogo = memo(function StudyRoomLogo({
  className = "w-8 h-8",
  innerClassName = "w-[44%] h-[44%]",
}: StudyRoomLogoProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative rounded-xl bg-black border border-white/20 shadow-md flex items-center justify-center shrink-0 select-none overflow-hidden transition-all group-hover:border-white/40 ${className}`}
    >
      {/* Centered crisp white square matching authentic brand icon proportions */}
      <div
        className={`bg-white rounded-[2px] shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-transform group-hover:scale-105 ${innerClassName}`}
      />
    </div>
  );
});
