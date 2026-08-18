import type { Lesson } from "@/types";
import { LESSON_MINUTES } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { getFeedbackByLesson } from "@/lib/learning-store-sync";
import {
  getLessonCache,
  patchLessonInCache,
  removeLessonFromCache,
  setLessonCache,
} from "@/lib/lessons/lesson-cache";

function cloneLesson(lesson: Lesson): Lesson {
  return { ...lesson };
}

export function getAllLessons(): Lesson[] {
  return getLessonCache().map(cloneLesson);
}

export function getTeacherLessons(teacherId: string): Lesson[] {
  return getAllLessons().filter((l) => l.teacherId === teacherId);
}

export function getStudentLessons(studentId: string): Lesson[] {
  return getAllLessons().filter((l) => l.studentId === studentId);
}

export function getLessonById(id: string): Lesson | undefined {
  const lesson = getLessonCache().find((l) => l.id === id);
  return lesson ? cloneLesson(lesson) : undefined;
}

export function pushLesson(lesson: Lesson): Lesson {
  patchLessonInCache(lesson);
  return cloneLesson(lesson);
}

export function replaceLesson(lesson: Lesson): Lesson {
  return pushLesson(lesson);
}

export function deleteLessonById(id: string): boolean {
  if (!getLessonById(id)) return false;
  removeLessonFromCache(id);
  return true;
}

export function removeFutureScheduledLessonsForEnrollment(
  enrollmentId: string,
  studentId?: string,
  teacherId?: string
): number {
  const now = Date.now();
  const before = getLessonCache().length;
  setLessonCache(
    getLessonCache().filter((l) => {
      if (l.isTrial) return true;
      const linked =
        l.enrollmentId === enrollmentId ||
        (!l.enrollmentId && studentId && teacherId && l.studentId === studentId && l.teacherId === teacherId);
      if (!linked) return true;
      if (!["scheduled", "reschedule_pending"].includes(l.status)) return true;
      return new Date(l.scheduledAt).getTime() < now;
    })
  );
  return before - getLessonCache().length;
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
  return pushLesson(lesson);
}

export function updateLessonStatus(id: string, status: Lesson["status"]): Lesson | null {
  const lesson = getLessonById(id);
  if (!lesson) return null;
  const updated = { ...lesson, status };
  patchLessonInCache(updated);
  return cloneLesson(updated);
}

export function updateLessonSchedule(
  id: string,
  scheduledAt: string,
  status: Lesson["status"] = "scheduled"
): Lesson | null {
  const lesson = getLessonById(id);
  if (!lesson) return null;
  const updated = { ...lesson, scheduledAt, status };
  patchLessonInCache(updated);
  return cloneLesson(updated);
}

export function completeLesson(id: string): Lesson | null {
  const lesson = getLessonById(id);
  if (!lesson) return null;
  const updated: Lesson = {
    ...lesson,
    status: "completed",
    studentAbsent: false,
    payrollTeacherId: lesson.payrollTeacherId ?? lesson.teacherId,
    payrollTeacherName: lesson.payrollTeacherName ?? lesson.teacherName,
  };
  patchLessonInCache(updated);
  return cloneLesson(updated);
}

export function completeLessonAsStudentAbsent(id: string): Lesson | null {
  const lesson = getLessonById(id);
  if (!lesson || lesson.status === "cancelled") return null;
  const updated = { ...lesson, status: "completed" as const, studentAbsent: true };
  patchLessonInCache(updated);
  return cloneLesson(updated);
}

export function getLessonsAssignedToTeacher(teacherId: string): Lesson[] {
  return getAllLessons().filter((l) => l.teacherId === teacherId || l.payrollTeacherId === teacherId);
}

export function getLessonEndTime(lesson: Lesson): Date {
  const start = new Date(lesson.scheduledAt);
  return new Date(start.getTime() + lesson.durationMinutes * 60 * 1000);
}

export function isLessonEnded(lesson: Lesson, now = new Date()): boolean {
  return getLessonEndTime(lesson) <= now;
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
    .filter((l) => {
      if (l.status === "cancelled" || l.status === "completed") return false;
      if (l.studentAbsent) return false;
      if (!isLessonEnded(l, now)) return false;
      return !getFeedbackByLesson(l.id);
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function lessonNeedsFeedback(lesson: Lesson, now = new Date()): boolean {
  if (lesson.status === "cancelled" || lesson.status === "completed") return false;
  if (lesson.studentAbsent) return false;
  if (!isLessonEnded(lesson, now)) return false;
  return !getFeedbackByLesson(lesson.id);
}

export function resetTeacherLessonStore() {
  setLessonCache([]);
}
