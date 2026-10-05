import { describe, it, expect, beforeEach } from "vitest";
import { getLeaderboardPeriodId, getWeekStartTimestamp } from "@/lib/time/format";
import { getCachedUserProfile, saveCachedUserProfile } from "@/lib/offline/sessionQueue";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

describe("Cached User Profile Week Sanitization & Period Binding", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("sanitizes Subodh's previous-week 12h21m (44,460s) to 0 upon Monday rollover while preserving identity", () => {
    const currentWeekStart = getWeekStartTimestamp(new Date());
    const previousWeekStart = currentWeekStart - 7 * 24 * 60 * 60 * 1000;
    const previousPeriodId = "2026-09-28";
    const currentPeriodId = getLeaderboardPeriodId(new Date());

    // Subodh's state on Device A at Sunday 23:50 IST: 44,460s (12h 21m) accumulated across the week
    const subodhPreviousWeekProfile = {
      id: "ee438ced-3c88-4708-864e-3eb12404b1c2",
      display_name: "Subodh",
      avatar_url: "https://example.com/avatar.jpg",
      email: "subodh@example.com",
      current_status: "offline",
      weekly_study_seconds: 44460, // 12h 21m
      weekly_sessions_count: 22,
      total_sessions_count: 50,
      leaderboard_score: 50.0,
      leaderboard_rank: 1,
      _weekly_period_id: previousPeriodId,
    };

    // Save in localStorage as it existed on Sunday
    localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE, JSON.stringify(subodhPreviousWeekProfile));
    localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_ts", String(previousWeekStart + 1000));
    localStorage.setItem(STORAGE_KEYS.CACHED_USER_PROFILE + "_week_start", String(previousWeekStart));

    // Monday morning: getCachedUserProfile is called
    const hydrated = getCachedUserProfile<any>();

    expect(hydrated).not.toBeNull();
    // Identity and non-weekly data are 100% PRESERVED
    expect(hydrated.id).toBe("ee438ced-3c88-4708-864e-3eb12404b1c2");
    expect(hydrated.display_name).toBe("Subodh");
    expect(hydrated.email).toBe("subodh@example.com");
    expect(hydrated.avatar_url).toBe("https://example.com/avatar.jpg");
    expect(hydrated.total_sessions_count).toBe(50);

    // Weekly metrics are STRICTLY SANITIZED to 0 for the brand new week
    expect(hydrated.weekly_study_seconds).toBe(0);
    expect(hydrated.weekly_sessions_count).toBe(0);
    expect(hydrated.leaderboard_score).toBe(0);
    expect(hydrated.leaderboard_rank).toBeUndefined();
    expect(hydrated._weekly_period_id).toBe(currentPeriodId);

    // Verify localStorage was updated with the sanitized state
    const rawSaved = localStorage.getItem(STORAGE_KEYS.CACHED_USER_PROFILE);
    const parsedSaved = JSON.parse(rawSaved!);
    expect(parsedSaved.weekly_study_seconds).toBe(0);
  });

  it("preserves weekly metrics if cache belongs to current week", () => {
    const currentPeriodId = getLeaderboardPeriodId(new Date());

    const activeProfile = {
      id: "user-1",
      display_name: "Alice",
      weekly_study_seconds: 7200, // 2h studied in CURRENT week
      weekly_sessions_count: 2,
    };

    saveCachedUserProfile(activeProfile);

    const loaded = getCachedUserProfile<any>();
    expect(loaded).not.toBeNull();
    expect(loaded.weekly_study_seconds).toBe(7200);
    expect(loaded.weekly_sessions_count).toBe(2);
    expect(loaded._weekly_period_id).toBe(currentPeriodId);
  });
});
