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
  enrollment_grant_id?: string | null;
  created_at: string;
  past_24h_study_seconds?: number;
  total_sessions_count?: number;
  weekly_sessions_count?: number;
  last_break_expired_study_seconds?: number | null;
  pending_goal_session_id?: string | null;
  pending_goal_seconds?: number | null;
  pending_goal_reason?: "manual_stop" | "session_limit" | "break_expired" | string | null;
  weekly_study_seconds?: number;
  last_offline_at?: string | null;
  leaderboard_score?: number;
  leaderboard_rank?: number;
  streak_days?: number;
  completed_tasks?: number;
  total_tasks?: number;
  total_study_minutes?: number;
  is_present?: boolean;
  state_version?: number;
  updated_at?: string | null;
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
  break_minutes?: number;
  completed_tasks?: CompletedSessionTask[];
  split_part?: number | null;
  sibling_session_id?: string | null;
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
  completed_tasks?: number;
  total_tasks?: number;
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
  volume_score?: number;
  discipline_score?: number;
}

export interface WeeklyAchieverSnapshot {
  id: string;
  celebration_period_id: string;
  source_period_id: string;
  achiever_user_id: string | null;
  display_name: string;
  avatar_url: string | null;
  week_start: string;
  week_end: string;
  total_study_minutes: number;
  average_study_minutes_per_day: number;
  study_sessions_count: number;
  active_study_days: number;
  goal_completion_pct: number;
  completed_goals_count: number;
  total_goals_count: number;
  leaderboard_score?: number | null;
  score?: number | null;
  global_rank: number;
  is_finalized: boolean;
  finalized_at: string;
}

export interface MostStudyingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_study_minutes: number;
  daily_average_minutes: number;
  active_study_days: number;
  score: number;
}

export interface ConsistencyEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_study_minutes: number;
  daily_average_minutes: number;
  active_study_days: number;
  score: number;
}

export type LowPerformerEntry = ConsistencyEntry;

export interface AchieverWinnerEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  achiever_count: number;
  total_study_minutes: number;
}

export interface GoalChaserEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  completed_tasks: number;
  total_tasks: number;
  goal_completion_pct: number;
  total_study_minutes: number;
}

export interface GlobalAnalyticsRankings {
  most_studying: MostStudyingEntry[];
  consistency_rhythm_matrix?: ConsistencyEntry[];
  achiever_winners: AchieverWinnerEntry[];
  goal_chasers: GoalChaserEntry[];
  /**
   * @deprecated Legacy field from deprecated "Students Needing Consistency Boost" concept.
   * Preserved ONLY for historical snapshot JSON deserialization.
   * Never treat or render this field as top consistent students.
   */
  low_performers?: LowPerformerEntry[];
}

export interface GlobalCommunityStats {
  total_eligible_students: number;
  global_avg_study_minutes: number;
  global_avg_daily_minutes: number;
  global_avg_goal_pct: number;
  total_community_hours: number;
  total_completed_goals: number;
}

export interface UserGlobalPosition {
  user_id: string;
  rank: number;
  total_eligible_students: number;
  percentile: number;
  total_study_minutes: number;
  daily_average_minutes: number;
  active_study_days: number;
  completed_tasks: number;
  total_tasks: number;
  goal_completion_pct: number;
  score: number;
  is_in_top5: boolean;
  minutes_to_top5: number;
  delta_vs_community_study_mins: number;
  delta_vs_community_goal_pct: number;
}

export interface GlobalAnalyticsPayload {
  success: boolean;
  is_finalized: boolean;
  period_id: string;
  celebration_period_id: string;
  week_start: string;
  week_end: string;
  finalized_at: string;
  achiever: WeeklyAchieverSnapshot | null;
  rankings: GlobalAnalyticsRankings;
  community_stats: GlobalCommunityStats;
  user_position: UserGlobalPosition | null;
  message?: string;
}

export interface UserAnalyticsAcknowledgement {
  id: string;
  user_id: string;
  period_id: string;
  action: "dismissed" | "viewed";
  acknowledged_at: string;
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
      rivalry_events: {
        Row: {
          id: string;
          resolution_id?: string | null;
          rivalry_id?: string | null;
          rivalry_mode?: string | null;
          winner_id?: string | null;
          winner_name: string;
          loser_id?: string | null;
          loser_name: string;
          participant_ids?: string[] | null;
          final_standings?: Json | null;
          resolution_type?: string | null;
          occurred_at?: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          resolution_id?: string | null;
          rivalry_id?: string | null;
          rivalry_mode?: string | null;
          winner_id?: string | null;
          winner_name: string;
          loser_id?: string | null;
          loser_name: string;
          participant_ids?: string[] | null;
          final_standings?: Json | null;
          resolution_type?: string | null;
          occurred_at?: string | null;
          created_at?: string;
        };
        Update: Partial<{
          id: string;
          resolution_id: string | null;
          rivalry_id: string | null;
          rivalry_mode: string | null;
          winner_id: string | null;
          winner_name: string;
          loser_id: string | null;
          loser_name: string;
          participant_ids: string[] | null;
          final_standings: Json | null;
          resolution_type: string | null;
          occurred_at: string | null;
          created_at: string;
        }>;
        Relationships: [];
      };
      public_payment_submissions: {
        Row: {
          id: string;
          name: string;
          contact: string;
          email?: string | null;
          phone?: string | null;
          utr: string;
          amount: number;
          claim_secret_hash: string | null;
          status: "pending" | "verified" | "rejected";
          email_delivery_status?: string | null;
          email_delivery_error?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          notes?: string | null;
          submitted_at: string;
          created_at: string;
          updated_at?: string | null;
        };
        Insert: Partial<{
          id: string;
          name: string;
          contact: string;
          email?: string | null;
          phone?: string | null;
          utr: string;
          amount: number;
          claim_secret_hash: string | null;
          status: "pending" | "verified" | "rejected";
          email_delivery_status?: string | null;
          email_delivery_error?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          notes?: string | null;
          submitted_at: string;
          created_at: string;
          updated_at?: string | null;
        }>;
        Update: Partial<{
          id: string;
          name: string;
          contact: string;
          email?: string | null;
          phone?: string | null;
          utr: string;
          amount: number;
          claim_secret_hash: string | null;
          status: "pending" | "verified" | "rejected";
          email_delivery_status?: string | null;
          email_delivery_error?: string | null;
          verified_at?: string | null;
          verified_by?: string | null;
          notes?: string | null;
          submitted_at: string;
          created_at: string;
          updated_at?: string | null;
        }>;
        Relationships: [];
      };
      enrollment_grants: {
        Row: {
          id: string;
          grant_token_hash: string;
          otp_code: string;
          authorization_type: "payment" | "referral_coupon";
          source_reference: string;
          payment_submission_id?: string | null;
          coupon_id?: string | null;
          name?: string | null;
          contact?: string | null;
          email?: string | null;
          phone?: string | null;
          access_token_hash?: string | null;
          access_token_expires_at?: string | null;
          status: "active" | "preverified" | "signup_in_progress" | "consumed" | "expired" | "revoked";
          created_at: string;
          expires_at: string;
          preverified_at?: string | null;
          reservation_expires_at?: string | null;
          reserved_email?: string | null;
          creation_nonce_hash?: string | null;
          consumed_at?: string | null;
          consumed_by_user_id?: string | null;
          consumed_email?: string | null;
          failed_attempts: number;
          last_attempt_at?: string | null;
          notes?: string | null;
          updated_at?: string | null;
        };
        Insert: Partial<{
          id: string;
          grant_token_hash: string;
          otp_code: string;
          authorization_type: "payment" | "referral_coupon";
          source_reference: string;
          payment_submission_id?: string | null;
          coupon_id?: string | null;
          name?: string | null;
          contact?: string | null;
          email?: string | null;
          phone?: string | null;
          access_token_hash?: string | null;
          access_token_expires_at?: string | null;
          status: "active" | "preverified" | "signup_in_progress" | "consumed" | "expired" | "revoked";
          created_at: string;
          expires_at: string;
          preverified_at?: string | null;
          reservation_expires_at?: string | null;
          reserved_email?: string | null;
          creation_nonce_hash?: string | null;
          consumed_at?: string | null;
          consumed_user_id?: string | null;
          consumed_email?: string | null;
          failed_attempts: number;
          last_attempt_at?: string | null;
          notes?: string | null;
          updated_at?: string | null;
        }>;
        Update: Partial<{
          id: string;
          grant_token_hash: string;
          otp_code: string;
          authorization_type: "payment" | "referral_coupon";
          source_reference: string;
          payment_submission_id?: string | null;
          coupon_id?: string | null;
          name?: string | null;
          contact?: string | null;
          email?: string | null;
          phone?: string | null;
          access_token_hash?: string | null;
          access_token_expires_at?: string | null;
          status: "active" | "preverified" | "signup_in_progress" | "consumed" | "expired" | "revoked";
          created_at: string;
          expires_at: string;
          preverified_at?: string | null;
          reservation_expires_at?: string | null;
          reserved_email?: string | null;
          creation_nonce_hash?: string | null;
          consumed_at?: string | null;
          consumed_user_id?: string | null;
          consumed_email?: string | null;
          failed_attempts: number;
          last_attempt_at?: string | null;
          notes?: string | null;
          updated_at?: string | null;
        }>;
        Relationships: [];
      };
      public_coupons: {
        Row: {
          id: string;
          code: string;
          discount_percent: number;
          is_active: boolean;
          max_uses: number;
          used_count: number;
          created_at: string;
          updated_at?: string | null;
        };
        Insert: Partial<{
          id: string;
          code: string;
          discount_percent: number;
          is_active: boolean;
          max_uses: number;
          used_count: number;
          created_at: string;
          updated_at?: string | null;
        }>;
        Update: Partial<{
          id: string;
          code: string;
          discount_percent: number;
          is_active: boolean;
          max_uses: number;
          used_count: number;
          created_at: string;
          updated_at?: string | null;
        }>;
        Relationships: [];
      };
      public_referral_enrollments: {
        Row: {
          id: string;
          coupon_code: string;
          name: string;
          referred_by: string;
          agreement_accepted: boolean;
          status: string;
          created_at: string;
        };
        Insert: Partial<{
          id: string;
          coupon_code: string;
          name: string;
          referred_by: string;
          agreement_accepted: boolean;
          status: string;
          created_at: string;
        }>;
        Update: Partial<{
          id: string;
          coupon_code: string;
          name: string;
          referred_by: string;
          agreement_accepted: boolean;
          status: string;
          created_at: string;
        }>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      rpc_stop_user_session: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      rpc_acknowledge_break_expiry: {
        Args: Record<string, never>;
        Returns: Json;
      };
      rpc_cleanup_expired_breaks: {
        Args: Record<string, never>;
        Returns: Json;
      };
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
      rpc_record_break_expiry_goals: {
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
      rpc_verify_payment_and_create_grant: {
        Args: {
          p_submission_id: string;
          p_token_hash: string;
          p_otp: string;
          p_admin_identifier: string;
        };
        Returns: Json;
      };
      rpc_claim_coupon_and_create_grant: {
        Args: {
          p_coupon_code: string;
          p_name: string;
          p_referred_by: string;
          p_token_hash: string;
          p_otp: string;
          p_ip_address?: string;
        };
        Returns: Json;
      };
      rpc_reserve_enrollment_grant: {
        Args: {
          p_token_hash: string;
          p_otp: string;
          p_email: string;
          p_nonce_hash: string;
        };
        Returns: Json;
      };
      rpc_release_enrollment_reservation: {
        Args: {
          p_grant_id: string;
        };
        Returns: void;
      };
      rpc_cleanup_expired_enrollment_grants: {
        Args: Record<string, never>;
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
