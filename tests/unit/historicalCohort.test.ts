import { describe, it, expect } from "vitest";
import {
  getHistoricalPeriodBounds,
  isEligibleHistoricalMember,
  getEligibleMembersForAnalyticsPeriod,
  computeCohortNormalizers,
  calculateCompositeScore,
  calculateHistoricalCommunityStats,
  calculateHistoricalStudyRanking,
  calculateHistoricalGoalRanking,
  calculateHistoricalAchieverRanking,
  UserWeeklyRawMetrics,
} from "@/lib/analytics/cohort";
import { calculateConsistencyRanking } from "@/lib/analytics/consistency";

describe("StudyRoom Global Analytics — Historical Cohort Isolation Audit Suite", () => {
  const HISTORICAL_WEEK = "2026-09-28"; // Mon 2026-09-28 to Sun 2026-10-04 in Asia/Kolkata
  const TZ = "Asia/Kolkata";

  describe("1. Period Bounds and Sunday Cutoff Determination", () => {
    it("derives exact week start, week end, and Sunday 23:59:59.999 cutoff in Asia/Kolkata", () => {
      const bounds = getHistoricalPeriodBounds(HISTORICAL_WEEK, TZ);
      
      // In Asia/Kolkata (+05:30), 2026-09-28 00:00:00 IST = 2026-09-27 18:30:00 UTC
      expect(bounds.weekStart.toISOString()).toBe("2026-09-27T18:30:00.000Z");
      // Week end is exactly 7 days later: 2026-10-05 00:00:00 IST = 2026-10-04 18:30:00 UTC
      expect(bounds.weekEnd.toISOString()).toBe("2026-10-04T18:30:00.000Z");
      // Sunday cutoff is 1ms before weekEnd (2026-10-04 23:59:59.999 IST = 2026-10-04 18:29:59.999 UTC)
      expect(bounds.sundayCutoff.toISOString()).toBe("2026-10-04T18:29:59.999Z");
    });
  });

  describe("2. TEST A — User Joins After Historical Sunday", () => {
    it("strictly includes users created before/on Sunday and excludes users created on Monday or later", () => {
      const bounds = getHistoricalPeriodBounds(HISTORICAL_WEEK, TZ);

      const userA = { id: "u-a", display_name: "Alice", created_at: "2026-09-25T10:00:00.000Z" }; // Joined before
      const userB = { id: "u-b", display_name: "Bob", created_at: "2026-10-04T18:29:00.000Z" }; // Joined Sunday 23:59 IST
      const userC = { id: "u-c", display_name: "Charlie", created_at: "2026-10-04T18:30:00.000Z" }; // Joined Monday 00:00 IST
      const userD = { id: "u-d", display_name: "David", created_at: "2026-10-05T12:00:00.000Z" }; // Joined Monday noon IST

      expect(isEligibleHistoricalMember(userA, bounds)).toBe(true);
      expect(isEligibleHistoricalMember(userB, bounds)).toBe(true);
      expect(isEligibleHistoricalMember(userC, bounds)).toBe(false);
      expect(isEligibleHistoricalMember(userD, bounds)).toBe(false);

      const cohort = getEligibleMembersForAnalyticsPeriod([userA, userB, userC, userD], HISTORICAL_WEEK, TZ, { isHistorical: true });
      expect(cohort.map((u) => u.id)).toEqual(["u-a", "u-b"]);
    });

    it("excludes platform administrators regardless of join date", () => {
      const bounds = getHistoricalPeriodBounds(HISTORICAL_WEEK, TZ);
      const adminUser = { id: "admin-1", display_name: "Admin", is_admin: true, created_at: "2026-09-01T00:00:00.000Z" };
      const defaultAdmin = { id: "8076296e-134a-4036-b8ed-1a9c6ff26ec1", display_name: "sa", created_at: "2026-09-01T00:00:00.000Z" };

      expect(isEligibleHistoricalMember(adminUser, bounds)).toBe(false);
      expect(isEligibleHistoricalMember(defaultAdmin, bounds)).toBe(false);
    });
  });

  describe("3. TEST B — Current User Count Increase (7 historical vs 10 current)", () => {
    it("preserves historical cohort size of 7 even when 3 new students register on Monday/Tuesday", () => {
      // Real historical 7 students from production
      const historicalStudents: UserWeeklyRawMetrics[] = [
        { id: "1", display_name: "Ritesh", created_at: "2026-09-01T14:23:37Z", total_study_minutes: 2374, completed_tasks: 28, total_tasks: 30, active_study_days: 7 },
        { id: "2", display_name: "Tung Tung", created_at: "2026-09-03T13:50:35Z", total_study_minutes: 2290, completed_tasks: 27, total_tasks: 30, active_study_days: 7 },
        { id: "3", display_name: "Aditya", created_at: "2026-09-06T14:12:31Z", total_study_minutes: 1922, completed_tasks: 15, total_tasks: 17, active_study_days: 6 },
        { id: "4", display_name: "Pallavi", created_at: "2026-09-01T17:31:49Z", total_study_minutes: 1186, completed_tasks: 13, total_tasks: 14, active_study_days: 7 },
        { id: "5", display_name: "Subodh", created_at: "2026-09-01T14:04:15Z", total_study_minutes: 1481, completed_tasks: 10, total_tasks: 14, active_study_days: 6 },
        { id: "6", display_name: "Raunak", created_at: "2026-09-01T15:01:16Z", total_study_minutes: 1374, completed_tasks: 5, total_tasks: 8, active_study_days: 6 },
        { id: "7", display_name: "Anindita", created_at: "2026-09-25T15:32:17Z", total_study_minutes: 910, completed_tasks: 0, total_tasks: 3, active_study_days: 3 },
      ];

      // 3 new students join after Sunday
      const newJoiners: UserWeeklyRawMetrics[] = [
        { id: "8", display_name: "NewStudent1", created_at: "2026-10-05T02:00:00Z", total_study_minutes: 500, completed_tasks: 5, total_tasks: 5, active_study_days: 1 },
        { id: "9", display_name: "NewStudent2", created_at: "2026-10-05T08:00:00Z", total_study_minutes: 300, completed_tasks: 3, total_tasks: 3, active_study_days: 1 },
        { id: "10", display_name: "NewStudent3", created_at: "2026-10-06T10:00:00Z", total_study_minutes: 100, completed_tasks: 1, total_tasks: 1, active_study_days: 1 },
      ];

      const currentAllUsers = [...historicalStudents, ...newJoiners];
      expect(currentAllUsers.length).toBe(10);

      const filteredHistorical = getEligibleMembersForAnalyticsPeriod(currentAllUsers, HISTORICAL_WEEK, TZ, { isHistorical: true });
      expect(filteredHistorical.length).toBe(7);
      expect(filteredHistorical.map((u) => u.display_name)).toEqual(historicalStudents.map((u) => u.display_name));

      const stats = calculateHistoricalCommunityStats(filteredHistorical);
      expect(stats.total_eligible_students).toBe(7);
    });
  });

  describe("3. TEST C — New User Has Massive Study Time", () => {
    it("proves a post-Sunday user with 5,000 minutes CANNOT enter the historical Study Top 5", () => {
      const historicalStudents: UserWeeklyRawMetrics[] = [
        { id: "1", display_name: "Ritesh", created_at: "2026-09-01T14:23:37Z", total_study_minutes: 2374, completed_tasks: 28, total_tasks: 30, active_study_days: 7 },
        { id: "2", display_name: "Tung Tung", created_at: "2026-09-03T13:50:35Z", total_study_minutes: 2290, completed_tasks: 27, total_tasks: 30, active_study_days: 7 },
        { id: "3", display_name: "Aditya", created_at: "2026-09-06T14:12:31Z", total_study_minutes: 1922, completed_tasks: 15, total_tasks: 17, active_study_days: 6 },
        { id: "4", display_name: "Subodh", created_at: "2026-09-01T14:04:15Z", total_study_minutes: 1481, completed_tasks: 10, total_tasks: 14, active_study_days: 6 },
        { id: "5", display_name: "Raunak", created_at: "2026-09-01T15:01:16Z", total_study_minutes: 1374, completed_tasks: 5, total_tasks: 8, active_study_days: 6 },
      ];

      const postSundaySuperUser: UserWeeklyRawMetrics = {
        id: "post-1",
        display_name: "SuperStudier",
        created_at: "2026-10-05T01:00:00Z",
        total_study_minutes: 5000,
        completed_tasks: 20,
        total_tasks: 20,
        active_study_days: 7,
      };

      const mixed = [...historicalStudents, postSundaySuperUser];
      const eligible = getEligibleMembersForAnalyticsPeriod(mixed, HISTORICAL_WEEK, TZ, { isHistorical: true });
      const studyTop5 = calculateHistoricalStudyRanking(eligible, 5);

      expect(studyTop5.length).toBe(5);
      expect(studyTop5.find((u) => u.user_id === "post-1")).toBeUndefined();
      expect(studyTop5[0].display_name).toBe("Ritesh");
      expect(studyTop5[1].display_name).toBe("Tung Tung");
      expect(studyTop5[2].display_name).toBe("Aditya");
      expect(studyTop5[3].display_name).toBe("Subodh");
      expect(studyTop5[4].display_name).toBe("Raunak");
    });
  });

  describe("4. TEST D — New User Cannot Dilute or Alter Normalization", () => {
    it("proves post-Sunday member with 10,000 minutes leaves historical scores 100% unchanged", () => {
      const historicalStudents: UserWeeklyRawMetrics[] = [
        { id: "1", display_name: "Alice", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 2000, completed_tasks: 10, total_tasks: 10, active_study_days: 7 },
        { id: "2", display_name: "Bob", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 1000, completed_tasks: 5, total_tasks: 10, active_study_days: 5 },
      ];

      const normalizersBefore = computeCohortNormalizers(historicalStudents);
      const scoreAliceBefore = calculateCompositeScore(historicalStudents[0], normalizersBefore);
      const scoreBobBefore = calculateCompositeScore(historicalStudents[1], normalizersBefore);

      // Now simulate a post-Sunday user joining with 10,000 minutes
      const postSundayMegaUser: UserWeeklyRawMetrics = {
        id: "post-mega",
        display_name: "MegaUser",
        created_at: "2026-10-05T10:00:00Z",
        total_study_minutes: 10000,
        completed_tasks: 50,
        total_tasks: 50,
        active_study_days: 7,
      };

      // When filtered through authoritative cohort selector:
      const isolatedCohort = getEligibleMembersForAnalyticsPeriod(
        [...historicalStudents, postSundayMegaUser],
        HISTORICAL_WEEK,
        TZ,
        { isHistorical: true }
      );
      const normalizersAfter = computeCohortNormalizers(isolatedCohort);
      const scoreAliceAfter = calculateCompositeScore(isolatedCohort[0], normalizersAfter);
      const scoreBobAfter = calculateCompositeScore(isolatedCohort[1], normalizersAfter);

      expect(normalizersAfter.maxStudyMinutes).toBe(normalizersBefore.maxStudyMinutes);
      expect(normalizersAfter.targetCompletedTasks).toBe(normalizersBefore.targetCompletedTasks);
      expect(scoreAliceAfter).toBe(scoreAliceBefore);
      expect(scoreBobAfter).toBe(scoreBobBefore);
    });
  });

  describe("5. TEST E & F — New User Cannot Alter Consistency or Goals", () => {
    it("prevents post-Sunday joiner from altering historical Consistency ranking", () => {
      const historicalStudents: UserWeeklyRawMetrics[] = [
        { id: "1", display_name: "Ritesh", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 2374, completed_tasks: 28, total_tasks: 30, active_study_days: 7, score: 99.2 },
        { id: "2", display_name: "Tung Tung", created_at: "2026-09-03T00:00:00Z", total_study_minutes: 2290, completed_tasks: 27, total_tasks: 30, active_study_days: 7, score: 97.0 },
        { id: "3", display_name: "Pallavi", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 1186, completed_tasks: 13, total_tasks: 14, active_study_days: 7, score: 71.7 },
        { id: "4", display_name: "Aditya", created_at: "2026-09-06T00:00:00Z", total_study_minutes: 1922, completed_tasks: 15, total_tasks: 17, active_study_days: 6, score: 86.2 },
        { id: "5", display_name: "Subodh", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 1481, completed_tasks: 10, total_tasks: 14, active_study_days: 6, score: 68.9 },
      ];

      const postSundayConsistencyMaster: UserWeeklyRawMetrics = {
        id: "post-c",
        display_name: "ConsistencyRobot",
        created_at: "2026-10-05T00:01:00Z",
        total_study_minutes: 4000,
        completed_tasks: 40,
        total_tasks: 40,
        active_study_days: 7,
        score: 100,
      };

      const isolated = getEligibleMembersForAnalyticsPeriod(
        [...historicalStudents, postSundayConsistencyMaster],
        HISTORICAL_WEEK,
        TZ,
        { isHistorical: true }
      );
      const consistencyRanking = calculateConsistencyRanking(
        isolated.map((u) => ({
          user_id: u.id,
          display_name: u.display_name,
          active_study_days: u.active_study_days,
          total_study_minutes: u.total_study_minutes,
          score: u.score,
        }))
      );

      expect(consistencyRanking.length).toBe(5);
      expect(consistencyRanking.map((c) => c.display_name)).toEqual([
        "Ritesh",
        "Tung Tung",
        "Pallavi",
        "Aditya",
        "Subodh",
      ]);
    });

    it("prevents post-Sunday joiner from altering historical Goal rankings", () => {
      const historicalStudents: UserWeeklyRawMetrics[] = [
        { id: "1", display_name: "Ritesh", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 2374, completed_tasks: 28, total_tasks: 30, active_study_days: 7 },
        { id: "2", display_name: "Pallavi", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 1186, completed_tasks: 13, total_tasks: 14, active_study_days: 7 },
        { id: "3", display_name: "Tung Tung", created_at: "2026-09-03T00:00:00Z", total_study_minutes: 2290, completed_tasks: 27, total_tasks: 30, active_study_days: 7 },
        { id: "4", display_name: "Aditya", created_at: "2026-09-06T00:00:00Z", total_study_minutes: 1922, completed_tasks: 15, total_tasks: 17, active_study_days: 6 },
        { id: "5", display_name: "Subodh", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 1481, completed_tasks: 10, total_tasks: 14, active_study_days: 6 },
      ];

      const postSundayGoalMaster: UserWeeklyRawMetrics = {
        id: "post-g",
        display_name: "PerfectGoals",
        created_at: "2026-10-05T00:05:00Z",
        total_study_minutes: 500,
        completed_tasks: 100,
        total_tasks: 100, // 100%
        active_study_days: 2,
      };

      const isolated = getEligibleMembersForAnalyticsPeriod(
        [...historicalStudents, postSundayGoalMaster],
        HISTORICAL_WEEK,
        TZ,
        { isHistorical: true }
      );
      const goalRanking = calculateHistoricalGoalRanking(isolated, 5);

      expect(goalRanking.length).toBe(5);
      expect(goalRanking.map((g) => g.display_name)).toEqual([
        "Ritesh",
        "Pallavi",
        "Tung Tung",
        "Aditya",
        "Subodh",
      ]);
    });
  });

  describe("6. TEST G & H — Deactivation Immunity and Calculation Repeatability", () => {
    it("ensures historical students who existed on Sunday remain preserved in historical calculation", () => {
      const student1: UserWeeklyRawMetrics = { id: "1", display_name: "ActiveStudent", created_at: "2026-09-01T00:00:00Z", total_study_minutes: 1000, completed_tasks: 5, total_tasks: 5, active_study_days: 5 };
      const student2: UserWeeklyRawMetrics = { id: "2", display_name: "PastStudent", created_at: "2026-09-15T00:00:00Z", total_study_minutes: 800, completed_tasks: 4, total_tasks: 4, active_study_days: 4 };

      const cohort = getEligibleMembersForAnalyticsPeriod([student1, student2], HISTORICAL_WEEK, TZ, { isHistorical: true });
      expect(cohort.length).toBe(2);
      expect(cohort.map((u) => u.id)).toContain("2");
    });

    it("demonstrates strict historical calculation repeatability before and after future user additions", () => {
      const baseCohort: UserWeeklyRawMetrics[] = [
        { id: "1", display_name: "Ritesh", created_at: "2026-09-01T14:23:37Z", total_study_minutes: 2374, completed_tasks: 28, total_tasks: 30, active_study_days: 7 },
        { id: "2", display_name: "Tung Tung", created_at: "2026-09-03T13:50:35Z", total_study_minutes: 2290, completed_tasks: 27, total_tasks: 30, active_study_days: 7 },
        { id: "3", display_name: "Aditya", created_at: "2026-09-06T14:12:31Z", total_study_minutes: 1922, completed_tasks: 15, total_tasks: 17, active_study_days: 6 },
        { id: "4", display_name: "Pallavi", created_at: "2026-09-01T17:31:49Z", total_study_minutes: 1186, completed_tasks: 13, total_tasks: 14, active_study_days: 7 },
        { id: "5", display_name: "Subodh", created_at: "2026-09-01T14:04:15Z", total_study_minutes: 1481, completed_tasks: 10, total_tasks: 14, active_study_days: 6 },
      ];

      // Run 1: Base historical cohort
      const res1Study = calculateHistoricalStudyRanking(baseCohort, 5);
      const res1Achiever = calculateHistoricalAchieverRanking(baseCohort, 5);
      const res1Stats = calculateHistoricalCommunityStats(baseCohort);

      // Simulate 5 new users joining in the following week
      const futureUsers: UserWeeklyRawMetrics[] = Array.from({ length: 5 }, (_, i) => ({
        id: `future-${i}`,
        display_name: `FutureUser${i}`,
        created_at: `2026-10-0${5 + i}T00:00:00Z`,
        total_study_minutes: 3000 + i * 500,
        completed_tasks: 20,
        total_tasks: 20,
        active_study_days: 7,
      }));

      // Run 2: Filtered historical cohort from expanded population
      const filteredCohort = getEligibleMembersForAnalyticsPeriod(
        [...baseCohort, ...futureUsers],
        HISTORICAL_WEEK,
        TZ,
        { isHistorical: true }
      );
      const res2Study = calculateHistoricalStudyRanking(filteredCohort, 5);
      const res2Achiever = calculateHistoricalAchieverRanking(filteredCohort, 5);
      const res2Stats = calculateHistoricalCommunityStats(filteredCohort);

      // Must be 100% bit-for-bit identical
      expect(res2Study).toEqual(res1Study);
      expect(res2Achiever).toEqual(res1Achiever);
      expect(res2Stats).toEqual(res1Stats);
    });
  });
});
