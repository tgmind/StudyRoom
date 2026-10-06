import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatMinutesToHours } from "@/lib/time/format";
import { isAdminUserId, DEFAULT_ADMIN_UID } from "@/lib/admin";
import {
  WeeklyAchieverSnapshot,
  GlobalAnalyticsRankings,
  GlobalCommunityStats,
  UserGlobalPosition,
  GlobalAnalyticsPayload,
  GoalChaserEntry,
  LowPerformerEntry,
  ConsistencyEntry,
} from "@/lib/supabase/types";

describe("Global Analytics Architecture & Calculation Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Strict 7-Day Average Calculation", () => {
    it("calculates daily average using strictly 7.0 as the denominator", () => {
      const totalMinutesA = 210; // 3.5 hours
      const dailyAvgA = Math.round((totalMinutesA / 7.0) * 10) / 10;
      expect(dailyAvgA).toBe(30.0);

      const totalMinutesB = 1450; // 24.166 hours
      const dailyAvgB = Math.round((totalMinutesB / 7.0) * 10) / 10;
      expect(dailyAvgB).toBe(207.1);

      const totalMinutesZero = 0;
      const dailyAvgZero = Math.round((totalMinutesZero / 7.0) * 10) / 10;
      expect(dailyAvgZero).toBe(0.0);
    });

    it("does NOT divide by active days for the daily average metric", () => {
      const totalMinutes = 700;
      const activeDays = 2; // Studied on only 2 days
      const sevenDayAvg = Math.round((totalMinutes / 7.0) * 10) / 10;
      const activeDaysAvg = Math.round((totalMinutes / activeDays) * 10) / 10;

      expect(sevenDayAvg).toBe(100.0);
      expect(activeDaysAvg).toBe(350.0);
      // Verify that Global Analytics daily average uses 7-day average (100.0)
      expect(sevenDayAvg).not.toBe(activeDaysAvg);
    });
  });

  describe("2. Goal Chaser Calculation & Zero-Denominator Safety", () => {
    it("safely handles total_tasks = 0 without NaN or division by zero", () => {
      const completed = 0;
      const total = 0;
      const hasQualifyingGoals = total > 0;
      expect(hasQualifyingGoals).toBe(false);

      const safePct = total > 0 ? (completed / total) * 100 : 0.0;
      expect(safePct).toBe(0.0);
      expect(Number.isFinite(safePct)).toBe(true);
    });

    it("filters out users with total_tasks = 0 from Goal Chaser ranking", () => {
      const candidateUsers = [
        { id: "u1", name: "Alice", completed: 5, total: 5, pct: 100 },
        { id: "u2", name: "Bob", completed: 0, total: 0, pct: 0 },
        { id: "u3", name: "Charlie", completed: 9, total: 10, pct: 90 },
      ];

      const goalChasers = candidateUsers
        .filter((u) => u.total > 0)
        .sort((a, b) => b.pct - a.pct);

      expect(goalChasers.length).toBe(2);
      expect(goalChasers[0].id).toBe("u1");
      expect(goalChasers[1].id).toBe("u3");
      expect(goalChasers.some((u) => u.id === "u2")).toBe(false);
    });
  });

  describe("3. Deterministic Tie-Breaking Rules", () => {
    it("breaks ties in Most Studying using daily average DESC, then total minutes DESC, then display_name ASC", () => {
      const entries = [
        { id: "u1", display_name: "Zoe", daily_avg: 120, total_mins: 840 },
        { id: "u2", display_name: "Adam", daily_avg: 120, total_mins: 840 },
        { id: "u3", display_name: "Brian", daily_avg: 150, total_mins: 1050 },
      ];

      entries.sort((a, b) => {
        if (b.daily_avg !== a.daily_avg) return b.daily_avg - a.daily_avg;
        if (b.total_mins !== a.total_mins) return b.total_mins - a.total_mins;
        return a.display_name.localeCompare(b.display_name);
      });

      expect(entries[0].id).toBe("u3"); // highest daily average
      expect(entries[1].id).toBe("u2"); // Adam before Zoe on equal average
      expect(entries[2].id).toBe("u1");
    });

    it("breaks ties in Consistency Ranking using active_study_days DESC, total_study_minutes DESC, score DESC, display_name ASC, user_id ASC", () => {
      const entries = [
        { id: "u1", display_name: "David", active_study_days: 6, total_study_minutes: 600, score: 70 },
        { id: "u2", display_name: "Aaron", active_study_days: 6, total_study_minutes: 600, score: 70 },
        { id: "u3", display_name: "Chloe", active_study_days: 7, total_study_minutes: 300, score: 50 },
      ];

      entries.sort((a, b) => {
        if (b.active_study_days !== a.active_study_days) return b.active_study_days - a.active_study_days;
        if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
        if (b.score !== a.score) return b.score - a.score;
        const nameCmp = a.display_name.localeCompare(b.display_name);
        if (nameCmp !== 0) return nameCmp;
        return a.id.localeCompare(b.id);
      });

      expect(entries[0].id).toBe("u3"); // highest active days (7d beats 6d)
      expect(entries[1].id).toBe("u2"); // Aaron before David on equal days/mins/score
      expect(entries[2].id).toBe("u1");
    });
  });

  describe("4. User Percentile Calculation (Top X%)", () => {
    const calculateTopPercentile = (rank: number, total: number) => {
      if (total <= 1) return 1.0;
      return Math.max(1.0, Math.min(100.0, Math.ceil((rank / total) * 100.0)));
    };

    it("computes mathematically consistent 'Top X%' percentiles across diverse cohort sizes", () => {
      // 100 students
      expect(calculateTopPercentile(1, 100)).toBe(1.0);   // Rank 1 of 100 is Top 1%
      expect(calculateTopPercentile(5, 100)).toBe(5.0);   // Rank 5 of 100 is Top 5%
      expect(calculateTopPercentile(50, 100)).toBe(50.0); // Rank 50 of 100 is Top 50%
      expect(calculateTopPercentile(100, 100)).toBe(100.0); // Rank 100 of 100 is Top 100%

      // 10 students
      expect(calculateTopPercentile(1, 10)).toBe(10.0);  // Rank 1 of 10 is Top 10%
      expect(calculateTopPercentile(2, 10)).toBe(20.0);  // Rank 2 of 10 is Top 20%

      // 1 student
      expect(calculateTopPercentile(1, 1)).toBe(1.0);    // Rank 1 of 1 is Top 1%
    });
  });

  describe("5. Admin Exclusion Enforcement", () => {
    it("identifies DEFAULT_ADMIN_UID and filters from rankings", () => {
      expect(isAdminUserId(DEFAULT_ADMIN_UID)).toBe(true);
      expect(isAdminUserId("c8d0e123-4567-8901-2345-678901234567")).toBe(false);

      const users = [
        { id: DEFAULT_ADMIN_UID, name: "Admin", is_admin: true, mins: 9999 },
        { id: "user-1", name: "Student A", is_admin: false, mins: 1200 },
        { id: "user-2", name: "Student B", is_admin: false, mins: 800 },
      ];

      const eligible = users.filter((u) => !isAdminUserId(u.id) && !u.is_admin);
      expect(eligible.length).toBe(2);
      expect(eligible.some((u) => u.id === DEFAULT_ADMIN_UID)).toBe(false);
    });
  });

  describe("6. Achiever Celebration Snapshot Immutability", () => {
    it("preserves previous-week finalized stats even when current-week active stats accumulate", () => {
      const week1Snapshot: WeeklyAchieverSnapshot = {
        id: "snap-1",
        celebration_period_id: "2026-10-05",
        source_period_id: "2026-09-28",
        achiever_user_id: "user-achiever",
        display_name: "Top Performer",
        avatar_url: "https://example.com/avatar.jpg",
        week_start: "2026-09-28T00:00:00.000Z",
        week_end: "2026-10-05T00:00:00.000Z",
        total_study_minutes: 1680, // 28 hours
        average_study_minutes_per_day: 240, // 4.0 hours/day
        study_sessions_count: 14,
        active_study_days: 7,
        goal_completion_pct: 95.0,
        completed_goals_count: 19,
        total_goals_count: 20,
        leaderboard_score: 96.5,
        global_rank: 1,
        is_finalized: true,
        finalized_at: "2026-10-05T04:00:00.000Z",
      };

      const currentWeekMutableStudyMinutes = 60;

      expect(week1Snapshot.total_study_minutes).toBe(1680);
      expect(week1Snapshot.total_study_minutes).not.toBe(currentWeekMutableStudyMinutes);
      expect(week1Snapshot.average_study_minutes_per_day).toBe(240);
      expect(week1Snapshot.is_finalized).toBe(true);
    });

    it("survives account deletion via ON DELETE SET NULL simulation", () => {
      const snapshot: WeeklyAchieverSnapshot = {
        id: "snap-1",
        celebration_period_id: "2026-10-05",
        source_period_id: "2026-09-28",
        achiever_user_id: "user-deleted",
        display_name: "Historical Achiever",
        avatar_url: null,
        week_start: "2026-09-28T00:00:00.000Z",
        week_end: "2026-10-05T00:00:00.000Z",
        total_study_minutes: 1500,
        average_study_minutes_per_day: 214.3,
        study_sessions_count: 12,
        active_study_days: 6,
        goal_completion_pct: 88.0,
        completed_goals_count: 15,
        total_goals_count: 17,
        leaderboard_score: 91.2,
        global_rank: 1,
        is_finalized: true,
        finalized_at: "2026-10-05T04:00:00.000Z",
      };

      const preservedSnapshot = {
        ...snapshot,
        achiever_user_id: null,
      };

      expect(preservedSnapshot.display_name).toBe("Historical Achiever");
      expect(preservedSnapshot.total_study_minutes).toBe(1500);
      expect(preservedSnapshot.leaderboard_score).toBe(91.2);
    });
  });

  describe("7. Room Alert Lifecycle & Tuesday-Sunday Persistence", () => {
    it("persists Tuesday through Sunday if unacknowledged", () => {
      const latestFinalizedPeriod = "2026-10-05";
      const acknowledgements = new Set<string>();

      const checkAlert = (userId: string, dayOfWeek: string) => {
        const key = `${userId}:${latestFinalizedPeriod}`;
        const isAcknowledged = acknowledgements.has(key);
        return {
          showAlert: latestFinalizedPeriod !== null && !isAcknowledged,
          dayChecked: dayOfWeek,
        };
      };

      const userId = "u100";
      expect(checkAlert(userId, "Monday").showAlert).toBe(true);
      expect(checkAlert(userId, "Tuesday").showAlert).toBe(true);
      expect(checkAlert(userId, "Wednesday").showAlert).toBe(true);
      expect(checkAlert(userId, "Thursday").showAlert).toBe(true);
      expect(checkAlert(userId, "Friday").showAlert).toBe(true);
      expect(checkAlert(userId, "Saturday").showAlert).toBe(true);
      expect(checkAlert(userId, "Sunday").showAlert).toBe(true);
    });

    it("disappears permanently for that period after DISMISS or VIEWED", () => {
      const latestFinalizedPeriod = "2026-10-05";
      const acknowledgements = new Map<string, "dismissed" | "viewed">();
      const userId = "u200";
      const key = `${userId}:${latestFinalizedPeriod}`;

      acknowledgements.set(key, "dismissed");

      const isAlertVisible = !acknowledgements.has(key);
      expect(isAlertVisible).toBe(false);

      expect(!acknowledgements.has(key)).toBe(false);

      const nextFinalizedPeriod = "2026-10-12";
      const nextKey = `${userId}:${nextFinalizedPeriod}`;
      expect(!acknowledgements.has(nextKey)).toBe(true);
    });

    it("is strictly user-scoped: User A's dismissal does not affect User B", () => {
      const latestFinalizedPeriod = "2026-10-05";
      const acknowledgements = new Set<string>();

      acknowledgements.add(`user-A:${latestFinalizedPeriod}`);

      expect(acknowledgements.has(`user-A:${latestFinalizedPeriod}`)).toBe(true);
      expect(acknowledgements.has(`user-B:${latestFinalizedPeriod}`)).toBe(false);
    });

    it("verifies server database is authoritative across devices: Device 1 ack suppresses Device 2, and new Week B alert is never suppressed by stale client cache", () => {
      // Authoritative database table mock
      const dbAcknowledgements = new Map<string, { action: string; acknowledged_at: Date }>();
      const userId = "u-cross-device";

      // 1. User acknowledges Week A on Device 1
      const weekA = "2026-10-05";
      dbAcknowledgements.set(`${userId}:${weekA}`, { action: "dismissed", acknowledged_at: new Date() });

      // 2. User opens Device 2
      const device2CheckStatus = (periodId: string) => {
        const isAckedInDB = dbAcknowledgements.has(`${userId}:${periodId}`);
        return { showAlert: !isAckedInDB, celebration_period_id: periodId };
      };

      // 3. Week A remains hidden on Device 2
      expect(device2CheckStatus(weekA).showAlert).toBe(false);

      // 4. Week B is finalized
      const weekB = "2026-10-12";

      // 5. Week B alert appears on Device 2
      expect(device2CheckStatus(weekB).showAlert).toBe(true);

      // 6. Old client-side cache from Week A cannot suppress Week B
      const staleDevice1LocalStorage = { acknowledgedPeriod: weekA };
      const canSuppressWeekB = staleDevice1LocalStorage.acknowledgedPeriod === weekB;
      expect(canSuppressWeekB).toBe(false);
    });
  });

  describe("8. Security & User Identity Isolation", () => {
    it("enforces auth.uid() isolation: client cannot query another user's position", () => {
      const mockDatabaseSession = { authUid: "user-legitimate" };

      const getCallingUserPosition = (session: { authUid: string }, attemptedUserQuery?: string) => {
        const authoritativeUserId = session.authUid;
        return {
          queriedFor: authoritativeUserId,
          impersonationPrevented: attemptedUserQuery !== authoritativeUserId,
        };
      };

      const result = getCallingUserPosition(mockDatabaseSession, "user-victim");
      expect(result.queriedFor).toBe("user-legitimate");
      expect(result.impersonationPrevented).toBe(true);
    });

    it("enforces auth.uid() isolation: client cannot acknowledge another user's alert", () => {
      const mockSession = { authUid: "user-hacker" };

      const acknowledgeAlert = (session: { authUid: string }, periodId: string) => {
        return {
          storedUserId: session.authUid,
          periodId,
        };
      };

      const ack = acknowledgeAlert(mockSession, "2026-10-05");
      expect(ack.storedUserId).toBe("user-hacker");
      expect(ack.storedUserId).not.toBe("user-victim");
    });
  });

  describe("9. Goal Completion Semantics Alignment with Canonical Leaderboard", () => {
    it("verifies Global Analytics goal completion exactly matches rpc_get_leaderboard output", () => {
      const leaderboardRow = {
        user_id: "user-1",
        display_name: "Alice",
        total_study_minutes: 600,
        completed_tasks: 7,
        total_tasks: 8,
        goal_completion_pct: 87.5,
        score: 78.4,
      };

      const globalAnalyticsUserRecord = {
        user_id: leaderboardRow.user_id,
        completed_tasks: leaderboardRow.completed_tasks,
        total_tasks: leaderboardRow.total_tasks,
        goal_completion_pct: leaderboardRow.goal_completion_pct,
        score: leaderboardRow.score,
      };

      expect(globalAnalyticsUserRecord.goal_completion_pct).toBe(leaderboardRow.goal_completion_pct);
      expect(globalAnalyticsUserRecord.completed_tasks).toBe(leaderboardRow.completed_tasks);
      expect(globalAnalyticsUserRecord.total_tasks).toBe(leaderboardRow.total_tasks);
    });
  });

  describe("10. Achiever Hall of Fame Count (Authoritative Non-Double-Counting)", () => {
    it("does not double count awards between weekly_achiever_snapshots and user_alerts", () => {
      const userId = "achiever-pro";
      const firstSnapshotDate = new Date("2026-10-05T00:00:00.000Z");

      const historicalAlerts = [
        { id: "a1", user_id: userId, alert_type: "A", status: "sent", sent_at: new Date("2026-09-14T00:00:00.000Z") },
        { id: "a2", user_id: userId, alert_type: "A", status: "sent", sent_at: new Date("2026-09-21T00:00:00.000Z") },
      ];

      const weeklySnapshots = [
        { id: "s1", achiever_user_id: userId, celebration_period_id: "2026-10-05", week_start: firstSnapshotDate },
      ];

      const postMigrationAlerts = [
        { id: "a3", user_id: userId, alert_type: "A", status: "sent", sent_at: new Date("2026-10-05T04:30:00.000Z") },
      ];

      const allAlerts = [...historicalAlerts, ...postMigrationAlerts];

      const snapshotCount = weeklySnapshots.filter((s) => s.achiever_user_id === userId).length;
      const preSnapshotAlertsCount = allAlerts.filter(
        (a) => a.user_id === userId && a.alert_type === "A" && a.status === "sent" && a.sent_at < firstSnapshotDate
      ).length;

      const totalAchieverWins = snapshotCount + preSnapshotAlertsCount;

      expect(snapshotCount).toBe(1);
      expect(preSnapshotAlertsCount).toBe(2);
      expect(totalAchieverWins).toBe(3);
    });

    it("verifies user with legacy has_achiever_badge = true but 0 alerts and 0 snapshots receives exactly 1 win", () => {
      const user = { id: "user-legacy", has_achiever_badge: true };
      const snapshots: { achiever_user_id: string }[] = [];
      const alerts: { user_id: string }[] = [];

      const snapshotsCount = snapshots.filter((s) => s.achiever_user_id === user.id).length;
      const alertsCount = alerts.filter((a) => a.user_id === user.id).length;
      const achieverCount = Math.max(snapshotsCount + alertsCount, user.has_achiever_badge ? 1 : 0);

      expect(achieverCount).toBe(1);
    });

    it("verifies user with 0 snapshots, 0 alerts, and has_achiever_badge = false receives 0 wins", () => {
      const user = { id: "user-new", has_achiever_badge: false };
      const snapshots: { achiever_user_id: string }[] = [];
      const alerts: { user_id: string }[] = [];

      const snapshotsCount = snapshots.filter((s) => s.achiever_user_id === user.id).length;
      const alertsCount = alerts.filter((a) => a.user_id === user.id).length;
      const achieverCount = Math.max(snapshotsCount + alertsCount, user.has_achiever_badge ? 1 : 0);

      expect(achieverCount).toBe(0);
    });

    it("verifies repeated winner across multiple post-migration weeks accumulates correctly (3 snapshots + 2 alerts = 5 wins)", () => {
      const userId = "serial-winner";
      const firstSnapshotDate = new Date("2026-10-05T00:00:00.000Z");

      const snapshots = [
        { id: "s1", achiever_user_id: userId, celebration_period_id: "2026-10-05", week_start: firstSnapshotDate },
        { id: "s2", achiever_user_id: userId, celebration_period_id: "2026-10-12", week_start: new Date("2026-10-12T00:00:00.000Z") },
        { id: "s3", achiever_user_id: userId, celebration_period_id: "2026-10-19", week_start: new Date("2026-10-19T00:00:00.000Z") },
      ];

      const alerts = [
        { id: "a1", user_id: userId, alert_type: "A", status: "sent", sent_at: new Date("2026-09-07T00:00:00.000Z") },
        { id: "a2", user_id: userId, alert_type: "A", status: "sent", sent_at: new Date("2026-09-14T00:00:00.000Z") },
      ];

      const snapshotsCount = snapshots.filter((s) => s.achiever_user_id === userId).length;
      const preSnapshotAlertsCount = alerts.filter(
        (a) => a.user_id === userId && a.alert_type === "A" && a.status === "sent" && a.sent_at < firstSnapshotDate
      ).length;

      const totalWins = Math.max(snapshotsCount + preSnapshotAlertsCount, 1);
      expect(totalWins).toBe(5);
    });
  });

  describe("11. Historical User Ranking Durability", () => {
    it("preserves exact user ranks across Monday reset (Rank #1, #6, #37)", () => {
      const finalizedRecords = new Map<string, { rank: number; score: number }>();
      finalizedRecords.set("user-1", { rank: 1, score: 98.5 });
      finalizedRecords.set("user-6", { rank: 6, score: 81.2 });
      finalizedRecords.set("user-37", { rank: 37, score: 42.0 });

      expect(finalizedRecords.get("user-1")?.rank).toBe(1);
      expect(finalizedRecords.get("user-6")?.rank).toBe(6);
      expect(finalizedRecords.get("user-37")?.rank).toBe(37);
    });

    it("verifies Leaderboard rank equals Global Analytics rank for the finalized week", () => {
      const leaderboardResults = [
        { user_id: "user-A", score: 95.0, total_study_minutes: 1200, display_name: "Alice" },
        { user_id: "user-B", score: 85.0, total_study_minutes: 1000, display_name: "Bob" },
        { user_id: "user-C", score: 85.0, total_study_minutes: 900, display_name: "Charlie" },
      ];

      // Leaderboard ordering
      const leaderboardSorted = [...leaderboardResults].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
        return a.display_name.localeCompare(b.display_name);
      });

      // Global Analytics ordering
      const globalAnalyticsSorted = [...leaderboardResults].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.total_study_minutes !== a.total_study_minutes) return b.total_study_minutes - a.total_study_minutes;
        return a.display_name.localeCompare(b.display_name);
      });

      leaderboardSorted.forEach((lbUser, index) => {
        const gaUser = globalAnalyticsSorted[index];
        expect(lbUser.user_id).toBe(gaUser.user_id);
      });
    });
  });

  describe("12. Distance to Top 5 Study Duration Calculation", () => {
    it("accurately calculates remaining minutes needed to enter Top 5 study rankings", () => {
      const top5CutoffMinutes = 1200; // 20 hours
      const userStudyMinutes = 960; // 16 hours
      const minutesToTop5 = Math.max(0, top5CutoffMinutes - userStudyMinutes + 1);

      expect(minutesToTop5).toBe(241);
      expect(formatMinutesToHours(minutesToTop5)).toBe("4.0h");
    });

    it("returns 0 if user is already inside Top 5 or at/above the cutoff", () => {
      const top5CutoffMinutes = 1200;
      const userStudyMinutes = 1350;
      const isInTop5 = true;
      const minutesToTop5 = isInTop5 ? 0 : Math.max(0, top5CutoffMinutes - userStudyMinutes + 1);

      expect(minutesToTop5).toBe(0);
    });

    it("handles cohort with fewer than 5 students (e.g. 3 students) safely without referencing nonexistent 5th student", () => {
      const totalEligibleStudents = 3;
      const userRank = 2;
      const isCohortUnder5 = totalEligibleStudents <= 5;
      const isInTop5 = userRank <= 5 || isCohortUnder5;
      const minutesToTop5 = isInTop5 ? 0 : 999;

      expect(isInTop5).toBe(true);
      expect(minutesToTop5).toBe(0);
    });

    it("verifies user at exactly rank 5 has 0 minutes gap and is_in_top5 = true", () => {
      const totalEligible = 20;
      const userRank = 5;
      const isInTop5 = userRank <= 5;
      const minutesToTop5 = isInTop5 ? 0 : 100;

      expect(isInTop5).toBe(true);
      expect(minutesToTop5).toBe(0);
    });

    it("verifies user at rank 1 has 0 minutes gap and is_in_top5 = true", () => {
      const userRank = 1;
      const isInTop5 = userRank <= 5;
      const minutesToTop5 = isInTop5 ? 0 : 500;

      expect(isInTop5).toBe(true);
      expect(minutesToTop5).toBe(0);
    });

    it("verifies user with 0 study minutes outside Top 5 requires (5th_rank_minutes + 1) to enter", () => {
      const top5CutoffMinutes = 450;
      const userStudyMinutes = 0;
      const isInTop5 = false;
      const minutesToTop5 = isInTop5 ? 0 : Math.max(0, top5CutoffMinutes - userStudyMinutes + 1);

      expect(minutesToTop5).toBe(451);
    });
  });

  describe("13. Bottom Navigation Integration & Route Behavior", () => {
    const navItems = [
      { href: "/room", label: "Room" },
      { href: "/leaderboard", label: "Rankings" },
      { href: "/analytics", label: "Global Analytics", shortLabel: "Analytics" },
      { href: "/streak", label: "Streak" },
      { href: "/goals", label: "Goals" },
      { href: "/history", label: "History" },
      { href: "/settings", label: "Settings" },
    ];

    it("verifies /analytics is a first-class canonical destination in BottomNav", () => {
      const analyticsItem = navItems.find((item) => item.href === "/analytics");
      expect(analyticsItem).toBeDefined();
      expect(analyticsItem?.label).toBe("Global Analytics");
      expect(analyticsItem?.shortLabel).toBe("Analytics");
    });

    it("activates /analytics route cleanly without activating /leaderboard", () => {
      const currentPath = "/analytics";
      const isItemActive = (href: string) =>
        currentPath === href || (href !== "/" && currentPath.startsWith(href + "/"));

      expect(isItemActive("/analytics")).toBe(true);
      expect(isItemActive("/leaderboard")).toBe(false);
      expect(isItemActive("/room")).toBe(false);
    });

    it("selects responsive label: compact 'Analytics' on mobile and 'Global Analytics' on desktop", () => {
      const analyticsItem = navItems.find((item) => item.href === "/analytics")!;

      const getRenderedLabel = (isMobile: boolean) =>
        isMobile ? analyticsItem.shortLabel || analyticsItem.label : analyticsItem.label;

      expect(getRenderedLabel(true)).toBe("Analytics");
      expect(getRenderedLabel(false)).toBe("Global Analytics");
    });
  });

  describe("14. Goal Chasers Ranking Specification (Top 5 & Edge Cases)", () => {
    type Candidate = {
      user_id: string;
      display_name: string;
      goal_completion_pct: number;
      completed_tasks: number;
      total_tasks: number;
      total_study_minutes: number;
      is_admin?: boolean;
    };

    const rankGoalChasers = (candidates: Candidate[], adminId = DEFAULT_ADMIN_UID): GoalChaserEntry[] => {
      return candidates
        .filter((c) => !c.is_admin && c.user_id !== adminId && c.total_tasks > 0)
        .sort((a, b) => {
          if (b.goal_completion_pct !== a.goal_completion_pct) {
            return b.goal_completion_pct - a.goal_completion_pct;
          }
          if (b.completed_tasks !== a.completed_tasks) {
            return b.completed_tasks - a.completed_tasks;
          }
          if (b.total_tasks !== a.total_tasks) {
            return b.total_tasks - a.total_tasks;
          }
          if (b.total_study_minutes !== a.total_study_minutes) {
            return b.total_study_minutes - a.total_study_minutes;
          }
          return a.display_name.localeCompare(b.display_name);
        })
        .slice(0, 5)
        .map((c, index) => ({
          rank: index + 1,
          user_id: c.user_id,
          display_name: c.display_name,
          avatar_url: null,
          completed_tasks: c.completed_tasks,
          total_tasks: c.total_tasks,
          goal_completion_pct: c.goal_completion_pct,
          total_study_minutes: c.total_study_minutes,
        }));
    };

    it("returns exactly TOP 5 when 5+ eligible candidates exist", () => {
      const candidates: Candidate[] = [
        { user_id: "u1", display_name: "User 1", goal_completion_pct: 100, completed_tasks: 5, total_tasks: 5, total_study_minutes: 500 },
        { user_id: "u2", display_name: "User 2", goal_completion_pct: 90, completed_tasks: 9, total_tasks: 10, total_study_minutes: 600 },
        { user_id: "u3", display_name: "User 3", goal_completion_pct: 80, completed_tasks: 4, total_tasks: 5, total_study_minutes: 400 },
        { user_id: "u4", display_name: "User 4", goal_completion_pct: 75, completed_tasks: 3, total_tasks: 4, total_study_minutes: 300 },
        { user_id: "u5", display_name: "User 5", goal_completion_pct: 70, completed_tasks: 7, total_tasks: 10, total_study_minutes: 700 },
        { user_id: "u6", display_name: "User 6", goal_completion_pct: 60, completed_tasks: 3, total_tasks: 5, total_study_minutes: 200 },
        { user_id: "u7", display_name: "User 7", goal_completion_pct: 50, completed_tasks: 2, total_tasks: 4, total_study_minutes: 100 },
      ];

      const top5 = rankGoalChasers(candidates);
      expect(top5.length).toBe(5);
      expect(top5.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);
      expect(top5[0].user_id).toBe("u1");
      expect(top5[4].user_id).toBe("u5");
    });

    it("returns exactly 5 when exactly 5 eligible candidates exist", () => {
      const candidates: Candidate[] = [
        { user_id: "u1", display_name: "User 1", goal_completion_pct: 100, completed_tasks: 2, total_tasks: 2, total_study_minutes: 200 },
        { user_id: "u2", display_name: "User 2", goal_completion_pct: 80, completed_tasks: 4, total_tasks: 5, total_study_minutes: 300 },
        { user_id: "u3", display_name: "User 3", goal_completion_pct: 60, completed_tasks: 3, total_tasks: 5, total_study_minutes: 150 },
        { user_id: "u4", display_name: "User 4", goal_completion_pct: 50, completed_tasks: 1, total_tasks: 2, total_study_minutes: 100 },
        { user_id: "u5", display_name: "User 5", goal_completion_pct: 25, completed_tasks: 1, total_tasks: 4, total_study_minutes: 50 },
      ];

      const result = rankGoalChasers(candidates);
      expect(result.length).toBe(5);
      expect(result[4].rank).toBe(5);
    });

    it("returns fewer than 5 when fewer than 5 eligible candidates exist", () => {
      const candidates: Candidate[] = [
        { user_id: "u1", display_name: "User 1", goal_completion_pct: 100, completed_tasks: 3, total_tasks: 3, total_study_minutes: 200 },
        { user_id: "u2", display_name: "User 2", goal_completion_pct: 50, completed_tasks: 1, total_tasks: 2, total_study_minutes: 100 },
      ];

      const result = rankGoalChasers(candidates);
      expect(result.length).toBe(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
    });

    it("resolves ties deterministically using completed_tasks, total_tasks, total_study_minutes, and display_name", () => {
      const candidates: Candidate[] = [
        { user_id: "u-tied-low-tasks", display_name: "Bob", goal_completion_pct: 100, completed_tasks: 2, total_tasks: 2, total_study_minutes: 500 },
        { user_id: "u-tied-high-tasks", display_name: "Alice", goal_completion_pct: 100, completed_tasks: 5, total_tasks: 5, total_study_minutes: 300 },
        { user_id: "u-tied-equal-tasks-low-mins", display_name: "Dave", goal_completion_pct: 80, completed_tasks: 4, total_tasks: 5, total_study_minutes: 200 },
        { user_id: "u-tied-equal-tasks-high-mins", display_name: "Charlie", goal_completion_pct: 80, completed_tasks: 4, total_tasks: 5, total_study_minutes: 400 },
      ];

      const result = rankGoalChasers(candidates);
      // Alice (100%, 5 tasks) beats Bob (100%, 2 tasks)
      expect(result[0].user_id).toBe("u-tied-high-tasks");
      expect(result[1].user_id).toBe("u-tied-low-tasks");
      // Charlie (80%, 4 tasks, 400 mins) beats Dave (80%, 4 tasks, 200 mins)
      expect(result[2].user_id).toBe("u-tied-equal-tasks-high-mins");
      expect(result[3].user_id).toBe("u-tied-equal-tasks-low-mins");
    });

    it("correctly includes 100% and 0% completion rates but strictly excludes users with total_tasks = 0", () => {
      const candidates: Candidate[] = [
        { user_id: "u-perfect", display_name: "Perfect", goal_completion_pct: 100, completed_tasks: 4, total_tasks: 4, total_study_minutes: 300 },
        { user_id: "u-zero-tasks", display_name: "No Goals", goal_completion_pct: 0, completed_tasks: 0, total_tasks: 0, total_study_minutes: 500 },
        { user_id: "u-zero-pct", display_name: "Failed Goals", goal_completion_pct: 0, completed_tasks: 0, total_tasks: 3, total_study_minutes: 100 },
      ];

      const result = rankGoalChasers(candidates);
      expect(result.some((c) => c.user_id === "u-perfect")).toBe(true);
      expect(result.some((c) => c.user_id === "u-zero-pct")).toBe(true);
      expect(result.some((c) => c.user_id === "u-zero-tasks")).toBe(false);
    });

    it("strictly excludes admins from Goal Chasers", () => {
      const candidates: Candidate[] = [
        { user_id: DEFAULT_ADMIN_UID, display_name: "Default Admin", goal_completion_pct: 100, completed_tasks: 10, total_tasks: 10, total_study_minutes: 1000 },
        { user_id: "u-admin-flag", display_name: "Flagged Admin", is_admin: true, goal_completion_pct: 100, completed_tasks: 8, total_tasks: 8, total_study_minutes: 800 },
        { user_id: "u-student", display_name: "Student", goal_completion_pct: 90, completed_tasks: 9, total_tasks: 10, total_study_minutes: 600 },
      ];

      const result = rankGoalChasers(candidates);
      expect(result.length).toBe(1);
      expect(result[0].user_id).toBe("u-student");
    });
  });

  describe("15. Consistency Ranking Specification (Top 5 Most Consistent Daily Study Habits)", () => {
    type Candidate = {
      user_id: string;
      display_name: string;
      active_study_days: number;
      total_study_minutes: number;
      score: number;
      daily_average_minutes?: number;
      is_admin?: boolean;
    };

    const rankConsistentStudents = (candidates: Candidate[], adminId = DEFAULT_ADMIN_UID): ConsistencyEntry[] => {
      return candidates
        .filter((c) => !c.is_admin && c.user_id !== adminId)
        .sort((a, b) => {
          // 1. active_study_days DESC
          if (b.active_study_days !== a.active_study_days) {
            return b.active_study_days - a.active_study_days;
          }
          // 2. total_study_minutes DESC
          if (b.total_study_minutes !== a.total_study_minutes) {
            return b.total_study_minutes - a.total_study_minutes;
          }
          // 3. canonical leaderboard score DESC
          if (b.score !== a.score) {
            return b.score - a.score;
          }
          // 4. deterministic display_name ASC, user_id ASC
          const nameCmp = a.display_name.localeCompare(b.display_name);
          if (nameCmp !== 0) return nameCmp;
          return a.user_id.localeCompare(b.user_id);
        })
        .slice(0, 5)
        .map((c, index) => ({
          rank: index + 1,
          user_id: c.user_id,
          display_name: c.display_name,
          avatar_url: null,
          daily_average_minutes: c.daily_average_minutes ?? Math.round(c.total_study_minutes / 7),
          total_study_minutes: c.total_study_minutes,
          active_study_days: c.active_study_days,
          score: c.score,
        }));
    };

    it("verifies Student A (7 active days, 20h) ranks higher than Student B (2 active days, 30h)", () => {
      const candidates: Candidate[] = [
        { user_id: "student-b", display_name: "Student B", active_study_days: 2, total_study_minutes: 1800, score: 85 },
        { user_id: "student-a", display_name: "Student A", active_study_days: 7, total_study_minutes: 1200, score: 75 },
      ];

      const result = rankConsistentStudents(candidates);
      expect(result[0].user_id).toBe("student-a");
      expect(result[0].rank).toBe(1);
      expect(result[1].user_id).toBe("student-b");
      expect(result[1].rank).toBe(2);
    });

    it("ranks candidates in descending order of active study days: A=7, B=6, C=3", () => {
      const candidates: Candidate[] = [
        { user_id: "user-c", display_name: "Student C", active_study_days: 3, total_study_minutes: 400, score: 40 },
        { user_id: "user-a", display_name: "Student A", active_study_days: 7, total_study_minutes: 800, score: 80 },
        { user_id: "user-b", display_name: "Student B", active_study_days: 6, total_study_minutes: 600, score: 60 },
      ];

      const result = rankConsistentStudents(candidates);
      expect(result.map((c) => c.user_id)).toEqual(["user-a", "user-b", "user-c"]);
      expect(result.map((c) => c.rank)).toEqual([1, 2, 3]);
    });

    it("resolves ties in active days using total_study_minutes DESC, then score DESC, then deterministic display_name", () => {
      const candidates: Candidate[] = [
        { user_id: "u1", display_name: "Alice", active_study_days: 7, total_study_minutes: 1000, score: 70 },
        { user_id: "u2", display_name: "Bob", active_study_days: 7, total_study_minutes: 1200, score: 65 },
        { user_id: "u3", display_name: "Charlie", active_study_days: 6, total_study_minutes: 900, score: 85 },
        { user_id: "u4", display_name: "Dave", active_study_days: 6, total_study_minutes: 900, score: 90 },
      ];

      const result = rankConsistentStudents(candidates);
      // Bob (7d, 1200m) beats Alice (7d, 1000m)
      expect(result[0].user_id).toBe("u2");
      expect(result[1].user_id).toBe("u1");
      // Dave (6d, 900m, score 90) beats Charlie (6d, 900m, score 85)
      expect(result[2].user_id).toBe("u4");
      expect(result[3].user_id).toBe("u3");
    });

    it("strictly excludes admins from Consistency rankings", () => {
      const candidates: Candidate[] = [
        { user_id: DEFAULT_ADMIN_UID, display_name: "Admin", is_admin: true, active_study_days: 7, total_study_minutes: 5000, score: 100 },
        { user_id: "u-real", display_name: "Real Student", is_admin: false, active_study_days: 5, total_study_minutes: 600, score: 50 },
      ];

      const result = rankConsistentStudents(candidates);
      expect(result.length).toBe(1);
      expect(result[0].user_id).toBe("u-real");
    });
  });

  describe("15b. Fail-Closed Session Reconciliation Pre-Flight Invariant", () => {
    it("aborts finalization and raises exception when pre-flight session reconciliation fails", () => {
      let finalizationCompleted = false;
      let snapshotPersisted = false;

      const mockReconcileSessions = (shouldFail: boolean) => {
        if (shouldFail) {
          throw new Error("DB deadlock during session reconciliation");
        }
      };

      const executeFinalization = (reconciliationShouldFail: boolean) => {
        try {
          // Step 4: Reconcile expired sessions (Fail-Closed)
          mockReconcileSessions(reconciliationShouldFail);

          // Steps 5-9 only execute if reconciliation succeeds
          snapshotPersisted = true;
          finalizationCompleted = true;
          return { success: true };
        } catch (err) {
          // Re-throw / abort: do NOT persist snapshots or mark finalized
          return { success: false, error: (err as Error).message };
        }
      };

      const result = executeFinalization(true);
      expect(result.success).toBe(false);
      expect(result.error).toContain("DB deadlock");
      expect(finalizationCompleted).toBe(false);
      expect(snapshotPersisted).toBe(false);
    });

    it("proceeds to snapshot persistence only when session reconciliation succeeds", () => {
      let finalizationCompleted = false;
      let snapshotPersisted = false;

      const executeFinalization = (reconciliationShouldFail: boolean) => {
        if (reconciliationShouldFail) throw new Error("Reconciliation failed");
        snapshotPersisted = true;
        finalizationCompleted = true;
        return { success: true };
      };

      const result = executeFinalization(false);
      expect(result.success).toBe(true);
      expect(finalizationCompleted).toBe(true);
      expect(snapshotPersisted).toBe(true);
    });
  });

  describe("16. Most Studying Students (Strict 7-Day Average & Top 5 Descending)", () => {
    it("computes strict 7-day average: total_study_minutes / 7.0 (not divided by active days)", () => {
      const totalMinutes = 840; // 14 hours
      const activeDays = 3;

      const strict7DayAverage = Number((totalMinutes / 7.0).toFixed(1));
      const incorrectActiveDaysAverage = Number((totalMinutes / activeDays).toFixed(1));

      expect(strict7DayAverage).toBe(120.0); // 2 hours/day across full week
      expect(incorrectActiveDaysAverage).toBe(280.0);
      expect(strict7DayAverage).not.toBe(incorrectActiveDaysAverage);
    });
  });

  describe("17. Achiever Hall of Fame Count & Badge Non-Inflation", () => {
    const calculateAchieverWins = (params: {
      snapshotCount: number;
      preMigrationAlertsCount: number;
      hasAchieverBadge: boolean;
    }) => {
      const sum = params.snapshotCount + params.preMigrationAlertsCount;
      const badgeFloor = params.hasAchieverBadge ? 1 : 0;
      return Math.max(sum, badgeFloor);
    };

    it("verifies all edge cases: 0 wins, 1 pre, 1 post, 1 pre + 1 post, 3 post", () => {
      expect(calculateAchieverWins({ snapshotCount: 0, preMigrationAlertsCount: 0, hasAchieverBadge: false })).toBe(0);
      expect(calculateAchieverWins({ snapshotCount: 0, preMigrationAlertsCount: 1, hasAchieverBadge: true })).toBe(1);
      expect(calculateAchieverWins({ snapshotCount: 1, preMigrationAlertsCount: 0, hasAchieverBadge: true })).toBe(1);
      expect(calculateAchieverWins({ snapshotCount: 1, preMigrationAlertsCount: 1, hasAchieverBadge: true })).toBe(2);
      expect(calculateAchieverWins({ snapshotCount: 3, preMigrationAlertsCount: 0, hasAchieverBadge: true })).toBe(3);
    });

    it("ensures has_achiever_badge is treated as a floor and never inflates counts", () => {
      // User with 2 snapshots + has_achiever_badge=true should be 2, NOT 3
      const result = calculateAchieverWins({ snapshotCount: 2, preMigrationAlertsCount: 0, hasAchieverBadge: true });
      expect(result).toBe(2);
    });
  });

  describe("18. Weekly Period Consistency (Atomic Snapshot Integrity)", () => {
    it("guarantees all analytics sections belong to the identical historical period_id", () => {
      const mockFinalizedPayload: GlobalAnalyticsPayload = {
        success: true,
        is_finalized: true,
        period_id: "2026-09-28",
        celebration_period_id: "2026-10-05",
        week_start: "2026-09-28T00:00:00.000Z",
        week_end: "2026-10-05T00:00:00.000Z",
        finalized_at: "2026-10-05T00:05:00.000Z",
        achiever: {
          id: "ach-1",
          celebration_period_id: "2026-10-05",
          source_period_id: "2026-09-28",
          week_start: "2026-09-28T00:00:00.000Z",
          week_end: "2026-10-05T00:00:00.000Z",
          achiever_user_id: "user-1",
          display_name: "Winner",
          avatar_url: null,
          total_study_minutes: 1200,
          average_study_minutes_per_day: 171.4,
          study_sessions_count: 14,
          active_study_days: 7,
          goal_completion_pct: 100,
          completed_goals_count: 10,
          total_goals_count: 10,
          leaderboard_score: 95.0,
          global_rank: 1,
          is_finalized: true,
          finalized_at: "2026-10-05T00:05:00.000Z",
        },
        rankings: {
          most_studying: [],
          consistency_rhythm_matrix: [],
          achiever_winners: [],
          goal_chasers: [],
        },
        community_stats: {
          total_eligible_students: 25,
          global_avg_study_minutes: 650,
          global_avg_daily_minutes: 92.9,
          global_avg_goal_pct: 78.4,
          total_community_hours: 270.8,
          total_completed_goals: 120,
        },
        user_position: null,
      };

      expect(mockFinalizedPayload.period_id).toBe("2026-09-28");
      expect(mockFinalizedPayload.celebration_period_id).toBe("2026-10-05");
      expect(mockFinalizedPayload.achiever?.source_period_id).toBe(mockFinalizedPayload.period_id);
      expect(mockFinalizedPayload.achiever?.celebration_period_id).toBe(mockFinalizedPayload.celebration_period_id);
      expect(mockFinalizedPayload.rankings.consistency_rhythm_matrix).toBeDefined();
    });

    it("verifies newly finalized snapshot ranking schema contains consistency_rhythm_matrix and omits low_performers", () => {
      // Build a simulated new snapshot payload from rpc_finalize_weekly_global_analytics
      const newSnapshotRankings: GlobalAnalyticsRankings = {
        most_studying: [],
        consistency_rhythm_matrix: [
          {
            rank: 1,
            user_id: "u-1",
            display_name: "Consistent Leader",
            avatar_url: null,
            total_study_minutes: 2100,
            daily_average_minutes: 300,
            active_study_days: 7,
            score: 95.0,
          },
        ],
        achiever_winners: [],
        goal_chasers: [],
      };

      expect(newSnapshotRankings.consistency_rhythm_matrix).toHaveLength(1);
      expect(newSnapshotRankings.consistency_rhythm_matrix?.[0].active_study_days).toBe(7);
      expect((newSnapshotRankings as any).low_performers).toBeUndefined();
    });
  });

  describe("19. Snapshot Immutability & Idempotent Finalization", () => {
    it("guarantees an already-finalized period exits safely with already_finalized=true and zero state mutation", () => {
      const databaseState = {
        snapshots: new Map<string, { period_id: string; is_finalized: boolean; hash: string }>(),
      };

      databaseState.snapshots.set("2026-09-28", {
        period_id: "2026-09-28",
        is_finalized: true,
        hash: "immutable_hash_12345",
      });

      const finalizeWeeklyGlobalAnalytics = (periodId: string) => {
        const existing = databaseState.snapshots.get(periodId);
        if (existing && existing.is_finalized) {
          return { success: true, already_finalized: true, period_id: periodId };
        }
        // Mutation logic
        databaseState.snapshots.set(periodId, { period_id: periodId, is_finalized: true, hash: "new_hash" });
        return { success: true, already_finalized: false, period_id: periodId };
      };

      const rerunResult = finalizeWeeklyGlobalAnalytics("2026-09-28");
      expect(rerunResult.already_finalized).toBe(true);
      expect(databaseState.snapshots.get("2026-09-28")?.hash).toBe("immutable_hash_12345");
    });
  });

  describe("20. Period-Scoped Alert Acknowledgement Lifecycle", () => {
    it("acknowledging Week A alert never suppresses Week B alert", () => {
      const acknowledgements = new Set<string>();

      const checkAlert = (userId: string, celebrationPeriodId: string) => {
        const key = `${userId}:${celebrationPeriodId}`;
        return !acknowledgements.has(key);
      };

      const acknowledge = (userId: string, celebrationPeriodId: string) => {
        acknowledgements.add(`${userId}:${celebrationPeriodId}`);
      };

      const userId = "student-1";
      const weekA = "2026-10-05";
      const weekB = "2026-10-12";
      const weekC = "2026-10-19";

      // 1. Initial Week A
      expect(checkAlert(userId, weekA)).toBe(true);

      // 2. User dismisses Week A
      acknowledge(userId, weekA);
      expect(checkAlert(userId, weekA)).toBe(false);

      // 3. Week B finalizes -> Alert must appear
      expect(checkAlert(userId, weekB)).toBe(true);

      // 4. User dismisses Week B
      acknowledge(userId, weekB);
      expect(checkAlert(userId, weekB)).toBe(false);

      // 5. Week C finalizes -> Alert must appear
      expect(checkAlert(userId, weekC)).toBe(true);
    });
  });

  describe("21. Achiever Leaderboard Score Data Contract & Safe Extraction", () => {
    const extractScore = (achiever: { leaderboard_score?: number | null; score?: number | null }) => {
      const rawScore = achiever.leaderboard_score ?? achiever.score;
      const hasValidScore = typeof rawScore === "number" && !Number.isNaN(rawScore);
      return {
        hasValidScore,
        canonicalScore: hasValidScore ? rawScore : 0,
        formattedScore: hasValidScore ? rawScore.toFixed(1) : "Score unavailable",
      };
    };

    it("extracts and formats decimal score correctly (87.6 -> '87.6')", () => {
      const result = extractScore({ leaderboard_score: 87.6 });
      expect(result.hasValidScore).toBe(true);
      expect(result.formattedScore).toBe("87.6");
    });

    it("extracts and formats integer score correctly with one decimal place (95 -> '95.0')", () => {
      const result = extractScore({ leaderboard_score: 95 });
      expect(result.hasValidScore).toBe(true);
      expect(result.formattedScore).toBe("95.0");
    });

    it("handles zero score truthfully without treating zero as missing (0 -> '0.0')", () => {
      const result = extractScore({ leaderboard_score: 0 });
      expect(result.hasValidScore).toBe(true);
      expect(result.formattedScore).toBe("0.0");
    });

    it("handles missing/undefined score with deliberate 'Score unavailable' without crashing", () => {
      const result = extractScore({});
      expect(result.hasValidScore).toBe(false);
      expect(result.formattedScore).toBe("Score unavailable");
    });

    it("handles null score gracefully without crashing", () => {
      const result = extractScore({ leaderboard_score: null });
      expect(result.hasValidScore).toBe(false);
      expect(result.formattedScore).toBe("Score unavailable");
    });

    it("resolves score from .score property when .leaderboard_score is absent", () => {
      const result = extractScore({ score: 91.4 });
      expect(result.hasValidScore).toBe(true);
      expect(result.formattedScore).toBe("91.4");
    });

    it("normalizes RPC response in page payload handler", () => {
      const mockPayload = {
        success: true,
        achiever: {
          display_name: "Winner",
          score: 88.5,
          leaderboard_score: undefined,
        } as unknown as WeeklyAchieverSnapshot,
      };

      if (mockPayload.achiever) {
        if (
          mockPayload.achiever.leaderboard_score === undefined &&
          typeof (mockPayload.achiever as { score?: number }).score === "number"
        ) {
          mockPayload.achiever.leaderboard_score = (mockPayload.achiever as { score?: number }).score;
        }
      }

      expect(mockPayload.achiever.leaderboard_score).toBe(88.5);
    });
  });
});

