export interface AdminUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  current_status: string;
  current_focus: string | null;
  session_start_time: string | null;
  break_started_at: string | null;
  active_study_seconds_snapshot: number;
  has_achiever_badge: boolean;
  created_at: string;
  active_goal_count: number;
  total_sessions_count: number;
}

export interface PlatformStats {
  total_users: number;
  studying: number;
  on_break: number;
  offline: number;
  weekly_sessions: number;
  weekly_hours: number;
}

export const DEFAULT_ADMIN_EMAIL = "studyaliveapp@gmail.com";
export const LEGACY_ADMIN_EMAIL = "sa@admin.tg";
export const DEFAULT_ADMIN_UID = "8076296e-134a-4036-b8ed-1a9c6ff26ec1";

/** Returns the admin email from env or fallback */
export function getAdminEmail(): string {
  return process.env.NEXT_PUBLIC_ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
}

/** Returns the admin user ID from env, localStorage cache, or fallback */
export function getAdminUserId(): string {
  if (typeof window !== "undefined") {
    try {
      const cached = localStorage.getItem("studyroom_admin_uid");
      if (cached) return cached;
    } catch {
      // localStorage may be unavailable
    }
  }
  return process.env.NEXT_PUBLIC_ADMIN_USER_ID || DEFAULT_ADMIN_UID;
}

/** Check if a given email is the admin email */
export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const adminEmail = getAdminEmail().toLowerCase();
  const normalized = email.toLowerCase().trim();
  return (
    normalized === adminEmail ||
    normalized === DEFAULT_ADMIN_EMAIL ||
    normalized === LEGACY_ADMIN_EMAIL
  );
}

/** Check if a given user ID is the admin user */
export function isAdminUserId(userId: string | undefined | null): boolean {
  if (!userId) return false;
  const adminId = getAdminUserId();
  return userId === adminId || userId === DEFAULT_ADMIN_UID;
}
