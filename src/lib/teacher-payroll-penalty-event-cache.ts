import type { TeacherPayrollPenaltyEvent } from "@/types";

let penaltyEventCache: TeacherPayrollPenaltyEvent[] = [];

export function setTeacherPayrollPenaltyEventCache(events: TeacherPayrollPenaltyEvent[]) {
  penaltyEventCache = events.map((event) => ({ ...event }));
}

export function upsertTeacherPayrollPenaltyEventCache(event: TeacherPayrollPenaltyEvent) {
  const index = penaltyEventCache.findIndex((current) => current.id === event.id);
  if (index === -1) penaltyEventCache.unshift({ ...event });
  else penaltyEventCache[index] = { ...event };
}

export function getTeacherPayrollPenaltyEventCache() {
  return penaltyEventCache.map((event) => ({ ...event }));
}

export function clearTeacherPayrollPenaltyEventCache() {
  penaltyEventCache = [];
}
