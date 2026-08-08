import type { Teacher } from "@/types";
import type { Locale } from "@/lib/i18n/config";
import { DAY_LABELS, LESSON_MINUTES, SLOT_BLOCK_MINUTES } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime, TeacherScheduleSlotView, WeeklySlotMap } from "@/lib/availability/types";
import {
  dayLabelToDow,
  generateGridStartTimes,
  sessionEndTime,
  slotEndTime,
  slotKey,
} from "@/lib/availability/time-utils";
import { getValidSessionStartTimes, canBookSessionAt } from "@/lib/availability/slot-continuity";
import { getTeacherWeeklyAvailability, isSlotEnabled } from "@/lib/teacher-availability-store";
import { getBookedSlotsForTeacher } from "@/lib/teacher-booked-slots";
import {
  formatGridTimeLabel,
  formatSlotTimeInTimezone,
  getStudentTimezone,
  kstSlotToDate,
  nextKstSlotOccurrenceIso,
} from "@/lib/availability/timezone";

export type { DayLabel, SlotStartTime, TeacherScheduleSlotView, WeeklySlotMap };
export { DAY_LABELS, SLOT_BLOCK_MINUTES, generateGridStartTimes };

/** @deprecated Use TeacherScheduleSlotView — kept for enrollment flow compatibility */
export interface TeacherScheduleSlot {
  id: string;
  teacherId: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  isOpen: boolean;
  /** Plan session length used to compute endTime and block count */
  sessionMinutes: number;
  blockCount: number;
}

export interface TeacherAvailabilitySummary {
  teacher: Teacher;
  openSlotCount: number;
}

export interface SortedTeachersForPlan {
  available: TeacherAvailabilitySummary[];
  closed: TeacherAvailabilitySummary[];
}

export function buildScheduleSlotViews(
  teacherId: string,
  filterDays?: DayLabel[]
): TeacherScheduleSlotView[] {
  const availability = getTeacherWeeklyAvailability(teacherId);
  const booked = getBookedSlotsForTeacher(teacherId);
  const bookedMap = new Map(booked.map((b) => [slotKey(b.day, b.start), b]));
  const days = filterDays ?? DAY_LABELS;
  const gridTimes = generateGridStartTimes();
  const views: TeacherScheduleSlotView[] = [];

  for (const day of days) {
    for (const start of gridTimes) {
      const enabled = availability.slots[day].includes(start);
      if (!enabled && !bookedMap.has(slotKey(day, start))) continue;

      const booking = bookedMap.get(slotKey(day, start));
      const isBooked = Boolean(booking);
      views.push({
        id: `${teacherId}-${day}-${start}`,
        teacherId,
        dayOfWeek: dayLabelToDow(day),
        dayLabel: day,
        startTime: start,
        endTime: slotEndTime(start),
        isEnabled: enabled,
        isOpen: enabled && !isBooked,
        isBooked,
        lessonId: booking?.lessonId,
        studentName: booking?.studentName,
      });
    }
  }

  return views;
}

/** Times open on every plan day for a given session length. */
export function getUnifiedOpenSlotTimesForTeacher(
  teacherId: string,
  scheduleDays: string[],
  sessionMinutes: number = LESSON_MINUTES
): SlotStartTime[] {
  return getValidSessionStartTimes(teacherId, scheduleDays, sessionMinutes);
}

export function getOpenSlotsForTeacher(
  teacherId: string,
  scheduleDays: string[],
  sessionMinutes: number = LESSON_MINUTES
): TeacherScheduleSlot[] {
  const days = scheduleDays as DayLabel[];
  const primaryDay = days[0] ?? "Mon";
  const blockCount = Math.max(1, Math.ceil(sessionMinutes / SLOT_BLOCK_MINUTES));

  return getUnifiedOpenSlotTimesForTeacher(teacherId, scheduleDays, sessionMinutes).map(
    (start) => ({
      id: `${teacherId}-unified-${start}-${sessionMinutes}`,
      teacherId,
      dayOfWeek: dayLabelToDow(primaryDay),
      dayLabel: primaryDay,
      startTime: start,
      endTime: sessionEndTime(start, sessionMinutes),
      isOpen: true,
      sessionMinutes,
      blockCount,
    })
  );
}

export function countOpenSlotsForTeacher(
  teacherId: string,
  scheduleDays: string[],
  sessionMinutes: number = LESSON_MINUTES
): number {
  return getUnifiedOpenSlotTimesForTeacher(teacherId, scheduleDays, sessionMinutes).length;
}

export function sortTeachersByPlanAvailability(
  teachers: Teacher[],
  scheduleDays: string[],
  sessionMinutes: number = LESSON_MINUTES
): SortedTeachersForPlan {
  const summaries = teachers
    .filter((t) => t.status === "active")
    .map((teacher) => ({
      teacher,
      openSlotCount: countOpenSlotsForTeacher(teacher.id, scheduleDays, sessionMinutes),
    }));

  const available = summaries
    .filter((s) => s.openSlotCount > 0)
    .sort((a, b) => b.openSlotCount - a.openSlotCount);

  const closed = summaries
    .filter((s) => s.openSlotCount === 0)
    .sort((a, b) => a.teacher.displayName.localeCompare(b.teacher.displayName));

  return { available, closed };
}

export function formatSlotLabel(
  slot: Pick<TeacherScheduleSlot, "dayLabel" | "startTime" | "endTime">,
  locale: Locale = "ko"
): string {
  const tz = getStudentTimezone(locale);
  const day = slot.dayLabel as DayLabel;
  const start = formatSlotTimeInTimezone(day, slot.startTime as SlotStartTime, tz);
  const end = formatSlotTimeInTimezone(day, slot.endTime as SlotStartTime, tz);
  return `${slot.dayLabel} ${start}–${end}`;
}

export function formatSlotTimeRange(
  slot: Pick<TeacherScheduleSlot, "dayLabel" | "startTime" | "endTime">,
  locale: Locale = "ko"
): string {
  const tz = getStudentTimezone(locale);
  const day = slot.dayLabel as DayLabel;
  const start = formatSlotTimeInTimezone(day, slot.startTime as SlotStartTime, tz);
  const end = formatSlotTimeInTimezone(day, slot.endTime as SlotStartTime, tz);
  return `${start}–${end}`;
}

/** Label for a unified weekly time applied to all plan days. */
export function formatUnifiedSlotLabel(
  scheduleDays: string[],
  startTime: SlotStartTime,
  locale: Locale = "ko",
  sessionMinutes: number = LESSON_MINUTES
): string {
  const tz = getStudentTimezone(locale);
  const endTime = sessionEndTime(startTime, sessionMinutes);
  const start = formatGridTimeLabel(startTime, tz);
  const end = formatGridTimeLabel(endTime as SlotStartTime, tz);
  return `${formatScheduleDays(scheduleDays, locale)} ${start}–${end}`;
}

export function formatUnifiedSlotTimeRange(
  startTime: SlotStartTime,
  locale: Locale = "ko",
  sessionMinutes: number = LESSON_MINUTES
): string {
  const tz = getStudentTimezone(locale);
  const endTime = sessionEndTime(startTime, sessionMinutes);
  return `${formatGridTimeLabel(startTime, tz)}–${formatGridTimeLabel(endTime as SlotStartTime, tz)}`;
}

export function nextOccurrenceIso(dayOfWeek: number, startTime: string): string {
  return nextKstSlotOccurrenceIso(dayOfWeek, startTime as SlotStartTime);
}

/** Earliest upcoming KST slot among plan days at the given weekly time. */
export function nextPlanSlotOccurrenceIso(
  scheduleDays: string[],
  startTime: SlotStartTime
): string {
  const days = scheduleDays as DayLabel[];
  const now = new Date();
  let best: Date | null = null;

  for (const day of days) {
    let candidate = kstSlotToDate(day, startTime);
    while (candidate <= now) {
      candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    if (!best || candidate < best) {
      best = candidate;
    }
  }

  if (!best && days.length > 0) {
    return kstSlotToDate(days[0], startTime).toISOString();
  }

  return best!.toISOString();
}

export function groupSlotsByDay(slots: TeacherScheduleSlot[]): Map<string, TeacherScheduleSlot[]> {
  const map = new Map<string, TeacherScheduleSlot[]>();
  for (const slot of slots) {
    const list = map.get(slot.dayLabel) ?? [];
    list.push(slot);
    map.set(slot.dayLabel, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return map;
}

export function teacherHasEnabledSlot(teacherId: string, day: DayLabel, start: SlotStartTime): boolean {
  return isSlotEnabled(teacherId, day, start);
}

export function teacherSlotIsBookable(
  teacherId: string,
  day: DayLabel,
  start: SlotStartTime,
  sessionMinutes: number = LESSON_MINUTES
): boolean {
  return canBookSessionAt(teacherId, day, start, sessionMinutes);
}

const SCHEDULE_DAY_LABELS: Record<Locale, Record<string, string>> = {
  ko: { Mon: "월", Tue: "화", Wed: "수", Thu: "목", Fri: "금", Sat: "토", Sun: "일" },
  "zh-CN": { Mon: "周一", Tue: "周二", Wed: "周三", Thu: "周四", Fri: "周五", Sat: "周六", Sun: "周日" },
};

export function formatScheduleDays(days: string[], locale: Locale = "ko"): string {
  const labels = SCHEDULE_DAY_LABELS[locale];
  return days.map((d) => labels[d] ?? d).join("·");
}
