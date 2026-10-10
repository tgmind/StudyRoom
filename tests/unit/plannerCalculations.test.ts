import { describe, it, expect } from "vitest";
import {
  parseDateISO,
  formatDateISO,
  differenceInCalendarDays,
  calculateExamCountdown,
  validateSlot,
  validateExamDateChange,
  getDatesBetween,
  calculateScheduleCoverage,
  calculatePlanningInsights,
  formatReadableDate,
  formatIndianDate,
  parseIndianDateToISO,
  validateIndianDateString,
} from "@/lib/planner/calculations";
import { PreparationSlot } from "@/lib/supabase/types";

describe("Planner Calculations and Validation", () => {
  describe("Date Parsing and Calendar Day Differences", () => {
    it("parses date ISO strings to midnight UTC without timezone offset shift", () => {
      const d = parseDateISO("2027-07-10");
      expect(d.getUTCFullYear()).toBe(2027);
      expect(d.getUTCMonth()).toBe(6); // 0-indexed July
      expect(d.getUTCDate()).toBe(10);
    });

    it("formats UTC dates back to YYYY-MM-DD", () => {
      const d = new Date(Date.UTC(2027, 1, 28)); // 28 Feb 2027
      expect(formatDateISO(d)).toBe("2027-02-28");
    });

    it("correctly calculates calendar days difference across months and leap years", () => {
      // Leap year 2028: Feb 28 to Mar 1 is 2 days
      expect(differenceInCalendarDays("2028-02-28", "2028-03-01")).toBe(2);
      // Non-leap year 2027: Feb 28 to Mar 1 is 1 day
      expect(differenceInCalendarDays("2027-02-28", "2027-03-01")).toBe(1);
      // Same day
      expect(differenceInCalendarDays("2026-10-09", "2026-10-09")).toBe(0);
      // Past day
      expect(differenceInCalendarDays("2026-10-10", "2026-10-09")).toBe(-1);
    });

    it("generates all inclusive dates between two dates", () => {
      const dates = getDatesBetween("2026-10-01", "2026-10-05");
      expect(dates).toEqual([
        "2026-10-01",
        "2026-10-02",
        "2026-10-03",
        "2026-10-04",
        "2026-10-05",
      ]);
    });
  });

  describe("Exam Countdown", () => {
    // Reference date: 2026-10-09 12:00:00 Asia/Kolkata
    const refDate = new Date("2026-10-09T06:30:00.000Z");

    it("reports correct countdown for a future exam", () => {
      const countdown = calculateExamCountdown("2026-10-19", refDate);
      expect(countdown.status).toBe("future");
      expect(countdown.daysRemaining).toBe(10);
      expect(countdown.displayText).toBe("10 days remaining");
    });

    it("reports singular '1 day remaining' when 1 day away", () => {
      const countdown = calculateExamCountdown("2026-10-10", refDate);
      expect(countdown.status).toBe("future");
      expect(countdown.daysRemaining).toBe(1);
      expect(countdown.displayText).toBe("1 day remaining");
    });

    it("reports 'Exam today' on the exam day", () => {
      const countdown = calculateExamCountdown("2026-10-09", refDate);
      expect(countdown.status).toBe("today");
      expect(countdown.daysRemaining).toBe(0);
      expect(countdown.displayText).toBe("Exam today");
    });

    it("reports 'Exam completed' for a past exam and never negative days", () => {
      const countdown = calculateExamCountdown("2026-10-05", refDate);
      expect(countdown.status).toBe("past");
      expect(countdown.daysRemaining).toBe(0);
      expect(countdown.displayText).toBe("Exam completed");
    });
  });

  describe("Preparation Slot Validation and Overlaps", () => {
    const existingSlots: PreparationSlot[] = [
      {
        id: "slot-1",
        plan_id: "plan-1",
        user_id: "user-1",
        title: "Syllabus Covering",
        start_date: "2027-02-01",
        end_date: "2027-02-28",
        category: "syllabus",
        color: "#3b82f6",
        sort_order: 0,
        created_at: "2026-10-09T00:00:00Z",
        updated_at: "2026-10-09T00:00:00Z",
      },
      {
        id: "slot-2",
        plan_id: "plan-1",
        user_id: "user-1",
        title: "Revision",
        start_date: "2027-03-01",
        end_date: "2027-03-31",
        category: "revision",
        color: "#a855f7",
        sort_order: 1,
        created_at: "2026-10-09T00:00:00Z",
        updated_at: "2026-10-09T00:00:00Z",
      },
    ];

    it("validates valid non-overlapping slot", () => {
      const result = validateSlot(
        {
          title: "Mock Tests",
          start_date: "2027-04-01",
          end_date: "2027-05-15",
        },
        existingSlots,
        "2027-07-10"
      );
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it("rejects slot with start date after end date", () => {
      const result = validateSlot(
        {
          title: "Bad Slot",
          start_date: "2027-05-10",
          end_date: "2027-05-01",
        },
        existingSlots,
        "2027-07-10"
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Start date cannot be after end date");
    });

    it("rejects slot extending beyond parent exam date", () => {
      const result = validateSlot(
        {
          title: "Too Late Slot",
          start_date: "2027-07-01",
          end_date: "2027-07-15", // Exam date is 2027-07-10
        },
        existingSlots,
        "2027-07-10"
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("cannot extend beyond the exam date");
    });

    it("detects and rejects overlapping slot ranges within the same exam", () => {
      // Overlaps with slot-1 (2027-02-01 to 2027-02-28)
      const result = validateSlot(
        {
          title: "Conflicting Slot",
          start_date: "2027-02-20",
          end_date: "2027-03-05",
        },
        existingSlots,
        "2027-07-10"
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Dates overlap with existing slot");
      expect(result.conflictingSlotId).toBe("slot-1");
    });

    it("permits editing an existing slot without conflicting with itself", () => {
      const result = validateSlot(
        {
          title: "Updated Revision",
          start_date: "2027-03-01",
          end_date: "2027-03-25", // Shortened
        },
        existingSlots,
        "2027-07-10",
        "slot-2" // editing slot-2
      );
      expect(result.isValid).toBe(true);
    });

    it("permits gaps between slots (rest days / unscheduled periods)", () => {
      const result = validateSlot(
        {
          title: "Practice Phase",
          start_date: "2027-04-10", // Gap between 2027-03-31 and 2027-04-10
          end_date: "2027-04-30",
        },
        existingSlots,
        "2027-07-10"
      );
      expect(result.isValid).toBe(true);
    });
  });

  describe("Exam Date Validation on Edit", () => {
    const slots: PreparationSlot[] = [
      {
        id: "s1",
        plan_id: "p1",
        user_id: "u1",
        title: "Mock Test",
        start_date: "2027-04-01",
        end_date: "2027-06-30",
        category: "mock_tests",
        color: "#f97316",
        sort_order: 0,
        created_at: "",
        updated_at: "",
      },
    ];

    it("allows moving exam date to later date", () => {
      const res = validateExamDateChange("2027-08-01", slots);
      expect(res.isValid).toBe(true);
    });

    it("rejects moving exam date earlier than an existing slot's end date", () => {
      const res = validateExamDateChange("2027-05-01", slots);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("conflicts with slot(s): \"Mock Test\"");
      expect(res.conflictingSlots?.length).toBe(1);
    });
  });

  describe("Schedule Coverage Calculation", () => {
    it("returns 0% when no slots configured", () => {
      const coverage = calculateScheduleCoverage("2027-07-10", []);
      expect(coverage.coveragePct).toBe(0);
      expect(coverage.scheduledDays).toBe(0);
    });

    it("calculates accurate coverage percentage and detects gaps", () => {
      const slots: PreparationSlot[] = [
        {
          id: "s1",
          plan_id: "p1",
          user_id: "u1",
          title: "Sprint 1",
          start_date: "2026-10-10",
          end_date: "2026-10-19", // 10 days
          category: "syllabus",
          color: "#3b82f6",
          sort_order: 0,
          created_at: "",
          updated_at: "",
        },
        {
          id: "s2",
          plan_id: "p1",
          user_id: "u1",
          title: "Sprint 2",
          start_date: "2026-10-25",
          end_date: "2026-10-29", // 5 days
          category: "revision",
          color: "#a855f7",
          sort_order: 1,
          created_at: "",
          updated_at: "",
        },
      ];

      // Window from 2026-10-09 (today) to 2026-10-29: 21 days total
      const refDate = new Date("2026-10-09T06:30:00.000Z");
      const coverage = calculateScheduleCoverage("2026-10-29", slots, refDate);

      expect(coverage.scheduledDays).toBe(15);
      expect(coverage.hasGaps).toBe(true);
      expect(coverage.coveragePct).toBeGreaterThan(0);
      expect(coverage.coveragePct).toBeLessThan(100);
    });
  });

  describe("Planning Insights Aggregation", () => {
    const refDate = new Date("2026-10-09T06:30:00.000Z"); // Today is 2026-10-09

    const mockPlans = [
      {
        id: "plan-1",
        user_id: "u1",
        exam_name: "SSC CGL",
        exam_date: "2026-12-15",
        show_in_streaks: true,
        is_locked: false,
        sort_order: 0,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s1",
            plan_id: "plan-1",
            user_id: "u1",
            title: "Phase 1",
            start_date: "2026-10-10",
            end_date: "2026-10-15",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      {
        id: "plan-2",
        user_id: "u1",
        exam_name: "UPSC CSE Prelims",
        exam_date: "2027-05-23",
        show_in_streaks: false,
        is_locked: true,
        sort_order: 1,
        created_at: "",
        updated_at: "",
        slots: [
          {
            id: "s2",
            plan_id: "plan-2",
            user_id: "u1",
            title: "NCERT Base",
            start_date: "2026-10-12",
            end_date: "2026-10-18",
            category: "syllabus",
            color: "#3b82f6",
            sort_order: 0,
            created_at: "",
            updated_at: "",
          },
        ],
      },
      {
        id: "plan-3",
        user_id: "u1",
        exam_name: "Completed Past Exam",
        exam_date: "2026-09-01", // Already passed
        show_in_streaks: true,
        is_locked: false,
        sort_order: 2,
        created_at: "",
        updated_at: "",
        slots: [],
      },
    ];

    it("aggregates insights without counting expired exams as upcoming", () => {
      const insights = calculatePlanningInsights(mockPlans, refDate);

      expect(insights.totalPlans).toBe(3);
      expect(insights.activeExamsCount).toBe(2); // plan-1 and plan-2, excluding past plan-3
      expect(insights.nearestExam?.examName).toBe("SSC CGL");
      expect(insights.nearestExam?.daysRemaining).toBe(67);
      expect(insights.lockedPlansCount).toBe(1);
      expect(insights.editablePlansCount).toBe(2);
      expect(insights.streaksVisiblePlansCount).toBe(2);
      expect(insights.configuredSlotsCount).toBe(2);

      // Verify unique scheduled days union (plan-1 has Oct 10-15 [6 days], plan-2 has Oct 12-18 [7 days])
      // Oct 12, 13, 14, 15 overlap. Total unique days should be Oct 10 to 18 = 9 unique days
      expect(insights.totalScheduledDays).toBe(9);
    });
  });

  describe("Date Formatting Utility", () => {
    it("formats ISO dates nicely", () => {
      expect(formatReadableDate("2027-07-10")).toBe("10 Jul 2027");
      expect(
        formatReadableDate("2027-07-10", { includeYear: false, monthFormat: "long" })
      ).toBe("10 July");
    });
  });

  describe("Hardened Edge Cases and Impossible Date Validation", () => {
    it("rejects impossible calendar dates like Feb 31, Apr 31, and Feb 29 in non-leap years", () => {
      expect(isNaN(parseDateISO("2027-02-31").getTime())).toBe(true);
      expect(isNaN(parseDateISO("2027-04-31").getTime())).toBe(true);
      expect(isNaN(parseDateISO("2027-02-29").getTime())).toBe(true); // 2027 is not a leap year
      expect(isNaN(parseDateISO("2028-02-29").getTime())).toBe(false); // 2028 is a leap year
      expect(isNaN(parseDateISO("invalid-date").getTime())).toBe(true);
      expect(isNaN(parseDateISO("").getTime())).toBe(true);
    });

    it("rejects malformed and impossible dates in validateSlot", () => {
      const res1 = validateSlot(
        { title: "Test", start_date: "2027-02-31", end_date: "2027-03-05" },
        [],
        "2027-07-10"
      );
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain("Invalid start date or end date format");

      const res2 = validateSlot(
        { title: "Test", start_date: "2027-03-01", end_date: "2027-03-05" },
        [],
        "invalid-exam-date"
      );
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain("Invalid exam date format");
    });

    it("rejects malformed dates in validateExamDateChange", () => {
      const res = validateExamDateChange("2027-02-31", []);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain("Invalid exam date format");
    });

    it("accurately computes schedule coverage for empty slots in an upcoming exam", () => {
      const refDate = new Date("2026-10-09T06:30:00.000Z");
      // Exam 10 days away
      const coverage = calculateScheduleCoverage("2026-10-19", [], refDate);
      expect(coverage.coveragePct).toBe(0);
      expect(coverage.scheduledDays).toBe(0);
      expect(coverage.totalEligibleDays).toBe(11); // 10 days + 1 inclusive
      expect(coverage.hasGaps).toBe(true);
      expect(coverage.gapDaysCount).toBe(11);
      expect(coverage.displayText).toBe("0% schedule coverage (0 of 11 days)");
    });

    it("accurately computes schedule coverage for past exams without denominator anomalies", () => {
      const refDate = new Date("2026-10-09T06:30:00.000Z");
      const pastExamDate = "2026-08-31";
      const pastSlots: PreparationSlot[] = [
        {
          id: "s1",
          plan_id: "p1",
          user_id: "u1",
          title: "Revision",
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          category: "revision",
          color: "#3b82f6",
          sort_order: 0,
          created_at: "",
          updated_at: "",
        },
      ];

      const coverage = calculateScheduleCoverage(pastExamDate, pastSlots, refDate);
      expect(coverage.coveragePct).toBe(100);
      expect(coverage.scheduledDays).toBe(31);
      expect(coverage.totalEligibleDays).toBe(31);
      expect(coverage.hasGaps).toBe(false);
      expect(coverage.displayText).toBe("100% schedule coverage (31 of 31 days)");
    });
  });

  describe("Indian Date Format (DD/MM/YYYY) Conventions", () => {
    it("formats ISO YYYY-MM-DD into Indian DD/MM/YYYY correctly", () => {
      expect(formatIndianDate("2027-02-01")).toBe("01/02/2027");
      expect(formatIndianDate("2027-07-10")).toBe("10/07/2027");
      expect(formatIndianDate("2027-08-07")).toBe("07/08/2027");
      expect(formatIndianDate("2024-02-29")).toBe("29/02/2024");
      expect(formatIndianDate("")).toBe("");
      expect(formatIndianDate("invalid")).toBe("");
    });

    it("parses valid Indian DD/MM/YYYY into canonical ISO YYYY-MM-DD", () => {
      expect(parseIndianDateToISO("01/02/2027")).toBe("2027-02-01");
      expect(parseIndianDateToISO("10/07/2027")).toBe("2027-07-10");
      expect(parseIndianDateToISO("08/07/2027")).toBe("2027-07-08");
      expect(parseIndianDateToISO("29/02/2024")).toBe("2024-02-29"); // leap year
    });

    it("strictly rejects impossible calendar dates in Indian format", () => {
      // 31 February 2027
      expect(parseIndianDateToISO("31/02/2027")).toBeNull();
      // 29 February in non-leap year 2025
      expect(parseIndianDateToISO("29/02/2025")).toBeNull();
      // 29 February in non-leap year 2027
      expect(parseIndianDateToISO("29/02/2027")).toBeNull();
      // 32 January
      expect(parseIndianDateToISO("32/01/2027")).toBeNull();
      // Month 13
      expect(parseIndianDateToISO("15/13/2027")).toBeNull();
      // Day 00
      expect(parseIndianDateToISO("00/12/2027")).toBeNull();
      // 31 April (April has 30 days)
      expect(parseIndianDateToISO("31/04/2027")).toBeNull();
    });

    it("validates Indian date strings with descriptive error messages", () => {
      expect(validateIndianDateString("").isValid).toBe(false);
      expect(validateIndianDateString("invalid").isValid).toBe(false);
      expect(validateIndianDateString("31/02/2027").isValid).toBe(false);
      expect(validateIndianDateString("31/02/2027").error).toMatch(/Invalid calendar date/i);

      const valid = validateIndianDateString("10/07/2027");
      expect(valid.isValid).toBe(true);
      expect(valid.isoDate).toBe("2027-07-10");
    });

    it("never confuses Indian DD/MM/YYYY with US MM/DD/YYYY convention", () => {
      // "01/02/2027" must be 1 Feb 2027, never 2 Jan 2027
      expect(parseIndianDateToISO("01/02/2027")).toBe("2027-02-01");
      expect(parseIndianDateToISO("01/02/2027")).not.toBe("2027-01-02");

      // "10/07/2027" must be 10 Jul 2027, never 7 Oct 2027
      expect(parseIndianDateToISO("10/07/2027")).toBe("2027-07-10");
      expect(parseIndianDateToISO("10/07/2027")).not.toBe("2027-10-07");
    });
  });
});
