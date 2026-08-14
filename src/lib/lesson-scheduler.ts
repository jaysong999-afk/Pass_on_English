import type { Lesson, StudentEnrollment } from "@/types";
import {
  buildEnrollmentSlotTime,
  formatEnrollmentSlotLabel,
  getEnrollmentScheduleDays,
  getEnrollmentSessionMinutes,
} from "@/lib/lesson-scheduler-core";
import {
  futureLessonsForEnrollment,
  adjustEnrollmentSessionsWithScheduleBatchInDb,
  bootstrapActiveEnrollmentSchedulesInDb,
  generateEnrollmentLessonsInDb,
  scheduleLessonsForConfirmedEnrollmentInDb,
  syncEnrollmentScheduleInDb,
  isTeacherSlotFree,
  isTeacherSlotFreeInDb,
} from "@/lib/lessons/schedule-service";
import { getAllLessons } from "@/lib/teacher-lesson-store-sync";

export {
  buildEnrollmentSlotTime,
  getEnrollmentScheduleDays,
  getEnrollmentSessionMinutes,
  formatEnrollmentSlotLabel,
  futureLessonsForEnrollment,
};

export type {
  GenerateEnrollmentLessonsResult,
  AdjustEnrollmentSessionsWithScheduleResult,
} from "@/lib/lessons/schedule-service";

export {
  generateEnrollmentLessonsInDb,
  scheduleLessonsForConfirmedEnrollmentInDb,
  syncEnrollmentScheduleInDb,
  bootstrapActiveEnrollmentSchedulesInDb,
  adjustEnrollmentSessionsWithScheduleBatchInDb,
  isTeacherSlotFree,
  isTeacherSlotFreeInDb,
};

export function futureLessonsForStudentWithTeacher(
  studentId: string,
  teacherId: string
): Lesson[] {
  const now = Date.now();
  return getAllLessons()
    .filter(
      (l) =>
        l.studentId === studentId &&
        l.teacherId === teacherId &&
        ["scheduled", "reschedule_pending"].includes(l.status) &&
        new Date(l.scheduledAt).getTime() >= now
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export interface GenerateEnrollmentLessonsInput {
  enrollment: StudentEnrollment;
  studentName: string;
  count: number;
  startFromDate?: string;
  operationNote?: string;
  replaceExistingFuture?: boolean;
}

/** @deprecated Prefer generateEnrollmentLessonsInDb — sync cache-only fallback */
export function generateEnrollmentLessons(input: GenerateEnrollmentLessonsInput) {
  void input;
  throw new Error("deprecated: use generateEnrollmentLessonsInDb");
}

export function scheduleLessonsForConfirmedEnrollment(enrollmentId: string) {
  void enrollmentId;
  throw new Error("deprecated: use scheduleLessonsForConfirmedEnrollmentInDb");
}

export function syncEnrollmentSchedule(enrollmentId: string) {
  void enrollmentId;
  throw new Error("deprecated: use syncEnrollmentScheduleInDb");
}

export function bootstrapActiveEnrollmentSchedules() {
  throw new Error("deprecated: use bootstrapActiveEnrollmentSchedulesInDb");
}

export function appendNextEnrollmentLesson(
  enrollmentId: string,
  operationNote?: string
): { lesson: Lesson | null; error?: string } {
  void enrollmentId;
  void operationNote;
  throw new Error("deprecated: use adjustEnrollmentSessionsWithScheduleBatchInDb");
}

export function removeLastFutureEnrollmentLesson(
  enrollmentId: string
): { removed: Lesson | null; error?: string } {
  void enrollmentId;
  throw new Error("deprecated: use adjustEnrollmentSessionsWithScheduleBatchInDb");
}

export function adjustEnrollmentSessionsWithScheduleBatch(
  enrollmentId: string,
  delta: number,
  input?: { reason?: string; adminName?: string }
) {
  void enrollmentId;
  void delta;
  void input;
  throw new Error("deprecated: use adjustEnrollmentSessionsWithScheduleBatchInDb");
}

export function adjustEnrollmentSessionsWithSchedule(
  enrollmentId: string,
  delta: 1 | -1,
  input?: { reason?: string; adminName?: string }
) {
  return adjustEnrollmentSessionsWithScheduleBatch(enrollmentId, delta, input);
}
