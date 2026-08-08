import type { Lesson } from "@/types";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { snapIsoToSlotGrid } from "@/lib/availability/time-utils";

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CANONICAL_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function fromDatetimeLocalValue(value: string): string {
  if (!value) return "";
  const iso = new Date(`${value}:00+09:00`).toISOString();
  return snapIsoToSlotGrid(iso, CANONICAL_TIMEZONE);
}

export function adminLessonStatusLabel(lesson: Lesson): string {
  if (lesson.teacherNoShow) return "선생님 노쇼";
  if (lesson.adminCancelledUnpaid) return "무급 취소";
  if (lesson.originalTeacherId && lesson.originalTeacherId !== lesson.teacherId) {
    return "대체 배정";
  }
  const map: Record<Lesson["status"], string> = {
    scheduled: "예정",
    completed: "완료",
    cancelled: "취소",
    reschedule_pending: "변경 대기",
    pending_payment: "결제 대기",
  };
  return map[lesson.status] ?? lesson.status;
}

export function isActiveUpcomingLesson(lesson: Lesson): boolean {
  return lesson.status === "scheduled" || lesson.status === "reschedule_pending";
}

export function isLessonTodayKst(lesson: Lesson, now = new Date()): boolean {
  const todayKey = getDateKeyInTimezone(now, CANONICAL_TIMEZONE);
  const lessonKey = getDateKeyInTimezone(new Date(lesson.scheduledAt), CANONICAL_TIMEZONE);
  return todayKey === lessonKey;
}

export function sortLessonsBySchedule(a: Lesson, b: Lesson): number {
  return a.scheduledAt.localeCompare(b.scheduledAt);
}
