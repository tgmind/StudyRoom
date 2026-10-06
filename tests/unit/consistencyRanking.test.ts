import { describe, it, expect } from "vitest";
import {
  calculateConsistencyRanking,
  compareConsistencyCandidates,
  ConsistencyCandidate,
} from "@/lib/analytics/consistency";

describe("StudyRoom Consistency Ranking Canonical Engine", () => {
  describe("1. Real-World Screenshot Bug Reproduction & Regression Fix", () => {
    it("correctly ranks Pallavi #1 and Anindita #5 using the exact real-world user dataset", () => {
      // The 5 students from the reported production bug screenshot:
      const productionCandidates: ConsistencyCandidate[] = [
        {
          user_id: "u-anindita",
          display_name: "Anindita Debnath",
          active_study_days: 3,
          total_study_minutes: 1008, // 16.8h
          daily_average_minutes: 144, // 2.4h/day
          score: 65,
        },
        {
          user_id: "u-pallavi",
          display_name: "Pallavi",
          active_study_days: 7,
          total_study_minutes: 1188, // 19.8h
          daily_average_minutes: 169.7, // 2.8h/day
          score: 85,
        },
        {
          user_id: "u-raunak",
          display_name: "Raunak",
          active_study_days: 6,
          total_study_minutes: 1374, // 22.9h
          daily_average_minutes: 196.3, // 3.3h/day
          score: 72,
        },
        {
          user_id: "u-subodh",
          display_name: "Subodh",
          active_study_days: 6,
          total_study_minutes: 1536, // 25.6h
          daily_average_minutes: 219.4, // 3.7h/day
          score: 78,
        },
        {
          user_id: "u-aditya",
          display_name: "Aditya",
          active_study_days: 6,
          total_study_minutes: 1920, // 32.0h
          daily_average_minutes: 274.3, // 4.6h/day
          score: 88,
        },
      ];

      const ranked = calculateConsistencyRanking(productionCandidates, 5);

      expect(ranked).toHaveLength(5);

      // Verify exact canonical order
      expect(ranked[0].display_name).toBe("Pallavi");
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].active_study_days).toBe(7);

      expect(ranked[1].display_name).toBe("Aditya");
      expect(ranked[1].rank).toBe(2);
      expect(ranked[1].active_study_days).toBe(6);
      expect(ranked[1].total_study_minutes).toBe(1920);

      expect(ranked[2].display_name).toBe("Subodh");
      expect(ranked[2].rank).toBe(3);
      expect(ranked[2].active_study_days).toBe(6);
      expect(ranked[2].total_study_minutes).toBe(1536);

      expect(ranked[3].display_name).toBe("Raunak");
      expect(ranked[3].rank).toBe(4);
      expect(ranked[3].active_study_days).toBe(6);
      expect(ranked[3].total_study_minutes).toBe(1374);

      expect(ranked[4].display_name).toBe("Anindita Debnath");
      expect(ranked[4].rank).toBe(5);
      expect(ranked[4].active_study_days).toBe(3);
      expect(ranked[4].total_study_minutes).toBe(1008);

      // Verify that Pallavi (7/7 days) strictly beats Anindita (3/7 days)
      expect(ranked[0].user_id).toBe("u-pallavi");
      expect(ranked[4].user_id).toBe("u-anindita");
    });

    it("evaluates the COMPLETE 7-student cohort: Ritesh and Tung Tung take #1 and #2, knocking lower candidates out", () => {
      // The complete live production cohort of all 7 students:
      const fullProductionCohort: ConsistencyCandidate[] = [
        { user_id: "u-aditya", display_name: "Aditya", active_study_days: 6, total_study_minutes: 1922, score: 86.2 },
        { user_id: "u-ritesh", display_name: "Ritesh", active_study_days: 7, total_study_minutes: 2374, score: 99.2 },
        { user_id: "u-raunak", display_name: "Raunak", active_study_days: 6, total_study_minutes: 1374, score: 59.6 },
        { user_id: "u-anindita", display_name: "Anindita Debnath", active_study_days: 3, total_study_minutes: 1009, score: 29.8 },
        { user_id: "u-pallavi", display_name: "Pallavi", active_study_days: 7, total_study_minutes: 1186, score: 71.7 },
        { user_id: "u-subodh", display_name: "Subodh", active_study_days: 6, total_study_minutes: 1537, score: 70.1 },
        { user_id: "u-tungtung", display_name: "Tung Tung", active_study_days: 7, total_study_minutes: 2359, score: 98.5 },
      ];

      const ranked = calculateConsistencyRanking(fullProductionCohort, 5);

      expect(ranked).toHaveLength(5);
      expect(ranked[0].display_name).toBe("Ritesh");
      expect(ranked[0].rank).toBe(1);
      expect(ranked[0].active_study_days).toBe(7);
      expect(ranked[0].total_study_minutes).toBe(2374);

      expect(ranked[1].display_name).toBe("Tung Tung");
      expect(ranked[1].rank).toBe(2);
      expect(ranked[1].active_study_days).toBe(7);
      expect(ranked[1].total_study_minutes).toBe(2359);

      expect(ranked[2].display_name).toBe("Pallavi");
      expect(ranked[2].rank).toBe(3);
      expect(ranked[2].active_study_days).toBe(7);
      expect(ranked[2].total_study_minutes).toBe(1186);

      expect(ranked[3].display_name).toBe("Aditya");
      expect(ranked[3].rank).toBe(4);
      expect(ranked[3].active_study_days).toBe(6);
      expect(ranked[3].total_study_minutes).toBe(1922);

      expect(ranked[4].display_name).toBe("Subodh");
      expect(ranked[4].rank).toBe(5);
      expect(ranked[4].active_study_days).toBe(6);
      expect(ranked[4].total_study_minutes).toBe(1537);

      // Verify Raunak and Anindita are NOT in the Top 5 when evaluated against the full cohort
      expect(ranked.some((c) => c.display_name === "Raunak")).toBe(false);
      expect(ranked.some((c) => c.display_name === "Anindita Debnath")).toBe(false);
    });
  });

  describe("2. Adversarial Edge Case Suite (Section 14)", () => {
    it("guarantees a 7-day student with low hours strictly defeats a 3-day student with extreme hours", () => {
      const candidates: ConsistencyCandidate[] = [
        {
          user_id: "user-e",
          display_name: "User E (Crammer)",
          active_study_days: 3,
          total_study_minutes: 3000, // 50 hours
          score: 95,
        },
        {
          user_id: "user-d",
          display_name: "User D",
          active_study_days: 5,
          total_study_minutes: 2400, // 40 hours
          score: 90,
        },
        {
          user_id: "user-c",
          display_name: "User C",
          active_study_days: 6,
          total_study_minutes: 1200, // 20 hours
          score: 75,
        },
        {
          user_id: "user-b",
          display_name: "User B",
          active_study_days: 6,
          total_study_minutes: 1800, // 30 hours
          score: 80,
        },
        {
          user_id: "user-a",
          display_name: "User A (Habitual)",
          active_study_days: 7,
          total_study_minutes: 600, // 10 hours
          score: 70,
        },
      ];

      const ranked = calculateConsistencyRanking(candidates, 5);

      expect(ranked.map((r) => r.user_id)).toEqual([
        "user-a", // 7 days, 10h
        "user-b", // 6 days, 30h
        "user-c", // 6 days, 20h
        "user-d", // 5 days, 40h
        "user-e", // 3 days, 50h
      ]);
      expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe("3. Deterministic 5-Tier Tie-Breaking Hierarchy", () => {
    it("tier 1: active_study_days DESC takes precedence over everything", () => {
      const a: ConsistencyCandidate = {
        user_id: "u-a",
        display_name: "Zoe",
        active_study_days: 7,
        total_study_minutes: 100,
        score: 10,
      };
      const b: ConsistencyCandidate = {
        user_id: "u-b",
        display_name: "Adam",
        active_study_days: 6,
        total_study_minutes: 5000,
        score: 99,
      };
      expect(compareConsistencyCandidates(a, b)).toBeLessThan(0); // a comes before b
    });

    it("tier 2: total_study_minutes DESC breaks ties when active days are identical", () => {
      const a: ConsistencyCandidate = {
        user_id: "u-a",
        display_name: "Zoe",
        active_study_days: 6,
        total_study_minutes: 1200,
        score: 50,
      };
      const b: ConsistencyCandidate = {
        user_id: "u-b",
        display_name: "Adam",
        active_study_days: 6,
        total_study_minutes: 900,
        score: 90,
      };
      expect(compareConsistencyCandidates(a, b)).toBeLessThan(0); // a comes before b (1200 > 900)
    });

    it("tier 3: score DESC breaks ties when active days and study minutes are identical", () => {
      const a: ConsistencyCandidate = {
        user_id: "u-a",
        display_name: "Zoe",
        active_study_days: 6,
        total_study_minutes: 1000,
        score: 85,
      };
      const b: ConsistencyCandidate = {
        user_id: "u-b",
        display_name: "Adam",
        active_study_days: 6,
        total_study_minutes: 1000,
        score: 75,
      };
      expect(compareConsistencyCandidates(a, b)).toBeLessThan(0); // a comes before b (85 > 75)
    });

    it("tier 4: display_name ASC breaks ties when days, minutes, and score are identical", () => {
      const a: ConsistencyCandidate = {
        user_id: "u-2",
        display_name: "Alice",
        active_study_days: 6,
        total_study_minutes: 1000,
        score: 80,
      };
      const b: ConsistencyCandidate = {
        user_id: "u-1",
        display_name: "Bob",
        active_study_days: 6,
        total_study_minutes: 1000,
        score: 80,
      };
      expect(compareConsistencyCandidates(a, b)).toBeLessThan(0); // Alice before Bob
    });

    it("tier 5: user_id ASC provides deterministic stability when all attributes match", () => {
      const a: ConsistencyCandidate = {
        user_id: "user-100",
        display_name: "Twin",
        active_study_days: 7,
        total_study_minutes: 1400,
        score: 90,
      };
      const b: ConsistencyCandidate = {
        user_id: "user-200",
        display_name: "Twin",
        active_study_days: 7,
        total_study_minutes: 1400,
        score: 90,
      };
      expect(compareConsistencyCandidates(a, b)).toBeLessThan(0); // user-100 before user-200
    });
  });

  describe("4. Cohort Sizing, Slicing & Ranks", () => {
    it("sorts entire candidate set BEFORE slicing top 5", () => {
      const cohort: ConsistencyCandidate[] = Array.from({ length: 15 }, (_, i) => ({
        user_id: `u-${i}`,
        display_name: `Student ${i}`,
        active_study_days: (i % 7) + 1,
        total_study_minutes: (i + 1) * 100,
      }));

      const top5 = calculateConsistencyRanking(cohort, 5);
      expect(top5).toHaveLength(5);
      expect(top5.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]);

      // All top 5 must have 7 or 6 days
      expect(top5[0].active_study_days).toBe(7);
      expect(top5[1].active_study_days).toBe(7);
    });

    it("safely handles cohorts with fewer than 5 students", () => {
      const smallCohort: ConsistencyCandidate[] = [
        {
          user_id: "u-1",
          display_name: "Student 1",
          active_study_days: 5,
          total_study_minutes: 500,
        },
        {
          user_id: "u-2",
          display_name: "Student 2",
          active_study_days: 7,
          total_study_minutes: 700,
        },
      ];

      const ranked = calculateConsistencyRanking(smallCohort, 5);
      expect(ranked).toHaveLength(2);
      expect(ranked[0].user_id).toBe("u-2");
      expect(ranked[0].rank).toBe(1);
      expect(ranked[1].user_id).toBe("u-1");
      expect(ranked[1].rank).toBe(2);
    });

    it("safely handles empty candidate arrays", () => {
      expect(calculateConsistencyRanking([])).toEqual([]);
      expect(calculateConsistencyRanking(null as unknown as ConsistencyCandidate[])).toEqual([]);
    });
  });

  describe("5. Immutability & Admin Exclusion Invariants", () => {
    it("never mutates the input candidates array", () => {
      const original: ConsistencyCandidate[] = [
        { user_id: "u-1", display_name: "B", active_study_days: 3, total_study_minutes: 100 },
        { user_id: "u-2", display_name: "A", active_study_days: 7, total_study_minutes: 200 },
      ];
      const cloned = JSON.parse(JSON.stringify(original));

      calculateConsistencyRanking(original, 5);

      expect(original).toEqual(cloned);
    });

    it("filters out candidates with is_admin: true", () => {
      const candidates: ConsistencyCandidate[] = [
        { user_id: "admin-1", display_name: "Admin", is_admin: true, active_study_days: 7, total_study_minutes: 9999 },
        { user_id: "u-1", display_name: "Student", is_admin: false, active_study_days: 6, total_study_minutes: 600 },
      ];

      const ranked = calculateConsistencyRanking(candidates, 5);
      expect(ranked).toHaveLength(1);
      expect(ranked[0].user_id).toBe("u-1");
    });
  });

  describe("6. Active Days Clamping & Daily Average Computation", () => {
    it("clamps active study days to [0, 7]", () => {
      const candidates: ConsistencyCandidate[] = [
        { user_id: "u-over", display_name: "Over", active_study_days: 10, total_study_minutes: 700 },
        { user_id: "u-under", display_name: "Under", active_study_days: -2, total_study_minutes: 700 },
      ];

      const ranked = calculateConsistencyRanking(candidates, 5);
      expect(ranked.find((c) => c.user_id === "u-over")?.active_study_days).toBe(7);
      expect(ranked.find((c) => c.user_id === "u-under")?.active_study_days).toBe(0);
    });

    it("computes daily_average_minutes using strictly 7.0 as denominator when not provided", () => {
      const candidates: ConsistencyCandidate[] = [
        { user_id: "u-1", display_name: "Student", active_study_days: 3, total_study_minutes: 420 },
      ];

      const ranked = calculateConsistencyRanking(candidates, 5);
      expect(ranked[0].daily_average_minutes).toBe(60.0);
    });
  });
});
