import React from "react";
import { Moon, Sun, Star } from "lucide-react";

interface IndicatorProps {
  type: "night" | "early" | "achiever";
  className?: string;
}

export function IndicatorTag({ type, className = "" }: IndicatorProps) {
  if (type === "night") {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-950/40 border border-purple-800/40 text-purple-300 ${className}`}
        title="Actively studying between 12:00 AM and 4:00 AM"
      >
        <Moon className="w-3 h-3 text-purple-400" />
        <span>Deep Night</span>
      </span>
    );
  }

  if (type === "early") {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-fuchsia-950/40 border border-fuchsia-800/40 text-fuchsia-300 ${className}`}
        title="Actively studying between 4:00 AM and 7:00 AM"
      >
        <Sun className="w-3 h-3 text-fuchsia-400" />
        <span>Early Bird</span>
      </span>
    );
  }

  if (type === "achiever") {
    return (
      <span
        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/50 border border-amber-500/40 text-amber-300 ${className}`}
        title="⭐ Previous week's #1 top study achiever"
      >
        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
        <span>Achiever</span>
      </span>
    );
  }

  return null;
}
