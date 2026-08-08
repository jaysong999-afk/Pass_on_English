import { DAY_LABELS } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime, TeacherWeeklyAvailability, WeeklySlotMap } from "@/lib/availability/types";
import {
  emptyWeeklySlotMap,
  normalizeSlotStart,
  sortSlotTimes,
  toggleTimeInList,
} from "@/lib/availability/time-utils";

const SEED: Record<string, WeeklySlotMap> = {
  "teacher-1": {
    Mon: ["09:00", "09:20", "09:40", "10:00", "14:00", "14:20", "16:00", "16:20", "18:00", "18:20", "18:40"],
    Tue: ["09:00", "09:20", "10:00", "10:20", "11:00", "16:00", "16:20", "18:00", "18:20", "18:40"],
    Wed: ["09:00", "10:00", "10:20", "15:00", "15:20", "16:00", "16:20", "18:00", "18:20", "18:40"],
    Thu: ["10:00", "10:20", "10:40", "16:00", "16:20", "18:00", "18:20", "18:40"],
    Fri: ["09:00", "09:20", "10:00", "16:00", "16:20", "18:00", "18:20", "18:40"],
    Sat: ["10:00", "10:20", "16:00", "16:20", "18:00", "18:20", "18:40"],
    Sun: [],
  },
  "teacher-2": {
    Mon: ["09:00", "09:20", "11:00", "19:00", "19:20"],
    Tue: [],
    Wed: ["09:00", "14:00", "14:20"],
    Thu: [],
    Fri: ["09:00", "11:00", "11:20"],
    Sat: [],
    Sun: [],
  },
  "teacher-3": {
    Mon: [],
    Tue: ["09:00", "09:20", "15:00", "15:20"],
    Wed: [],
    Thu: ["10:00", "10:20"],
    Fri: [],
    Sat: ["09:00", "14:00", "14:20"],
    Sun: ["10:00", "15:00", "15:20"],
  },
};

const store = new Map<string, WeeklySlotMap>();

function cloneMap(map: WeeklySlotMap): WeeklySlotMap {
  const next = emptyWeeklySlotMap();
  for (const day of DAY_LABELS) {
    next[day] = [...map[day]];
  }
  return next;
}

function normalizeMap(map: WeeklySlotMap): WeeklySlotMap {
  const next = emptyWeeklySlotMap();
  for (const day of DAY_LABELS) {
    next[day] = sortSlotTimes(
      (map[day] ?? []).map((t) => normalizeSlotStart(t))
    );
  }
  return next;
}

function ensureTeacher(teacherId: string): WeeklySlotMap {
  if (!store.has(teacherId)) {
    store.set(teacherId, cloneMap(SEED[teacherId] ?? emptyWeeklySlotMap()));
  }
  return store.get(teacherId)!;
}

export function getTeacherWeeklyAvailability(teacherId: string): TeacherWeeklyAvailability {
  const slots = cloneMap(normalizeMap(ensureTeacher(teacherId)));
  return {
    teacherId,
    slots,
    updatedAt: new Date().toISOString(),
  };
}

export function setTeacherWeeklyAvailability(teacherId: string, slots: WeeklySlotMap): TeacherWeeklyAvailability {
  store.set(teacherId, normalizeMap(slots));
  return getTeacherWeeklyAvailability(teacherId);
}

export function toggleTeacherSlot(
  teacherId: string,
  day: DayLabel,
  startTime: SlotStartTime
): TeacherWeeklyAvailability {
  const current = ensureTeacher(teacherId);
  const normalized = normalizeSlotStart(startTime);
  current[day] = toggleTimeInList(current[day], normalized);
  store.set(teacherId, current);
  return getTeacherWeeklyAvailability(teacherId);
}

export function copyTeacherDaySlots(
  teacherId: string,
  sourceDay: DayLabel,
  targetDays: DayLabel[]
): TeacherWeeklyAvailability {
  const current = ensureTeacher(teacherId);
  const sourceTimes = [...current[sourceDay]];
  for (const day of targetDays) {
    if (day === sourceDay) continue;
    current[day] = sortSlotTimes([...sourceTimes]);
  }
  store.set(teacherId, current);
  return getTeacherWeeklyAvailability(teacherId);
}

export function isSlotEnabled(teacherId: string, day: DayLabel, startTime: SlotStartTime): boolean {
  const map = ensureTeacher(teacherId);
  return map[day].includes(normalizeSlotStart(startTime));
}

/** @internal */
export function resetTeacherAvailabilityStore() {
  store.clear();
}
