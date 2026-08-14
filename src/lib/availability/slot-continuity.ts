import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import {
  generateGridStartTimes,
  normalizeSlotStart,
  occupiedSlotStarts,
  slotsForSessionMinutes,
} from "@/lib/availability/time-utils";
import { isSlotEnabled } from "@/lib/teacher-availability-store-sync";
import {
  isSlotBooked,
  isSlotOccupiedByOtherStudent,
  type SlotOwnerIgnore,
} from "@/lib/teacher-booked-slots";

const GRID_START_SET = new Set(generateGridStartTimes());

/** All consecutive 20-min blocks for a session fit on the daily grid (no wrap past 24:00). */
export function sessionBlocksFitGrid(start: SlotStartTime, sessionMinutes: number): boolean {
  const blocks = occupiedSlotStarts(normalizeSlotStart(start), sessionMinutes);
  return blocks.length === slotsForSessionMinutes(sessionMinutes) && blocks.every((b) => GRID_START_SET.has(b));
}

/** Single day: every block enabled and not booked. */
export function canBookSessionAt(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  sessionMinutes: number,
  ignore?: SlotOwnerIgnore
): boolean {
  const normalized = normalizeSlotStart(start);
  if (!sessionBlocksFitGrid(normalized, sessionMinutes)) return false;

  const blocks = occupiedSlotStarts(normalized, sessionMinutes);

  if (ignore?.studentId || ignore?.studentName) {
    return blocks.every(
      (block) => !isSlotOccupiedByOtherStudent(teacherId, day, block, ignore)
    );
  }

  return blocks.every(
    (block) => isSlotEnabled(teacherId, day, block) && !isSlotBooked(teacherId, day, block)
  );
}

/** Unified weekly time: valid on every plan day. */
export function canBookSessionOnAllPlanDays(
  teacherId: string,
  scheduleDays: string[],
  start: SlotStartTime,
  sessionMinutes: number,
  ignore?: SlotOwnerIgnore
): boolean {
  const days = scheduleDays as DayLabel[];
  if (days.length === 0) return false;
  return days.every((day) => canBookSessionAt(teacherId, day, start, sessionMinutes, ignore));
}

/** Valid session start times for a teacher + plan (all schedule days). */
export function getValidSessionStartTimes(
  teacherId: string,
  scheduleDays: string[],
  sessionMinutes: number
): SlotStartTime[] {
  return generateGridStartTimes().filter((start) =>
    canBookSessionOnAllPlanDays(teacherId, scheduleDays, start, sessionMinutes)
  );
}

export function occupiedBlocksForSession(
  start: SlotStartTime,
  sessionMinutes: number
): SlotStartTime[] {
  return occupiedSlotStarts(normalizeSlotStart(start), sessionMinutes);
}
