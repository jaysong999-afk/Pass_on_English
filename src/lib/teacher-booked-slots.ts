import type { LessonStatus, StudentEnrollment } from "@/types";
import { DAY_LABELS } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { occupiedBlocksForSession } from "@/lib/availability/slot-continuity";
import { lessonScheduledAtToKstSlot } from "@/lib/availability/timezone";
import { parseSlotKey, slotKey, occupiedSlotStarts, normalizeSlotStart } from "@/lib/availability/time-utils";
import { getAllLessons } from "@/lib/teacher-lesson-store";
import { getAllEnrollments } from "@/lib/enrollment-store-sync";
import {
  buildEnrollmentSlotTime,
  getEnrollmentScheduleDays,
  getEnrollmentSessionMinutes,
} from "@/lib/lesson-scheduler-core";

const ACTIVE_LESSON_STATUSES: LessonStatus[] = [
  "scheduled",
  "reschedule_pending",
  "pending_payment",
];

/** Extra reservations (e.g. trial just booked) until persisted as lessons */
const reservations = new Map<
  string,
  { studentId?: string; studentName?: string; sessionMinutes?: number }
>();

export interface BookedSlotInfo {
  day: DayLabel;
  start: SlotStartTime;
  lessonId?: string;
  studentId?: string;
  studentName?: string;
  source: "lesson" | "reservation";
}

export interface SlotOwnerIgnore {
  studentId?: string;
  studentName?: string;
}

function reservationKey(teacherId: string, day: DayLabel, start: SlotStartTime) {
  return `${teacherId}|${slotKey(day, start)}`;
}

function enrollmentHoldsWeeklySlot(enrollment: StudentEnrollment): boolean {
  if (enrollment.paymentStatus === "rejected") return false;
  if (enrollment.status === "pending_payment") return true;
  return (
    ["active", "expiring_soon"].includes(enrollment.status) && enrollment.sessionsRemaining > 0
  );
}

export function getOccupiedWeeklySlots(): Array<{
  teacherId: string;
  day: DayLabel;
  start: SlotStartTime;
}> {
  const seen = new Set<string>();
  const slots: Array<{ teacherId: string; day: DayLabel; start: SlotStartTime }> = [];

  const add = (teacherId: string, day: DayLabel, start: SlotStartTime) => {
    const key = `${teacherId}|${slotKey(day, start)}`;
    if (seen.has(key)) return;
    seen.add(key);
    slots.push({ teacherId, day, start });
  };

  for (const lesson of getAllLessons()) {
    if (!ACTIVE_LESSON_STATUSES.includes(lesson.status)) continue;
    const { day, start } = lessonScheduledAtToKstSlot(lesson.scheduledAt);
    for (const blockStart of occupiedSlotStarts(start as SlotStartTime, lesson.durationMinutes)) {
      add(lesson.teacherId, day, blockStart);
    }
  }

  for (const enrollment of getAllEnrollments()) {
    if (!enrollmentHoldsWeeklySlot(enrollment)) continue;
    const days = getEnrollmentScheduleDays(enrollment);
    const start = buildEnrollmentSlotTime(enrollment);
    const minutes = getEnrollmentSessionMinutes(enrollment);
    for (const day of days) {
      for (const block of occupiedSlotStarts(start, minutes)) {
        add(enrollment.teacherId, day, block);
      }
    }
  }

  return slots;
}

export function getBookedSlotsForTeacher(teacherId: string): BookedSlotInfo[] {
  const map = new Map<string, BookedSlotInfo>();

  for (const lesson of getAllLessons()) {
    if (lesson.teacherId !== teacherId) continue;
    if (!ACTIVE_LESSON_STATUSES.includes(lesson.status)) continue;

    const { day, start } = lessonScheduledAtToKstSlot(lesson.scheduledAt);
    const blocks = occupiedSlotStarts(start as SlotStartTime, lesson.durationMinutes);

    for (const blockStart of blocks) {
      const key = slotKey(day, blockStart);
      map.set(key, {
        day,
        start: blockStart,
        lessonId: lesson.id,
        studentId: lesson.studentId,
        studentName: lesson.studentName,
        source: "lesson",
      });
    }
  }

  for (const enrollment of getAllEnrollments()) {
    if (enrollment.teacherId !== teacherId) continue;
    if (!enrollmentHoldsWeeklySlot(enrollment)) continue;
    const days = getEnrollmentScheduleDays(enrollment);
    const start = buildEnrollmentSlotTime(enrollment);
    const minutes = getEnrollmentSessionMinutes(enrollment);
    for (const day of days) {
      for (const blockStart of occupiedSlotStarts(start, minutes)) {
        const key = slotKey(day, blockStart);
        if (map.has(key)) continue;
        map.set(key, {
          day,
          start: blockStart,
          studentId: enrollment.studentId,
          source: "reservation",
        });
      }
    }
  }

  for (const [key, meta] of reservations.entries()) {
    if (!key.startsWith(`${teacherId}|`)) continue;
    const slotPart = key.slice(teacherId.length + 1);
    const { day, start } = parseSlotKey(slotPart);
    const existing = map.get(slotPart);
    if (!existing) {
      map.set(slotPart, {
        day,
        start,
        studentId: meta.studentId,
        studentName: meta.studentName,
        source: "reservation",
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    const dayDiff = DAY_LABELS.indexOf(a.day) - DAY_LABELS.indexOf(b.day);
    if (dayDiff !== 0) return dayDiff;
    return a.start.localeCompare(b.start);
  });
}

export function isSlotBooked(teacherId: string, day: DayLabel, start: SlotStartTime): boolean {
  const key = slotKey(day, start);
  return getBookedSlotsForTeacher(teacherId).some((b) => slotKey(b.day, b.start) === key);
}

function bookingBelongsToIgnore(booking: BookedSlotInfo, ignore?: SlotOwnerIgnore): boolean {
  if (!ignore) return false;
  if (ignore.studentId && booking.studentId === ignore.studentId) return true;
  if (ignore.studentName && booking.studentName && booking.studentName === ignore.studentName) {
    return true;
  }
  return false;
}

/** True when this student already holds the weekly block (reservation or their lesson). */
export function isSlotHeldByStudent(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  ignore?: SlotOwnerIgnore
): boolean {
  if (!ignore) return false;
  const key = slotKey(day, start);
  return getBookedSlotsForTeacher(teacherId).some((booking) => {
    if (slotKey(booking.day, booking.start) !== key) return false;
    return bookingBelongsToIgnore(booking, ignore);
  });
}

/** True when another learner occupies this block (this student's trial/hold does not count). */
export function isSlotOccupiedByOtherStudent(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  ignore?: SlotOwnerIgnore
): boolean {
  const key = slotKey(day, start);
  return getBookedSlotsForTeacher(teacherId).some((booking) => {
    if (slotKey(booking.day, booking.start) !== key) return false;
    if (bookingBelongsToIgnore(booking, ignore)) return false;
    if (ignore && !booking.studentId) return false;
    return true;
  });
}

/** Student already has an active lesson at this weekly clock time with this teacher. */
export function studentOwnsWeeklyStart(
  teacherId: string,
  start: SlotStartTime,
  studentId: string
): boolean {
  const normalized = normalizeSlotStart(start);
  return getAllLessons().some((lesson) => {
    if (lesson.studentId !== studentId || lesson.teacherId !== teacherId) return false;
    if (!ACTIVE_LESSON_STATUSES.includes(lesson.status)) return false;
    const slot = lessonScheduledAtToKstSlot(lesson.scheduledAt);
    return slot.start === normalized;
  });
}

export function reserveTeacherWeeklySlot(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  studentName?: string,
  sessionMinutes?: number,
  studentId?: string
): void {
  reservations.set(reservationKey(teacherId, day, start), {
    studentId,
    studentName,
    sessionMinutes,
  });
}

/**
 * Atomically reserve all consecutive blocks for a session on one day.
 */
export function reserveTeacherSessionOnDay(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  sessionMinutes: number,
  studentName?: string,
  studentId?: string
): void {
  for (const block of occupiedBlocksForSession(start, sessionMinutes)) {
    reserveTeacherWeeklySlot(teacherId, day, block, studentName, sessionMinutes, studentId);
  }
}

/** Reserve the same weekly session on every plan day (all blocks per day). */
export function reserveTeacherWeeklySlotsForPlan(
  teacherId: string,
  planDays: DayLabel[],
  start: SlotStartTime,
  studentName?: string,
  sessionMinutes: number = 20,
  studentId?: string
): void {
  for (const day of planDays) {
    reserveTeacherSessionOnDay(teacherId, day, start, sessionMinutes, studentName, studentId);
  }
}

export function releaseTeacherWeeklySlot(teacherId: string, day: DayLabel, start: SlotStartTime): void {
  reservations.delete(reservationKey(teacherId, day, start));
}

/** Release all blocks for a weekly session across plan days. */
export function releaseTeacherWeeklySlotsForPlan(
  teacherId: string,
  planDays: DayLabel[],
  start: SlotStartTime,
  sessionMinutes: number = 20
): void {
  for (const day of planDays) {
    for (const block of occupiedBlocksForSession(start, sessionMinutes)) {
      releaseTeacherWeeklySlot(teacherId, day, block);
    }
  }
}

/** @internal */
export function clearTeacherReservations() {
  reservations.clear();
}
