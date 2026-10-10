import { ExamPlan, PreparationSlot, SlotCategory } from "@/lib/supabase/types";

export interface SlotCategoryMeta {
  category: SlotCategory;
  label: string;
  defaultColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  heatmapColor: string;
}

export const PRESET_SLOT_CATEGORIES: Record<SlotCategory, SlotCategoryMeta> = {
  syllabus: {
    category: "syllabus",
    label: "Syllabus Coverage",
    defaultColor: "#3b82f6", // Blue
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-300",
    badgeBorder: "border-blue-500/30",
    heatmapColor: "rgba(59, 130, 246, 0.75)",
  },
  revision: {
    category: "revision",
    label: "Revision",
    defaultColor: "#a855f7", // Violet / Purple
    badgeBg: "bg-purple-500/15",
    badgeText: "text-purple-300",
    badgeBorder: "border-purple-500/30",
    heatmapColor: "rgba(168, 85, 247, 0.75)",
  },
  mock_tests: {
    category: "mock_tests",
    label: "Mock Tests",
    defaultColor: "#f97316", // Orange
    badgeBg: "bg-orange-500/15",
    badgeText: "text-orange-300",
    badgeBorder: "border-orange-500/30",
    heatmapColor: "rgba(249, 115, 22, 0.75)",
  },
  practice: {
    category: "practice",
    label: "Practice",
    defaultColor: "#14b8a6", // Teal
    badgeBg: "bg-teal-500/15",
    badgeText: "text-teal-300",
    badgeBorder: "border-teal-500/30",
    heatmapColor: "rgba(20, 184, 166, 0.75)",
  },
  custom: {
    category: "custom",
    label: "Custom",
    defaultColor: "#ec4899", // Pink
    badgeBg: "bg-pink-500/15",
    badgeText: "text-pink-300",
    badgeBorder: "border-pink-500/30",
    heatmapColor: "rgba(236, 72, 153, 0.75)",
  },
};

export interface ExamCountdownInfo {
  status: "future" | "today" | "past";
  daysRemaining: number;
  displayText: string;
}

export interface ScheduleCoverageInfo {
  coveragePct: number;
  scheduledDays: number;
  totalEligibleDays: number;
  displayText: string;
  hasGaps: boolean;
  gapDaysCount: number;
}

export interface PlanningInsights {
  totalPlans: number;
  activeExamsCount: number;
  nearestExam: {
    planId: string;
    examName: string;
    examDate: string;
    daysRemaining: number;
  } | null;
  totalScheduledDays: number;
  configuredSlotsCount: number;
  lockedPlansCount: number;
  editablePlansCount: number;
  streaksVisiblePlansCount: number;
}

export interface SlotValidationResult {
  isValid: boolean;
  error?: string;
  conflictingSlotId?: string;
}

export interface ExamDateValidationResult {
  isValid: boolean;
  error?: string;
  conflictingSlots?: PreparationSlot[];
}

export interface CalendarDaySlotInfo {
  dateISO: string; // YYYY-MM-DD
  dayNumber: number;
  dayName: string;
  isToday: boolean;
  isExamDay: boolean;
  isCurrentMonth: boolean;
  slot: PreparationSlot | null;
  exam: ExamPlan;
}
