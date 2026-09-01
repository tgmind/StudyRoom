import React from "react";
import { UserStatus } from "@/lib/supabase/types";

interface StatusBadgeProps {
  status: UserStatus;
  className?: string;
  showText?: boolean;
}

export function StatusBadge({ status, className = "", showText = true }: StatusBadgeProps) {
  const configs: Record<
    UserStatus,
    { label: string; dotBg: string; textClr: string; badgeBg: string }
  > = {
    studying: {
      label: "Studying",
      dotBg: "bg-emerald-500 animate-pulse",
      textClr: "text-emerald-400",
      badgeBg: "bg-emerald-950/40 border-emerald-800/40",
    },
    break: {
      label: "Break",
      dotBg: "bg-amber-500",
      textClr: "text-amber-400",
      badgeBg: "bg-amber-950/40 border-amber-800/40",
    },
    offline: {
      label: "Offline",
      dotBg: "bg-zinc-500",
      textClr: "text-zinc-400",
      badgeBg: "bg-zinc-900 border-zinc-800",
    },
  };

  const config = configs[status] || configs.offline;

  return (
    <span
      className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.badgeBg} ${className}`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dotBg}`} />
      {showText && <span className={config.textClr}>{config.label}</span>}
    </span>
  );
}
