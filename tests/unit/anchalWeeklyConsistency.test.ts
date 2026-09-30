import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWeekStartTimestamp } from "@/lib/time/format";
import { saveCachedRoomMembers, getCachedRoomMembers } from "@/lib/offline/sessionQueue";
import { STORAGE_KEYS } from "@/lib/offline/storageKeys";

describe("Anchal Weekly Consistency & Cache Sanitization Regression", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("sanitizes Anchal's historical 357m/4-sessions to 0 upon Sunday-to-Monday week rollover", () => {
    const currentWeekStart = getWeekStartTimestamp(new Date());
    const previousWeekStart = currentWeekStart - 7 * 24 * 60 * 60 * 1000;

    // Simulate Anchal's state from previous week (Sep 21-22, 2026: 4 sessions, 357 mins = 21420s)
    const anchalPreviousWeekState = [
      {
        id: "anchal-user-id",
        display_name: "Anchal",
        current_status: "offline",
        weekly_study_seconds: 21420,
        weekly_sessions_count: 4,
        total_sessions_count: 4,
        past_24h_study_seconds: 0,
        leaderboard_score: 85.5,
        leaderboard_rank: 2,
      },
    ];

    // Seed localStorage cache with previous week's timestamp
    localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS, JSON.stringify(anchalPreviousWeekState));
    localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_ts", String(previousWeekStart + 1000));
    localStorage.setItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_week_start", String(previousWeekStart));

    // Client boots up in current week and hydrates cached room members
    const hydrated = getCachedRoomMembers<any>();
    expect(hydrated).not.toBeNull();
    expect(hydrated).toHaveLength(1);

    const anchal = hydrated![0];
    expect(anchal.id).toBe("anchal-user-id");
    expect(anchal.display_name).toBe("Anchal");

    // Authoritative sanitization: Weekly metrics MUST reset to 0
    expect(anchal.weekly_study_seconds).toBe(0);
    expect(anchal.weekly_sessions_count).toBe(0);
    expect(anchal.total_sessions_count).toBe(0);
    expect(anchal.leaderboard_score).toBe(0);
    expect(anchal.leaderboard_rank).toBeUndefined();

    // Verify localStorage was updated so subsequent renders remain clean
    const updatedWeekStart = localStorage.getItem(STORAGE_KEYS.CACHED_ROOM_MEMBERS + "_week_start");
    expect(updatedWeekStart).toBe(String(currentWeekStart));
  });

  it("Phase 2 secondary enrichment sets 0 for Anchal when she has no sessions in the current week", () => {
    // Current week has session data for other users (e.g. Ankita has 180m = 10800s)
    const members = [
      {
        id: "ankita-id",
        display_name: "Ankita",
        current_status: "offline",
        weekly_study_seconds: 0,
        weekly_sessions_count: 0,
      },
      {
        id: "anchal-id",
        display_name: "Anchal",
        current_status: "offline",
        weekly_study_seconds: 21420, // Stale carry-over from memory
        weekly_sessions_count: 4,
      },
    ];

    const statsMap = new Map<string, { weeklySeconds: number; weeklySessions: number; past24hSeconds: number }>();
    statsMap.set("ankita-id", { weeklySeconds: 10800, weeklySessions: 1, past24hSeconds: 10800 });
    // Anchal has 0 completed sessions in the current week (absent from statsMap)

    const hasAnySessions = true; // DB query returned sessions for the room

    const enriched = members.map((m) => {
      const stat = statsMap.get(m.id);
      return {
        ...m,
        weekly_study_seconds: stat?.weeklySeconds ?? (hasAnySessions ? 0 : m.weekly_study_seconds),
        weekly_sessions_count: stat?.weeklySessions ?? (hasAnySessions ? 0 : m.weekly_sessions_count),
      };
    });

    const ankita = enriched.find((m) => m.id === "ankita-id");
    const anchal = enriched.find((m) => m.id === "anchal-id");

    expect(ankita?.weekly_study_seconds).toBe(10800);
    expect(ankita?.weekly_sessions_count).toBe(1);

    // Anchal's weekly metrics are strictly 0 and do NOT retain the 21420s / 4 sessions
    expect(anchal?.weekly_study_seconds).toBe(0);
    expect(anchal?.weekly_sessions_count).toBe(0);
  });
});
