import { DAY_LABELS } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime, TeacherWeeklyAvailability, WeeklySlotMap } from "@/lib/availability/types";
import {
  emptyWeeklySlotMap,
  normalizeSlotStart,
} from "@/lib/availability/time-utils";
import {
  getCachedWeeklySlots,
} from "@/lib/teacher-availability/availability-cache";

function cloneMap(map: WeeklySlotMap): WeeklySlotMap {
  const next = emptyWeeklySlotMap();
  for (const day of DAY_LABELS) {
    next[day] = [...map[day]];
  }
  return next;
}

export function getTeacherWeeklyAvailability(teacherId: string): TeacherWeeklyAvailability {
  const cached = getCachedWeeklySlots(teacherId);
  const slots = cloneMap(cached ?? emptyWeeklySlotMap());
  return {
    teacherId,
    slots,
    updatedAt: new Date().toISOString(),
  };
}

export function isSlotEnabled(teacherId: string, day: DayLabel, startTime: SlotStartTime): boolean {
  const cached = getCachedWeeklySlots(teacherId);
  if (!cached) return false;
  return cached[day].includes(normalizeSlotStart(startTime));
}

/** @internal */
export function resetTeacherAvailabilityStore() {
  // Cache is populated from Supabase; use clearTeacherAvailabilityCache in tests.
}
