import { getServerNow } from "./clockSync";
import { GOAL_WINDOW_SECONDS } from "./format";

export interface GoalCountdownResult {
  isExpired: boolean;
  remainingSeconds: number;
  formattedText: string;
}

/**
 * Calculates remaining time in 20-hour rolling goal window from authoritative expires_at timestamp.
 */
export function calculateGoalCountdown(
  expiresAtISO: string,
  now: Date = getServerNow()
): GoalCountdownResult {
  const expiresAt = new Date(expiresAtISO).getTime();
  const current = now.getTime();

  if (isNaN(expiresAt) || current >= expiresAt) {
    return {
      isExpired: true,
      remainingSeconds: 0,
      formattedText: "EXPIRED",
    };
  }

  const diffSeconds = Math.min(GOAL_WINDOW_SECONDS, Math.max(0, Math.floor((expiresAt - current) / 1000)));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  let formattedText = "";
  if (hours > 0) {
    formattedText = `${hours}h ${minutes}m remaining`;
  } else if (minutes > 0) {
    formattedText = `${minutes}m ${seconds}s remaining`;
  } else {
    formattedText = `${seconds}s remaining`;
  }

  return {
    isExpired: false,
    remainingSeconds: diffSeconds,
    formattedText,
  };
}
