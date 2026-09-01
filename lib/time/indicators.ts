import { UserStatus } from "@/lib/supabase/types";

/**
 * Determines if a user is actively studying during Deep Night hours (12:00 AM to 4:00 AM in user/configured timezone).
 * @param status Current status of user
 * @param date Reference date (defaults to current time)
 * @param timezone Product timezone (defaults to Asia/Kolkata / Indian Standard Time)
 */
export function isDeepNight(
  status: UserStatus,
  date: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): boolean {
  if (status !== "studying") return false;

  const hours = getHourInTimezone(date, timezone);
  return hours >= 0 && hours < 4;
}

/**
 * Determines if a user is actively studying during Early Bird hours (4:00 AM to 7:00 AM in user/configured timezone).
 * @param status Current status of user
 * @param date Reference date (defaults to current time)
 * @param timezone Product timezone (defaults to Asia/Kolkata / Indian Standard Time)
 */
export function isEarlyBird(
  status: UserStatus,
  date: Date = new Date(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): boolean {
  if (status !== "studying") return false;

  const hours = getHourInTimezone(date, timezone);
  return hours >= 4 && hours < 7;
}

/**
 * Extracts hour (0-23) in specified timezone cleanly.
 */
export function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) % 24 : date.getHours();
  } catch {
    return date.getHours();
  }
}
