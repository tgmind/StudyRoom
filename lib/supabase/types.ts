export type UserStatus = "offline" | "studying" | "break";

export interface UserProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_status: UserStatus;
  current_focus: string | null;
  session_start_time: string | null;
  last_resumed_at?: string | null;
  break_started_at?: string | null;
  active_study_seconds_snapshot?: number | null;
  has_achiever_badge: boolean;
  is_admin?: boolean;
  created_at: string;
}

export interface GoalTask {
  id: string;
  task: string;
  completed: boolean;
}

export interface DailyGoal {
  id: string;
  user_id: string;
  tasks: GoalTask[];
  created_at: string;
  expires_at: string;
  is_locked: boolean;
  archived_at: string | null;
}

export interface CompletedSessionTask {
  id: string;
  task: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  focus_tag?: string | null;
  completed_tasks?: CompletedSessionTask[];
}

export type BlockType = "study" | "break";

export interface SessionBlock {
  id: string;
  user_id: string;
  session_id: string | null;
  block_type: BlockType;
  start_time: string;
  end_time: string | null;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  has_achiever_badge: boolean;
  current_status: UserStatus;
  total_study_minutes: number;
  goal_completion_pct: number;
  streak_days: number;
  score: number;
}

export interface SessionState {
  status: UserStatus;
  focus: string | null;
  session_start_time: string | null;
  active_block_start: string | null;
  elapsed_study_seconds: number;
}

export interface ScoringResult {
  study_hours_score: number;
  goal_completion_score: number;
  consistency_score: number;
  composite_score: number;
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserProfile;
        Insert: Partial<UserProfile> & { id: string; display_name: string };
        Update: Partial<UserProfile>;
        Relationships: [];
      };
      daily_goals: {
        Row: DailyGoal;
        Insert: Partial<DailyGoal> & { user_id: string; tasks: GoalTask[] };
        Update: Partial<DailyGoal>;
        Relationships: [];
      };
      study_sessions: {
        Row: StudySession;
        Insert: Partial<StudySession> & {
          user_id: string;
          start_time: string;
          end_time: string;
          duration_minutes: number;
          focus_tag?: string | null;
          completed_tasks?: CompletedSessionTask[];
        };
        Update: Partial<StudySession>;
        Relationships: [];
      };
      session_blocks: {
        Row: SessionBlock;
        Insert: Partial<SessionBlock> & { user_id: string; block_type: BlockType };
        Update: Partial<SessionBlock>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      rpc_start_session: {
        Args: { p_focus?: string | null };
        Returns: Json;
      };
      rpc_pause_session: {
        Args: Record<string, never>;
        Returns: Json;
      };
      rpc_resume_session: {
        Args: Record<string, never>;
        Returns: Json;
      };
      rpc_finish_session: {
        Args: { p_completed_task_ids?: string[] };
        Returns: Json;
      };
      rpc_create_daily_goal: {
        Args: { p_tasks: GoalTask[] };
        Returns: Json;
      };
      rpc_add_goal_tasks: {
        Args: { p_new_tasks: GoalTask[] };
        Returns: Json;
      };
      rpc_get_study_history: {
        Args: Record<string, never>;
        Returns: StudySession[];
      };
      rpc_clear_study_history: {
        Args: Record<string, never>;
        Returns: Json;
      };
      rpc_get_leaderboard: {
        Args: { p_week_start?: string | null; p_timezone?: string };
        Returns: LeaderboardEntry[];
      };
      rpc_calculate_weekly_achiever: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      rpc_admin_get_all_users: {
        Args: { p_admin_email: string };
        Returns: Json;
      };
      rpc_admin_rename_user: {
        Args: { p_admin_email: string; p_target_user_id: string; p_new_name: string };
        Returns: Json;
      };
      rpc_admin_delete_user: {
        Args: { p_admin_email: string; p_target_user_id: string };
        Returns: Json;
      };
      rpc_admin_force_end_session: {
        Args: { p_admin_email: string; p_target_user_id: string };
        Returns: Json;
      };
      rpc_admin_get_platform_stats: {
        Args: { p_admin_email: string };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
