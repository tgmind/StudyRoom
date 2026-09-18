// Storage keys and interfaces for full offline resilience, session tracking, and sync queue

export const STORAGE_KEYS = {
  OFFLINE_SESSION_QUEUE: "studyroom_offline_session_queue",
  OFFLINE_ACTIVE_SESSION: "studyroom_offline_active_session",
  CACHED_USER_PROFILE: "studyroom_cached_user_profile",
  CACHED_ACTIVE_GOAL: "studyroom_cached_active_goal",
  CACHED_SESSIONS: "studyroom_cached_sessions",
  CACHED_ROOM_MEMBERS: "studyroom_cached_room_members",
  OFFLINE_COMPLETED_SESSIONS: "studyroom_offline_completed_sessions",
  ACTIVE_STUDY: "studyroom_active_study",
  ACTIVE_BREAK: "studyroom_active_break",
  ADMIN_UID: "studyroom_admin_uid",
  ACTIVE_RIVALRY_WIN: "studyroom_active_rivalry_win",
  PWA_BANNER_DISMISSED: "pwa_banner_dismissed",
} as const;

export const STORAGE_KEY_PREFIX = "studyroom_";

export interface OfflineSessionBlock {
  id: string;
  block_type: "study" | "break";
  start_time: string; // ISO
  end_time: string | null; // ISO
}

export interface OfflineActiveSession {
  sessionId: string;
  userId: string;
  startTime: string; // ISO
  status: "studying" | "break";
  elapsedStudySeconds: number;
  lastResumedAt: string | null;
  breakStartedAt: string | null;
  blocks: OfflineSessionBlock[];
  updatedAt: string; // ISO
}

export interface CompletedOfflineSessionRecord {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  break_minutes?: number;
  completed_tasks: Array<{ id: string; task: string }>;
  blocks: OfflineSessionBlock[];
  created_at: string;
  is_offline_created: boolean;
}

export type QueuedActionType =
  | "offline_session_sync"
  | "start_session"
  | "pause_session"
  | "resume_session"
  | "finish_session"
  | "complete_session_goals"
  | "create_goal"
  | "add_goal_tasks";

export interface QueuedSessionAction {
  id: string; // Unique idempotency ID
  action: QueuedActionType;
  userId?: string;
  createdAtIso: string;
  elapsedStudySeconds?: number;
  completedTaskIds?: string[];
  payload?: Record<string, unknown>;
  attempts: number;
  lastAttemptAt?: number;
}
