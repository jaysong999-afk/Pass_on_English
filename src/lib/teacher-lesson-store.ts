import type { Lesson } from "@/types";
import { lessons as SEED_LESSONS } from "@/lib/mock-data";
import { LESSON_MINUTES } from "@/lib/availability/constants";
import { getFeedbackByLesson } from "@/lib/learning-store";
import {
  getDateKeyInTimezone,
  TEACHER_TIMEZONE,
} from "@/lib/availability/timezone";

/** Lessons pinned to the current calendar day (KST) for UI demos. */
const TODAY_DEMO_LESSON_IDS = new Set([
  "lesson-demo-noshow-done",
  "lesson-demo-noshow-target",
  "lesson-demo-active-2",
  "lesson-demo-40min",
  "lesson-demo-60min",
]);

/** Lessons pinned to today + N days (e.g. makeup after no-show). */
const DEMO_DAY_OFFSETS: Record<string, number> = {
  "lesson-demo-noshow-makeup": 7,
};

const DEMO_TIMES: Record<string, string> = {
  "lesson-demo-noshow-done": "10:00",
  "lesson-demo-noshow-target": "11:00",
  "lesson-demo-active-2": "14:00",
  "lesson-demo-noshow-makeup": "11:00",
  "lesson-demo-40min": "16:00",
  "lesson-demo-60min": "18:00",
};

function toKstIso(dateKey: string, time: string): string {
  return `${dateKey}T${time}:00+09:00`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const cursor = new Date(`${dateKey}T12:00:00+09:00`);
  cursor.setDate(cursor.getDate() + days);
  return getDateKeyInTimezone(cursor, TEACHER_TIMEZONE);
}

/**
 * Keep demo lessons on predictable dates for admin operations / no-show testing.
 * Preserves cancelled + teacherNoShow state (gray calendar cells).
 */
function applyTodayDemoDates(source: Lesson[], now = new Date()): Lesson[] {
  const todayKey = getDateKeyInTimezone(now, TEACHER_TIMEZONE);

  return source.map((lesson) => {
    const offset = DEMO_DAY_OFFSETS[lesson.id];
    if (offset !== undefined) {
      const dateKey = addDaysToDateKey(todayKey, offset);
      const time = DEMO_TIMES[lesson.id] ?? "11:00";
      return { ...lesson, scheduledAt: toKstIso(dateKey, time) };
    }

    if (!TODAY_DEMO_LESSON_IDS.has(lesson.id)) return lesson;

    const time = DEMO_TIMES[lesson.id] ?? "10:00";
    const scheduledAt = toKstIso(todayKey, time);

    if (lesson.teacherNoShow && lesson.status === "cancelled") {
      return { ...lesson, scheduledAt };
    }

    if (lesson.status === "reschedule_pending") {
      return { ...lesson, scheduledAt };
    }

    return { ...lesson, scheduledAt, status: "scheduled" };
  });
}

let lessons: Lesson[] = applyTodayDemoDates(structuredClone(SEED_LESSONS));

export function getAllLessons(): Lesson[] {
  return lessons.map((l) => ({ ...l }));
}

export function getTeacherLessons(teacherId: string): Lesson[] {
  return getAllLessons().filter((l) => l.teacherId === teacherId);
}

export function getStudentLessons(studentId: string): Lesson[] {
  return getAllLessons().filter((l) => l.studentId === studentId);
}

export function getLessonById(id: string): Lesson | undefined {
  const lesson = lessons.find((l) => l.id === id);
  return lesson ? { ...lesson } : undefined;
}

export function updateLessonStatus(id: string, status: Lesson["status"]): Lesson | null {
  const index = lessons.findIndex((l) => l.id === id);
  if (index === -1) return null;
  lessons[index] = { ...lessons[index], status };
  return { ...lessons[index] };
}

export function updateLessonSchedule(
  id: string,
  scheduledAt: string,
  status: Lesson["status"] = "scheduled"
): Lesson | null {
  const index = lessons.findIndex((l) => l.id === id);
  if (index === -1) return null;
  lessons[index] = { ...lessons[index], scheduledAt, status };
  return { ...lessons[index] };
}

export function replaceLesson(lesson: Lesson): Lesson {
  const index = lessons.findIndex((l) => l.id === lesson.id);
  if (index === -1) {
    lessons.push({ ...lesson });
  } else {
    lessons[index] = { ...lesson };
  }
  return { ...lesson };
}

export function pushLesson(lesson: Lesson): Lesson {
  lessons.push({ ...lesson });
  return { ...lesson };
}

export function deleteLessonById(id: string): boolean {
  const index = lessons.findIndex((l) => l.id === id);
  if (index === -1) return false;
  lessons.splice(index, 1);
  return true;
}

/** 수강 계약에 연결된 미래 예정 수업 제거 (스케줄 재생성 전) */
export function removeFutureScheduledLessonsForEnrollment(
  enrollmentId: string,
  studentId?: string,
  teacherId?: string
): number {
  const now = Date.now();
  const before = lessons.length;
  lessons = lessons.filter((l) => {
    const linked =
      l.enrollmentId === enrollmentId ||
      (!l.enrollmentId &&
        studentId &&
        teacherId &&
        l.studentId === studentId &&
        l.teacherId === teacherId);
    if (!linked) return true;
    if (!["scheduled", "reschedule_pending"].includes(l.status)) return true;
    return new Date(l.scheduledAt).getTime() < now;
  });
  return before - lessons.length;
}

export function getLessonsAssignedToTeacher(teacherId: string): Lesson[] {
  return getAllLessons().filter(
    (l) => l.teacherId === teacherId || l.payrollTeacherId === teacherId
  );
}

export function completeLesson(id: string): Lesson | null {
  const index = lessons.findIndex((l) => l.id === id);
  if (index === -1) return null;
  const current = lessons[index];
  lessons[index] = {
    ...current,
    status: "completed",
    studentAbsent: false,
    payrollTeacherId: current.payrollTeacherId ?? current.teacherId,
    payrollTeacherName: current.payrollTeacherName ?? current.teacherName,
  };
  return { ...lessons[index] };
}

/** Student no-show: mark complete without feedback; included in payroll (status completed). */
export function completeLessonAsStudentAbsent(id: string): Lesson | null {
  const index = lessons.findIndex((l) => l.id === id);
  if (index === -1) return null;
  const lesson = lessons[index];
  if (lesson.status === "cancelled") return null;
  lessons[index] = { ...lessons[index], status: "completed", studentAbsent: true };
  return { ...lessons[index] };
}

export interface CreateTrialLessonInput {
  teacherId: string;
  teacherName: string;
  studentId: string;
  studentName: string;
  scheduledAt: string;
  durationMinutes?: number;
}

export function createTrialLesson(input: CreateTrialLessonInput): Lesson {
  const lesson: Lesson = {
    id: `lesson-${Date.now()}`,
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    studentId: input.studentId,
    studentName: input.studentName,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? LESSON_MINUTES,
    status: "scheduled",
    isTrial: true,
  };
  lessons.push(lesson);
  return { ...lesson };
}

export function getLessonEndTime(lesson: Lesson): Date {
  const start = new Date(lesson.scheduledAt);
  return new Date(start.getTime() + lesson.durationMinutes * 60 * 1000);
}

export function isLessonEnded(lesson: Lesson, now = new Date()): boolean {
  return getLessonEndTime(lesson) <= now;
}

export function lessonNeedsFeedback(lesson: Lesson, now = new Date()): boolean {
  if (lesson.status === "cancelled" || lesson.status === "completed") return false;
  if (lesson.studentAbsent) return false;
  if (!isLessonEnded(lesson, now)) return false;
  return !getFeedbackByLesson(lesson.id);
}

export function getNextLesson(teacherId: string, now = new Date()): Lesson | undefined {
  return getTeacherLessons(teacherId)
    .filter(
      (l) =>
        l.status === "scheduled" ||
        l.status === "reschedule_pending" ||
        l.status === "pending_payment"
    )
    .filter((l) => new Date(l.scheduledAt) >= now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
}

export function getTodayLessons(teacherId: string, timeZone: string, now = new Date()): Lesson[] {
  const todayKey = getDateKeyInTimezone(now, timeZone);
  return getTeacherLessons(teacherId)
    .filter((l) => {
      if (l.status === "cancelled") return false;
      const key = getDateKeyInTimezone(new Date(l.scheduledAt), timeZone);
      return key === todayKey;
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function getActionRequiredLessons(teacherId: string, now = new Date()): Lesson[] {
  return getTeacherLessons(teacherId)
    .filter((l) => lessonNeedsFeedback(l, now))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/** @internal */
export function resetTeacherLessonStore() {
  lessons = applyTodayDemoDates(structuredClone(SEED_LESSONS));
}

/** Demo lesson IDs for QA (see mock-data.ts). */
export const DEMO_LESSON_IDS = {
  noShowDone: "lesson-demo-noshow-done",
  noShowTarget: "lesson-demo-noshow-target",
  active: "lesson-demo-active-2",
  noShowMakeup: "lesson-demo-noshow-makeup",
} as const;
