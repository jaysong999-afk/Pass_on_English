import type { WeeklySlotMap } from "@/lib/availability/types";

const cache = new Map<string, WeeklySlotMap>();

export function getCachedWeeklySlots(teacherId: string): WeeklySlotMap | undefined {
  return cache.get(teacherId);
}

export function setCachedWeeklySlots(teacherId: string, slots: WeeklySlotMap) {
  cache.set(teacherId, slots);
}

export function clearTeacherAvailabilityCache(teacherId?: string) {
  if (teacherId) {
    cache.delete(teacherId);
  } else {
    cache.clear();
  }
}

export function getAllCachedTeacherIds(): string[] {
  return [...cache.keys()];
}
