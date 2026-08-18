import type { EnrollmentStatus, StudentEnrollment } from "@/types";
import type { Locale } from "@/lib/i18n/config";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { CANONICAL_TIMEZONE, LESSON_MINUTES } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import {
  computeContractEndDate,
  nextScheduledDateOnOrAfter,
} from "@/lib/contract-schedule";
import {
  formatUnifiedSlotLabel,
  nextPlanSlotOccurrenceIso,
} from "@/lib/teacher-availability";

export function enrollmentSessionMinutes(enrollment: StudentEnrollment): number {
  return enrollment.sessionMinutes && enrollment.sessionMinutes > 0
    ? enrollment.sessionMinutes
    : LESSON_MINUTES;
}

export function enrollmentScheduleDays(enrollment: StudentEnrollment): DayLabel[] {
  return (enrollment.scheduleDays ?? []) as DayLabel[];
}

/** Weekly class time in the student's display timezone, e.g. "화·목 15:00–15:20". */
export function formatEnrollmentWeeklySchedule(
  enrollment: StudentEnrollment,
  locale: Locale = "ko"
): string | null {
  const days = enrollmentScheduleDays(enrollment);
  const start = enrollment.preferredSlotTime as SlotStartTime | undefined;
  if (!days.length || !start) return null;
  return formatUnifiedSlotLabel(days, start, locale, enrollmentSessionMinutes(enrollment));
}

/**
 * Strip leftover English weekday tags from curriculum notes
 * ("Exam prep Tue/Thu" → "Exam prep"). Hide empty / generic values.
 */
export function formatEnrollmentCurriculum(curriculum: string | undefined): string | null {
  const trimmed = curriculum?.trim() ?? "";
  if (!trimmed || /^general english$/i.test(trimmed)) return null;
  const withoutDays = trimmed
    .replace(
      /[\s,/·-]*\b(mon|tue|wed|thu|fri|sat|sun)(\s*[/,·-]\s*(mon|tue|wed|thu|fri|sat|sun))*\b\s*$/i,
      ""
    )
    .trim();
  return withoutDays || null;
}

export function getEnrollmentDisplayPeriod(enrollment: StudentEnrollment): {
  start: string;
  end: string;
  tentative: boolean;
} {
  const days = enrollmentScheduleDays(enrollment);
  const sessions = enrollment.sessionsTotal;
  const pending = enrollment.status === "pending_payment";
  let start = enrollment.startDate;
  const slot = enrollment.preferredSlotTime as SlotStartTime | undefined;

  if (pending && !enrollment.renewedFromEnrollmentId && days.length && slot) {
    const firstIso = nextPlanSlotOccurrenceIso(days, slot);
    start = getDateKeyInTimezone(new Date(firstIso), CANONICAL_TIMEZONE);
  } else if (days.length) {
    // Stored contract dates from older data may point at a weekend/non-class day.
    start = nextScheduledDateOnOrAfter(start, days);
  }

  let end = enrollment.endDate;
  const invalidRange = !end || end <= start;
  if ((invalidRange || pending) && days.length && sessions > 0) {
    end = computeContractEndDate(start, sessions, days);
  }

  return { start, end, tentative: pending };
}

const STUDENT_LIST_STATUS_RANK: Record<EnrollmentStatus, number> = {
  pending_payment: 0,
  active: 1,
  expiring_soon: 1,
  completed: 2,
  cancelled: 3,
};

function studentListGroupRank(enrollment: StudentEnrollment): number {
  const base = STUDENT_LIST_STATUS_RANK[enrollment.status] ?? 1;
  if (
    (enrollment.status === "active" || enrollment.status === "expiring_soon") &&
    enrollment.renewedFromEnrollmentId
  ) {
    return base + 0.5;
  }
  return base;
}

function studentListRecencyKey(enrollment: StudentEnrollment): string {
  if (enrollment.confirmedAt) return enrollment.confirmedAt;
  if (enrollment.status === "completed") return `${enrollment.endDate}T23:59:59`;
  return `${enrollment.startDate}T00:00:00`;
}

/** Pending/new first, primary active next, renewal active, then completed (newest first within each group). */
export function sortStudentEnrollmentList(
  enrollments: StudentEnrollment[]
): StudentEnrollment[] {
  return [...enrollments].sort((a, b) => {
    const rankDiff = studentListGroupRank(a) - studentListGroupRank(b);
    if (rankDiff !== 0) return rankDiff;
    return studentListRecencyKey(b).localeCompare(studentListRecencyKey(a));
  });
}
