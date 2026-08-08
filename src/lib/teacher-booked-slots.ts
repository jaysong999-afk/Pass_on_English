import type { LessonStatus } from "@/types";
import { DAY_LABELS } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { occupiedBlocksForSession } from "@/lib/availability/slot-continuity";
import { lessonScheduledAtToKstSlot } from "@/lib/availability/timezone";
import { parseSlotKey, slotKey, occupiedSlotStarts } from "@/lib/availability/time-utils";
import { getAllLessons } from "@/lib/teacher-lesson-store";

const ACTIVE_LESSON_STATUSES: LessonStatus[] = [
  "scheduled",
  "reschedule_pending",
  "pending_payment",
];

/** Extra reservations (e.g. trial just booked) until persisted as lessons */
const reservations = new Map<string, { studentName?: string; sessionMinutes?: number }>();

export interface BookedSlotInfo {
  day: DayLabel;
  start: SlotStartTime;
  lessonId?: string;
  studentName?: string;
  source: "lesson" | "reservation";
}

function reservationKey(teacherId: string, day: DayLabel, start: SlotStartTime) {
  return `${teacherId}|${slotKey(day, start)}`;
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
        studentName: lesson.studentName,
        source: "lesson",
      });
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

export function reserveTeacherWeeklySlot(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  studentName?: string,
  sessionMinutes?: number
): void {
  reservations.set(reservationKey(teacherId, day, start), { studentName, sessionMinutes });
}

/**
 * Atomically reserve all consecutive blocks for a session on one day.
 */
export function reserveTeacherSessionOnDay(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  sessionMinutes: number,
  studentName?: string
): void {
  for (const block of occupiedBlocksForSession(start, sessionMinutes)) {
    reserveTeacherWeeklySlot(teacherId, day, block, studentName, sessionMinutes);
  }
}

/** Reserve the same weekly session on every plan day (all blocks per day). */
export function reserveTeacherWeeklySlotsForPlan(
  teacherId: string,
  planDays: DayLabel[],
  start: SlotStartTime,
  studentName?: string,
  sessionMinutes: number = 20
): void {
  for (const day of planDays) {
    reserveTeacherSessionOnDay(teacherId, day, start, sessionMinutes, studentName);
  }
}

export function releaseTeacherWeeklySlot(teacherId: string, day: DayLabel, start: SlotStartTime): void {
  reservations.delete(reservationKey(teacherId, day, start));
}

/** @internal */
export function clearTeacherReservations() {
  reservations.clear();
}
