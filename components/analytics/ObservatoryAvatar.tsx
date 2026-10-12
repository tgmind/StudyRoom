"use client";

import React, { memo, useState } from "react";

export interface ObservatoryAvatarProps {
  name: string;
  url: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "hero";
  theme?: "amber" | "purple" | "emerald" | "sky" | "default";
  className?: string;
}

/**
 * ObservatoryAvatar
 *
 * Provides a pixel-perfect, concentric squircle avatar tailored for the
 * Study Ecosystem Observatory.
 * - For users with a picture: clips the image with rounded-[inherit] and handles load errors.
 * - For users without a picture (or on load failure): renders a bespoke, high-contrast,
 *   luxury initials crest matching the lens theme.
 */
export const ObservatoryAvatar = memo(function ObservatoryAvatar({
  name,
  url,
  size = "md",
  theme = "default",
  className = "",
}: ObservatoryAvatarProps) {
  const [imageError, setImageError] = useState(false);

  // Extract clean 2-character uppercase initials
  const cleanName = (name || "").trim();
  const initials = cleanName
    ? cleanName
        .split(/\s+/)
        .map((part) => part[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??";

  if (url && !imageError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={cleanName}
        className={`w-full h-full object-cover object-center rounded-[inherit] block pointer-events-none ${className}`}
        loading="lazy"
        onError={() => setImageError(true)}
      />
    );
  }

  const themeClasses = {
    amber:
      "bg-gradient-to-br from-amber-950/70 via-zinc-900 to-zinc-950 text-amber-300 ring-1 ring-inset ring-amber-400/25",
    purple:
      "bg-gradient-to-br from-purple-950/70 via-zinc-900 to-zinc-950 text-purple-300 ring-1 ring-inset ring-purple-400/25",
    emerald:
      "bg-gradient-to-br from-emerald-950/70 via-zinc-900 to-zinc-950 text-emerald-300 ring-1 ring-inset ring-emerald-400/25",
    sky:
      "bg-gradient-to-br from-sky-950/70 via-zinc-900 to-zinc-950 text-sky-300 ring-1 ring-inset ring-sky-400/25",
    default:
      "bg-gradient-to-br from-zinc-800 via-zinc-850 to-zinc-950 text-zinc-200 ring-1 ring-inset ring-zinc-700/50",
  }[theme];

  const sizeClasses = {
    xs: "text-[9px] font-bold",
    sm: "text-[10px] font-extrabold",
    md: "text-[11px] sm:text-xs font-black",
    lg: "text-xs sm:text-sm font-black",
    hero: "text-xs sm:text-sm font-black",
  }[size];

  return (
    <div
      className={`w-full h-full flex items-center justify-center rounded-[inherit] select-none shadow-inner ${themeClasses} ${sizeClasses} ${className}`}
    >
      <span className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] tracking-wider">
        {initials}
      </span>
    </div>
  );
});
