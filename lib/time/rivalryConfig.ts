/**
 * Authoritative Centralized Configuration for Rivalry Arena 2.0
 *
 * All thresholds, warm-up intervals, proximity scores, and timing constants
 * must be configured here to eliminate magic numbers and business-rule duplication.
 */

export const RIVALRY_CONFIG = {
  /**
   * Weekly Monday Warm-up Protection (Asia/Kolkata timezone):
   * First 60 minutes of Monday (00:00 - 01:00) prevents new rivalry creation
   * to maintain a calm, clutter-free start to each new week.
   */
  WEEKLY_RIVALRY_WARMUP_MINUTES: 60,

  /**
   * Minimum weekly active study time in minutes required for rivalry eligibility.
   * Reduced from 180m (3h) to 60m (1h) so meaningful rivalries can activate earlier.
   */
  MIN_RIVALRY_WEEKLY_STUDY_MINUTES: 60,
  MIN_RIVALRY_WEEKLY_SECONDS: 60 * 60, // 3,600 seconds

  /**
   * Proximity Thresholds (in seconds):
   * - START_GAP_SECONDS: Max study-time gap to START a rivalry (10 minutes = 600s).
   * - CONTINUE_GAP_SECONDS: Max study-time gap to CONTINUE a rivalry (15 minutes = 900s).
   *   Provides a 5-minute hysteresis buffer to prevent boundary flickering.
   * - RESOLUTION_GAP_SECONDS: Decisive lead gap (15 minutes = 900s) indicating a legitimate win.
   * - TRIO_SPAN_SECONDS: Max span across all 3 participants in a trio (15 minutes = 900s).
   */
  START_GAP_SECONDS: 10 * 60, // 600s
  CONTINUE_GAP_SECONDS: 15 * 60, // 900s
  RESOLUTION_GAP_SECONDS: 15 * 60, // 900s
  TRIO_SPAN_SECONDS: 10 * 60, // 600s (start threshold)
  TRIO_CONTINUE_SPAN_SECONDS: 15 * 60, // 900s (continue hysteresis threshold)

  /**
   * Competitive Proximity Score Thresholds (0 to 100 Leaderboard Score scale):
   * Used as an auxiliary signal alongside active study duration for intelligent matchmaking.
   */
  SCORE_PROXIMITY: {
    ADJACENT_RANKS_MAX_GAP: 10, // Rank distance = 1: score gap <= 10
    DISTANCE_2_MAX_GAP: 8,      // Rank distance <= 2: score gap <= 8
    DISTANCE_3_MAX_GAP: 6,      // Rank distance <= 3: score gap <= 6
  },

  /**
   * Minimum active study duration (in seconds) that a lead must be held
   * before a true WON resolution can be declared.
   */
  MIN_SUSTAINED_LEAD_SECONDS: 5 * 60, // 300s (5 minutes)

  /**
   * Lifetimes and durations:
   * - EVENT_TTL_MS: 15-minute persistence window for winner notifications.
   * - LIVE_POPUP_DURATION_MS: 10-second duration for online centered celebration popup.
   * - PAIR_COOLDOWN_MS: 15-minute cooldown between identical participants after a win.
   */
  EVENT_TTL_MS: 15 * 60 * 1000, // 15 minutes
  LIVE_POPUP_DURATION_MS: 10 * 1000, // 10 seconds
  PAIR_COOLDOWN_MS: 15 * 60 * 1000, // 15 minutes
} as const;
