import type { TeacherAttendancePolicyEvent } from "@/types";

let eventCache: TeacherAttendancePolicyEvent[] = [];

export function setTeacherAttendancePolicyEventCache(events: TeacherAttendancePolicyEvent[]) {
  eventCache = events.map((event) => ({ ...event }));
}

export function getTeacherAttendancePolicyEventCache() {
  return eventCache.map((event) => ({ ...event }));
}

export function upsertTeacherAttendancePolicyEventCache(event: TeacherAttendancePolicyEvent) {
  const index = eventCache.findIndex((current) => current.id === event.id);
  if (index === -1) eventCache.unshift({ ...event });
  else eventCache[index] = { ...event };
}

export function isScheduleChangePerfectAttendanceForfeited(teacherId: string, month: string) {
  return eventCache.some(
    (event) =>
      event.teacherId === teacherId &&
      event.eventMonth === month &&
      event.perfectAttendanceForfeited
  );
}

export function isScheduleChangeQuarterlyBonusReset(teacherId: string, month: string) {
  return eventCache.some(
    (event) =>
      event.teacherId === teacherId &&
      event.eventMonth === month &&
      event.quarterlyBonusReset
  );
}
