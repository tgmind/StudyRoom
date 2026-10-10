import { ExamPlan, PreparationSlot } from "@/lib/supabase/types";
import { getDateInTimezone } from "@/lib/scoring/streak";
import { getServerNow } from "@/lib/time/clockSync";
import {
  ExamCountdownInfo,
  ScheduleCoverageInfo,
  PlanningInsights,
  SlotValidationResult,
  ExamDateValidationResult,
} from "./types";

/**
 * Parses a YYYY-MM-DD date string into a UTC Date object to avoid device-local timezone offsets.
 */
export function parseDateISO(iso: string): Date {
  if (!iso || typeof iso !== "string") return new Date(NaN);
  const parts = iso.split("-").map((v) => parseInt(v, 10));
  if (parts.length !== 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return new Date(NaN);
  }
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  // Strict round-trip check to catch impossible dates (e.g. Feb 30, April 31, non-leap Feb 29)
  if (
    d.getUTCFullYear() !== parts[0] ||
    d.getUTCMonth() !== parts[1] - 1 ||
    d.getUTCDate() !== parts[2]
  ) {
    return new Date(NaN);
  }
  return d;
}

/**
 * Formats a Date object as YYYY-MM-DD string using UTC values.
 */
export function formatDateISO(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Computes difference in calendar days (toISO - fromISO).
 */
export function differenceInCalendarDays(fromISO: string, toISO: string): number {
  const from = parseDateISO(fromISO).getTime();
  const to = parseDateISO(toISO).getTime();
  if (isNaN(from) || isNaN(to)) return 0;
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

/**
 * Calculates countdown from reference date to exam date.
 */
export function calculateExamCountdown(
  examDateISO: string,
  referenceDate: Date = getServerNow(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): ExamCountdownInfo {
  const todayISO = getDateInTimezone(referenceDate, timezone);
  const diff = differenceInCalendarDays(todayISO, examDateISO);

  if (diff > 0) {
    return {
      status: "future",
      daysRemaining: diff,
      displayText: diff === 1 ? "1 day remaining" : `${diff} days remaining`,
    };
  }

  if (diff === 0) {
    return {
      status: "today",
      daysRemaining: 0,
      displayText: "Exam today",
    };
  }

  return {
    status: "past",
    daysRemaining: 0,
    displayText: "Exam completed",
  };
}

/**
 * Validates a preparation slot date range and ensures no overlap within the same plan.
 */
export function validateSlot(
  slot: {
    title: string;
    start_date: string;
    end_date: string;
  },
  existingSlots: PreparationSlot[],
  examDateISO: string,
  editingSlotId?: string
): SlotValidationResult {
  if (!slot.title || slot.title.trim().length === 0) {
    return { isValid: false, error: "Slot title is required" };
  }

  if (!slot.start_date || !slot.end_date) {
    return { isValid: false, error: "Start date and end date are required" };
  }

  const parsedStart = parseDateISO(slot.start_date);
  const parsedEnd = parseDateISO(slot.end_date);
  if (isNaN(parsedStart.getTime()) || isNaN(parsedEnd.getTime())) {
    return { isValid: false, error: "Invalid start date or end date format" };
  }

  const parsedExam = parseDateISO(examDateISO);
  if (isNaN(parsedExam.getTime())) {
    return { isValid: false, error: "Invalid exam date format" };
  }

  if (slot.start_date > slot.end_date) {
    return { isValid: false, error: "Start date cannot be after end date" };
  }

  if (slot.end_date > examDateISO) {
    return {
      isValid: false,
      error: `Slot end date cannot extend beyond the exam date (${examDateISO})`,
    };
  }

  // Check for date range overlap with existing slots
  for (const existing of existingSlots) {
    if (editingSlotId && existing.id === editingSlotId) {
      continue;
    }

    // Two intervals [A, B] and [C, D] overlap if A <= D and C <= B
    const overlaps =
      slot.start_date <= existing.end_date &&
      existing.start_date <= slot.end_date;

    if (overlaps) {
      return {
        isValid: false,
        conflictingSlotId: existing.id,
        error: `Dates overlap with existing slot "${existing.title}" (${existing.start_date} to ${existing.end_date})`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates whether modifying an exam date creates conflicts with existing slots.
 */
export function validateExamDateChange(
  newExamDateISO: string,
  existingSlots: PreparationSlot[]
): ExamDateValidationResult {
  if (!newExamDateISO) {
    return { isValid: false, error: "Exam date is required" };
  }

  const parsedNewExam = parseDateISO(newExamDateISO);
  if (isNaN(parsedNewExam.getTime())) {
    return { isValid: false, error: "Invalid exam date format" };
  }

  const conflictingSlots = existingSlots.filter(
    (slot) => slot.end_date > newExamDateISO
  );

  if (conflictingSlots.length > 0) {
    const slotNames = conflictingSlots.map((s) => `"${s.title}" (${s.end_date})`).join(", ");
    return {
      isValid: false,
      error: `The new exam date (${newExamDateISO}) conflicts with slot(s): ${slotNames}. Adjust or remove them first.`,
      conflictingSlots,
    };
  }

  return { isValid: true };
}

/**
 * Generates an array of all consecutive ISO dates between startISO and endISO inclusive.
 */
export function getDatesBetween(startISO: string, endISO: string): string[] {
  if (startISO > endISO) return [];
  const dates: string[] = [];
  const curr = parseDateISO(startISO);
  const end = parseDateISO(endISO);

  if (isNaN(curr.getTime()) || isNaN(end.getTime())) return [];

  while (curr.getTime() <= end.getTime()) {
    dates.push(formatDateISO(curr));
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return dates;
}

/**
 * Calculates schedule coverage percentage and gaps.
 * Schedule coverage = unique dates assigned to valid slots divided by eligible calendar dates before the exam.
 */
export function calculateScheduleCoverage(
  examDateISO: string,
  slots: PreparationSlot[],
  referenceDate: Date = getServerNow(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): ScheduleCoverageInfo {
  const todayISO = getDateInTimezone(referenceDate, timezone);

  // If no slots exist yet
  if (!slots || slots.length === 0) {
    const eligibleDays =
      examDateISO >= todayISO
        ? Math.max(1, differenceInCalendarDays(todayISO, examDateISO) + 1)
        : 0;

    return {
      coveragePct: 0,
      scheduledDays: 0,
      totalEligibleDays: eligibleDays,
      displayText: `0% schedule coverage (0 of ${eligibleDays} days)`,
      hasGaps: eligibleDays > 0,
      gapDaysCount: eligibleDays,
    };
  }

  // Set of all unique scheduled days
  const scheduledDateSet = new Set<string>();
  let earliestSlotStart = slots[0].start_date;

  for (const slot of slots) {
    if (slot.start_date < earliestSlotStart) {
      earliestSlotStart = slot.start_date;
    }
    const dates = getDatesBetween(slot.start_date, slot.end_date);
    for (const d of dates) {
      scheduledDateSet.add(d);
    }
  }

  // Calculate planning timeline bounds
  let startDate: string;
  if (examDateISO >= todayISO) {
    // For future/today exams, the window spans from the start of preparation (or today) to exam date
    startDate = earliestSlotStart < todayISO ? earliestSlotStart : todayISO;
  } else {
    // For past exams, the window is the historical preparation period leading to the exam
    startDate = earliestSlotStart <= examDateISO ? earliestSlotStart : examDateISO;
  }
  const endDate = examDateISO;

  const totalEligibleDays = Math.max(1, differenceInCalendarDays(startDate, endDate) + 1);
  const scheduledDays = scheduledDateSet.size;
  const coveragePct = Math.min(100, Math.max(0, Math.round((scheduledDays / totalEligibleDays) * 100)));
  const gapDaysCount = Math.max(0, totalEligibleDays - scheduledDays);
  const hasGaps = gapDaysCount > 0;

  return {
    coveragePct,
    scheduledDays,
    totalEligibleDays,
    displayText: `${coveragePct}% schedule coverage (${scheduledDays} of ${totalEligibleDays} days)`,
    hasGaps,
    gapDaysCount,
  };
}

/**
 * Calculates comprehensive planning insights strictly from persisted user data.
 */
export function calculatePlanningInsights(
  plans: (ExamPlan & { slots?: PreparationSlot[] })[],
  referenceDate: Date = getServerNow(),
  timezone: string = process.env.NEXT_PUBLIC_APP_TIMEZONE || "Asia/Kolkata"
): PlanningInsights {
  const todayISO = getDateInTimezone(referenceDate, timezone);
  const totalPlans = plans.length;

  const activePlans = plans.filter(
    (p) => differenceInCalendarDays(todayISO, p.exam_date) >= 0
  );
  const activeExamsCount = activePlans.length;

  // Nearest upcoming exam
  let nearestExam: PlanningInsights["nearestExam"] = null;
  let minDays = Infinity;

  for (const p of activePlans) {
    const days = differenceInCalendarDays(todayISO, p.exam_date);
    if (days >= 0 && days < minDays) {
      minDays = days;
      nearestExam = {
        planId: p.id,
        examName: p.exam_name,
        examDate: p.exam_date,
        daysRemaining: days,
      };
    }
  }

  // Unique scheduled preparation days union across all active plans
  const uniqueScheduledDays = new Set<string>();
  let configuredSlotsCount = 0;

  for (const plan of plans) {
    const slots = plan.slots || [];
    configuredSlotsCount += slots.length;

    // Only count dates for active plans towards total preparation days
    if (differenceInCalendarDays(todayISO, plan.exam_date) >= 0) {
      for (const slot of slots) {
        const dates = getDatesBetween(slot.start_date, slot.end_date);
        for (const d of dates) {
          // Count only current or future preparation days
          if (d >= todayISO && d <= plan.exam_date) {
            uniqueScheduledDays.add(d);
          }
        }
      }
    }
  }

  const lockedPlansCount = plans.filter((p) => p.is_locked).length;
  const editablePlansCount = totalPlans - lockedPlansCount;
  const streaksVisiblePlansCount = plans.filter((p) => p.show_in_streaks).length;

  return {
    totalPlans,
    activeExamsCount,
    nearestExam,
    totalScheduledDays: uniqueScheduledDays.size,
    configuredSlotsCount,
    lockedPlansCount,
    editablePlansCount,
    streaksVisiblePlansCount,
  };
}

/**
 * Formats a YYYY-MM-DD date into human-readable format e.g. "10 Jul 2027" or "10 July 2027".
 */
export function formatReadableDate(
  isoDate: string,
  options: { includeYear?: boolean; monthFormat?: "short" | "long" } = {
    includeYear: true,
    monthFormat: "short",
  }
): string {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-").map((v) => parseInt(v, 10));
  if (isNaN(year) || isNaN(month) || isNaN(day)) return isoDate;

  const monthNamesShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const monthNamesLong = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const monthStr =
    options.monthFormat === "long"
      ? monthNamesLong[month - 1]
      : monthNamesShort[month - 1];

  if (options.includeYear) {
    return `${day} ${monthStr} ${year}`;
  }
  return `${day} ${monthStr}`;
}

/**
 * Formats a canonical YYYY-MM-DD date into Indian format DD/MM/YYYY.
 * Example: "2027-02-01" -> "01/02/2027", "2027-07-10" -> "10/07/2027".
 */
export function formatIndianDate(isoDate: string): string {
  if (!isoDate || typeof isoDate !== "string") return "";
  const parts = isoDate.trim().split("-");
  if (parts.length !== 3) return "";
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return "";

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return "";
  }

  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const yyyy = String(year).padStart(4, "0");
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Parses an Indian date string (DD/MM/YYYY) into canonical YYYY-MM-DD format.
 * Strictly checks day, month, year, leap years, and impossible dates.
 * Returns null if invalid.
 */
export function parseIndianDateToISO(indianDate: string): string | null {
  if (!indianDate || typeof indianDate !== "string") return null;
  const trimmed = indianDate.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2150) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Validates an Indian date string (DD/MM/YYYY) and provides descriptive error messages.
 */
export function validateIndianDateString(indianDate: string): {
  isValid: boolean;
  error?: string;
  isoDate?: string;
} {
  if (!indianDate || !indianDate.trim()) {
    return { isValid: false, error: "Date is required" };
  }
  const trimmed = indianDate.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) {
    return { isValid: false, error: "Please enter date as DD/MM/YYYY" };
  }

  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);

  if (month < 1 || month > 12) {
    return { isValid: false, error: "Month must be between 01 and 12" };
  }
  if (day < 1 || day > 31) {
    return { isValid: false, error: "Day must be between 01 and 31" };
  }
  if (year < 1900 || year > 2150) {
    return { isValid: false, error: "Year must be between 1900 and 2150" };
  }

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return { isValid: false, error: "Invalid calendar date for this month/year" };
  }

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { isValid: true, isoDate: iso };
}
