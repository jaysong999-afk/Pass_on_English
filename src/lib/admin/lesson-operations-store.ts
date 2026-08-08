import type { Lesson } from "@/types";
import { CANONICAL_TIMEZONE, LESSON_MINUTES } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import {
  appendAdminLessonOperationLog,
  weekStartKeyFromScheduledAt,
  getAdminLessonOperationLogById,
  markAdminLessonOperationUndone,
} from "@/lib/admin/admin-lesson-operation-log-store";
import {
  adjustEnrollmentSessions,
  getEnrollmentsByStudent,
  getActiveEnrollmentsByTeacher,
  updateEnrollmentTeacher,
  getEnrollmentById,
} from "@/lib/enrollment-store";
import { getStudent } from "@/lib/mock-data";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getPricingPlanById } from "@/lib/pricing-plan-store";
import {
  formatEnrollmentSlotLabel,
  futureLessonsForEnrollment,
  isTeacherSlotFree,
} from "@/lib/lesson-scheduler";
import { getAllTeachers, getTeacherById } from "@/lib/teacher-profile-store";
import { applyTeacherNoShowPenalty, revertTeacherNoShowPenalty } from "@/lib/teacher-payroll-penalty-store";
import {
  getAllLessons,
  getLessonById,
  pushLesson,
  replaceLesson,
  deleteLessonById,
} from "@/lib/teacher-lesson-store";

export interface AvailableTeacherOption {
  teacherId: string;
  teacherName: string;
  hourlyRatePhp: number;
  slotAvailable: boolean;
}

export interface BulkEnrollmentTransferPreview {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  planLabel: string;
  planId: string;
  curriculum: string;
  scheduleDays: string[];
  slotLabel: string;
  sessionsRemaining: number;
  sessionsTotal: number;
  contractStart: string;
  contractEnd: string;
  status: string;
  upcomingLessonCount: number;
  /** 잔여 회차와 예정 스케줄 수 일치 여부 */
  scheduleInSync: boolean;
  upcomingLessons: { id: string; scheduledAt: string }[];
}

export interface BulkEnrollmentTransferItemResult {
  enrollmentId: string;
  studentName: string;
  toTeacherId: string;
  toTeacherName: string;
  enrollmentUpdated: boolean;
  lessonsMoved: number;
  lessonsSkipped: number;
  skipReasons: string[];
}

export interface BulkEnrollmentTransferResult {
  transfers: BulkEnrollmentTransferItemResult[];
  lessonsMoved: Lesson[];
}

/** @deprecated lesson 단위 결과 — 호환용 */
export interface BulkReassignResult {
  reassigned: Lesson[];
  skipped: { lessonId: string; reason: string }[];
}

export function getBulkEnrollmentTransferPreview(
  fromTeacherId: string
): BulkEnrollmentTransferPreview[] {
  return getActiveEnrollmentsByTeacher(fromTeacherId).map((enrollment) => {
    const student = getStudent(enrollment.studentId);
    const studentName = student
      ? getStudentDisplayName(student)
      : enrollment.studentId;
    const plan = getPricingPlanById(enrollment.planId);
    const upcoming = futureLessonsForEnrollment(enrollment.id, fromTeacherId);

    return {
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      studentName,
      planLabel: enrollment.planLabel,
      planId: enrollment.planId,
      curriculum: enrollment.curriculum,
      scheduleDays: plan?.scheduleDays ?? [],
      slotLabel: formatEnrollmentSlotLabel(enrollment),
      sessionsRemaining: enrollment.sessionsRemaining,
      sessionsTotal: enrollment.sessionsTotal,
      contractStart: enrollment.startDate,
      contractEnd: enrollment.endDate,
      status: enrollment.status,
      upcomingLessonCount: upcoming.length,
      scheduleInSync: upcoming.length === enrollment.sessionsRemaining,
      upcomingLessons: upcoming.map((l) => ({
        id: l.id,
        scheduledAt: l.scheduledAt,
      })),
    };
  });
}

/** @deprecated enrollment 단위 preview 사용 */
export function getBulkReassignPreview(fromTeacherId: string) {
  return getBulkEnrollmentTransferPreview(fromTeacherId);
}

export function previewEnrollmentTransferSlots(
  enrollmentId: string,
  fromTeacherId: string,
  toTeacherId: string
): { movableCount: number; totalScheduled: number; canAbsorbAll: boolean } {
  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) {
    return { movableCount: 0, totalScheduled: 0, canAbsorbAll: false };
  }
  const scheduled = futureLessonsForEnrollment(enrollmentId, fromTeacherId);
  let movableCount = 0;
  for (const lesson of scheduled) {
    if (isTeacherSlotFree(toTeacherId, lesson.scheduledAt, lesson.id)) {
      movableCount += 1;
    }
  }
  return {
    movableCount,
    totalScheduled: scheduled.length,
    canAbsorbAll: movableCount === scheduled.length,
  };
}

function monthKeyFromIso(iso: string): string {
  return getDateKeyInTimezone(new Date(iso), CANONICAL_TIMEZONE).slice(0, 7);
}

function activeEnrollmentForStudent(studentId?: string) {
  if (!studentId) return undefined;
  return getEnrollmentsByStudent(studentId).find(
    (e) => e.status === "active" || e.status === "expiring_soon"
  );
}

export { isTeacherSlotFree } from "@/lib/lesson-scheduler";

export function findAvailableTeachersAt(
  scheduledAt: string,
  excludeTeacherId?: string,
  ignoreLessonId?: string
): AvailableTeacherOption[] {
  return getAllTeachers()
    .filter((t) => t.status === "active" && t.id !== excludeTeacherId)
    .map((t) => ({
      teacherId: t.id,
      teacherName: t.displayName,
      hourlyRatePhp: t.hourlyRatePhp,
      slotAvailable: isTeacherSlotFree(t.id, scheduledAt, ignoreLessonId),
    }))
    .sort((a, b) => Number(b.slotAvailable) - Number(a.slotAvailable));
}

function cloneLesson(lesson: Lesson): Lesson {
  return JSON.parse(JSON.stringify(lesson)) as Lesson;
}

function logLessonOperation(input: {
  teacherId: string;
  teacherName: string;
  lesson: Lesson;
  action: import("@/types").AdminLessonOperationType;
  summary: string;
  note?: string;
  undoable?: boolean;
  undoPayload?: import("@/types").AdminLessonOperationUndoPayload;
}) {
  return appendAdminLessonOperationLog({
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    lessonId: input.lesson.id,
    studentName: input.lesson.studentName,
    scheduledAt: input.lesson.scheduledAt,
    weekStartKey: weekStartKeyFromScheduledAt(input.lesson.scheduledAt),
    action: input.action,
    summary: input.summary,
    note: input.note,
    adminName: "관리자",
    undoable: input.undoable ?? false,
    undoPayload: input.undoPayload,
  });
}

export function assignSubstituteTeacher(
  lessonId: string,
  substituteTeacherId: string,
  note?: string
): Lesson {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const substitute = getTeacherById(substituteTeacherId);
  if (!substitute || substitute.status !== "active") {
    throw new Error("substitute_not_available");
  }

  if (!isTeacherSlotFree(substituteTeacherId, lesson.scheduledAt, lessonId)) {
    throw new Error("substitute_slot_unavailable");
  }

  const updated = replaceLesson({
    ...lesson,
    originalTeacherId: lesson.originalTeacherId ?? lesson.teacherId,
    originalTeacherName: lesson.originalTeacherName ?? lesson.teacherName,
    teacherId: substitute.id,
    teacherName: substitute.displayName,
    payrollTeacherId: substitute.id,
    payrollTeacherName: substitute.displayName,
    operationNote: note ?? "대체 선생님 배정",
  });

  logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    action: "assign_substitute",
    summary: `${substitute.displayName} 선생님으로 대체 배정`,
    note: note ?? "대체 선생님 배정",
  });

  return updated;
}

export function markTeacherNoShow(
  lessonId: string,
  options?: { makeupScheduledAt?: string; note?: string }
): { original: Lesson; makeup: Lesson } {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const originalSnapshot = cloneLesson(lesson);
  const month = monthKeyFromIso(lesson.scheduledAt);
  const noShowTeacherId = lesson.originalTeacherId ?? lesson.teacherId;
  const noShowTeacherName = lesson.originalTeacherName ?? lesson.teacherName;

  const cancelled = replaceLesson({
    ...lesson,
    status: "cancelled",
    teacherNoShow: true,
    unpaidForTeacher: true,
    cancelReason: "teacher_no_show",
    payrollTeacherId: noShowTeacherId,
    payrollTeacherName: noShowTeacherName,
    operationNote: options?.note ?? "선생님 노쇼 처리",
  });

  const enrollment = activeEnrollmentForStudent(lesson.studentId);
  if (enrollment) {
    adjustEnrollmentSessions(enrollment.id, {
      deltaRemaining: 1,
      reason: "선생님 노쇼 — 수업 1회 보상",
      adminName: "관리자",
    });
  }

  const makeupAt =
    options?.makeupScheduledAt ??
    new Date(new Date(lesson.scheduledAt).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const makeup = pushLesson({
    id: `lesson-${Date.now()}-mk`,
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName,
    originalTeacherId: noShowTeacherId,
    originalTeacherName: noShowTeacherName,
    studentId: lesson.studentId,
    studentName: lesson.studentName,
    scheduledAt: makeupAt,
    durationMinutes: lesson.durationMinutes,
    status: "scheduled",
    isTrial: false,
    unpaidForTeacher: true,
    payrollTeacherId: noShowTeacherId,
    payrollTeacherName: noShowTeacherName,
    relatedLessonId: lesson.id,
    operationNote: "노쇼 보강 수업 (노쇼 선생님 무급)",
  });

  replaceLesson({ ...cancelled, relatedLessonId: makeup.id });
  applyTeacherNoShowPenalty(noShowTeacherId, month, "선생님 노쇼");

  logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    action: "teacher_no_show",
    summary: "선생님 노쇼 처리 · 보강 수업 생성",
    note: options?.note ?? "선생님 노쇼 처리",
    undoable: true,
    undoPayload: {
      type: "teacher_no_show",
      originalLesson: originalSnapshot,
      makeupLessonId: makeup.id,
      enrollmentId: enrollment?.id,
      enrollmentDeltaRemaining: enrollment ? 1 : 0,
      penaltyTeacherId: noShowTeacherId,
      penaltyMonth: month,
    },
  });

  return { original: cancelled, makeup };
}

export function cancelLessonUnpaid(lessonId: string, note?: string): { deletedLessonId: string } {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending", "pending_payment"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const reason = note?.trim() || "관리자 무급 취소";
  const deletedSnapshot = cloneLesson(lesson);
  const enrollment =
    (lesson.enrollmentId ? getEnrollmentById(lesson.enrollmentId) : undefined) ??
    activeEnrollmentForStudent(lesson.studentId);

  if (enrollment) {
    adjustEnrollmentSessions(enrollment.id, {
      deltaRemaining: -1,
      reason,
      adminName: "관리자",
    });
  }

  if (!deleteLessonById(lessonId)) {
    throw new Error("lesson_not_found");
  }

  logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    action: "cancel_unpaid",
    summary: "무급 취소 · 수업 삭제",
    note: reason,
    undoable: true,
    undoPayload: {
      type: "cancel_unpaid",
      deletedLesson: deletedSnapshot,
      enrollmentId: enrollment?.id,
      enrollmentDeltaRemaining: enrollment ? -1 : 0,
    },
  });

  return { deletedLessonId: lessonId };
}

export function adminRescheduleLesson(
  lessonId: string,
  newScheduledAt: string,
  teacherId?: string
): Lesson {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const targetTeacherId = teacherId ?? lesson.teacherId;
  const teacher = getTeacherById(targetTeacherId);
  if (!teacher) throw new Error("teacher_not_found");

  if (!isTeacherSlotFree(targetTeacherId, newScheduledAt, lessonId)) {
    throw new Error("slot_unavailable");
  }

  const updated: Lesson = {
    ...lesson,
    scheduledAt: newScheduledAt,
    status: "scheduled",
    teacherId: teacher.id,
    teacherName: teacher.displayName,
    operationNote: "관리자 일정 변경",
  };

  if (teacherId && teacherId !== lesson.teacherId) {
    updated.originalTeacherId = lesson.originalTeacherId ?? lesson.teacherId;
    updated.originalTeacherName = lesson.originalTeacherName ?? lesson.teacherName;
    updated.payrollTeacherId = teacher.id;
    updated.payrollTeacherName = teacher.displayName;
  }

  const result = replaceLesson(updated);

  logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    action: "reschedule",
    summary: `일정 변경 → ${newScheduledAt.slice(0, 16).replace("T", " ")}`,
    note: "관리자 일정 변경",
  });

  return result;
}

export function undoAdminLessonOperation(logId: string): void {
  const log = getAdminLessonOperationLogById(logId);
  if (!log) throw new Error("log_not_found");
  if (log.undoneAt) throw new Error("already_undone");
  if (!log.undoable || !log.undoPayload) throw new Error("not_undoable");

  const payload = log.undoPayload;

  if (payload.type === "teacher_no_show") {
    if (!payload.originalLesson || !payload.makeupLessonId) {
      throw new Error("invalid_undo_payload");
    }

    const current = getLessonById(payload.originalLesson.id);
    if (!current || current.status !== "cancelled" || !current.teacherNoShow) {
      throw new Error("lesson_state_changed");
    }

    const makeup = getLessonById(payload.makeupLessonId);
    if (makeup && makeup.status === "completed") {
      throw new Error("makeup_already_completed");
    }
    if (makeup && !["scheduled", "reschedule_pending", "cancelled"].includes(makeup.status)) {
      throw new Error("makeup_not_reversible");
    }

    if (makeup) {
      deleteLessonById(payload.makeupLessonId);
    }

    const restored: Lesson = {
      ...payload.originalLesson,
      status: "scheduled",
      teacherNoShow: undefined,
      unpaidForTeacher: undefined,
      cancelReason: undefined,
      relatedLessonId: undefined,
      operationNote: undefined,
    };

    if (!isTeacherSlotFree(restored.teacherId, restored.scheduledAt, restored.id)) {
      throw new Error("slot_unavailable");
    }

    replaceLesson(restored);

    if (payload.enrollmentId && payload.enrollmentDeltaRemaining) {
      adjustEnrollmentSessions(payload.enrollmentId, {
        deltaRemaining: -payload.enrollmentDeltaRemaining,
        reason: "선생님 노쇼 조치 취소",
        adminName: "관리자",
      });
    }

    if (payload.penaltyTeacherId && payload.penaltyMonth) {
      revertTeacherNoShowPenalty(
        payload.penaltyTeacherId,
        payload.penaltyMonth,
        "선생님 노쇼"
      );
    }
  } else if (payload.type === "cancel_unpaid") {
    if (!payload.deletedLesson) throw new Error("invalid_undo_payload");

    if (getLessonById(payload.deletedLesson.id)) {
      throw new Error("lesson_already_exists");
    }

    const lesson = payload.deletedLesson;
    if (!isTeacherSlotFree(lesson.teacherId, lesson.scheduledAt)) {
      throw new Error("slot_unavailable");
    }

    pushLesson(lesson);

    if (payload.enrollmentId && payload.enrollmentDeltaRemaining) {
      adjustEnrollmentSessions(payload.enrollmentId, {
        deltaRemaining: -payload.enrollmentDeltaRemaining,
        reason: "무급 취소 조치 취소",
        adminName: "관리자",
      });
    }
  } else {
    throw new Error("not_undoable");
  }

  markAdminLessonOperationUndone(logId);
}

export function bulkTransferEnrollmentsFromTeacher(input: {
  fromTeacherId: string;
  transfers: { enrollmentId: string; toTeacherId: string }[];
}): BulkEnrollmentTransferResult {
  const fromTeacher = getTeacherById(input.fromTeacherId);
  const fromTeacherName = fromTeacher?.displayName ?? input.fromTeacherId;
  const allMoved: Lesson[] = [];
  const transfers: BulkEnrollmentTransferItemResult[] = [];

  for (const transfer of input.transfers) {
    const enrollment = getEnrollmentById(transfer.enrollmentId);
    const toTeacher = getTeacherById(transfer.toTeacherId);
    const student = enrollment ? getStudent(enrollment.studentId) : undefined;
    const studentName = student
      ? getStudentDisplayName(student)
      : enrollment?.studentId ?? "—";

    if (!enrollment || enrollment.teacherId !== input.fromTeacherId) {
      transfers.push({
        enrollmentId: transfer.enrollmentId,
        studentName,
        toTeacherId: transfer.toTeacherId,
        toTeacherName: toTeacher?.displayName ?? "—",
        enrollmentUpdated: false,
        lessonsMoved: 0,
        lessonsSkipped: 0,
        skipReasons: ["수강 정보 없음 또는 이관 대상 선생님 불일치"],
      });
      continue;
    }

    if (!toTeacher || toTeacher.status !== "active") {
      transfers.push({
        enrollmentId: transfer.enrollmentId,
        studentName,
        toTeacherId: transfer.toTeacherId,
        toTeacherName: toTeacher?.displayName ?? "—",
        enrollmentUpdated: false,
        lessonsMoved: 0,
        lessonsSkipped: 0,
        skipReasons: ["받는 선생님 unavailable"],
      });
      continue;
    }

    updateEnrollmentTeacher(enrollment.id, toTeacher.id, toTeacher.displayName);

    const scheduled = futureLessonsForEnrollment(enrollment.id, input.fromTeacherId);
    const skipReasons: string[] = [];
    let lessonsMoved = 0;
    let lessonsSkipped = 0;

    for (const lesson of scheduled) {
      if (!isTeacherSlotFree(toTeacher.id, lesson.scheduledAt, lesson.id)) {
        lessonsSkipped += 1;
        skipReasons.push(
          `${lesson.scheduledAt.slice(0, 16)} — 받는 선생님 시간 불가 (기존 스케줄 유지)`
        );
        continue;
      }

      const moved = replaceLesson({
        ...lesson,
        originalTeacherId: lesson.originalTeacherId ?? input.fromTeacherId,
        originalTeacherName: lesson.originalTeacherName ?? fromTeacherName,
        teacherId: toTeacher.id,
        teacherName: toTeacher.displayName,
        payrollTeacherId: toTeacher.id,
        payrollTeacherName: toTeacher.displayName,
        status: "scheduled",
        operationNote: "휴직·퇴직 수강 일괄 이관",
      });
      allMoved.push(moved);
      lessonsMoved += 1;
    }

    transfers.push({
      enrollmentId: enrollment.id,
      studentName,
      toTeacherId: toTeacher.id,
      toTeacherName: toTeacher.displayName,
      enrollmentUpdated: true,
      lessonsMoved,
      lessonsSkipped,
      skipReasons,
    });
  }

  return { transfers, lessonsMoved: allMoved };
}

/** @deprecated bulkTransferEnrollmentsFromTeacher 사용 */
export function bulkReassignTeacherLessons(input: {
  fromTeacherId: string;
  toTeacherId?: string;
  assignments?: { lessonId: string; toTeacherId: string }[];
}): BulkReassignResult {
  if (input.toTeacherId && !input.assignments?.length) {
    const previews = getBulkEnrollmentTransferPreview(input.fromTeacherId);
    const result = bulkTransferEnrollmentsFromTeacher({
      fromTeacherId: input.fromTeacherId,
      transfers: previews.map((p) => ({
        enrollmentId: p.enrollmentId,
        toTeacherId: input.toTeacherId!,
      })),
    });
    return {
      reassigned: result.lessonsMoved,
      skipped: result.transfers.flatMap((t) =>
        t.skipReasons.map((reason) => ({
          lessonId: t.enrollmentId,
          reason,
        }))
      ),
    };
  }

  throw new Error("use_bulkTransferEnrollmentsFromTeacher");
}

export function lessonCountsForPayroll(lesson: Lesson, payrollTeacherId: string): boolean {
  if (lesson.status !== "completed") return false;
  if (lesson.unpaidForTeacher || lesson.teacherNoShow) return false;
  const payee = lesson.payrollTeacherId ?? lesson.teacherId;
  return payee === payrollTeacherId;
}

export function getUpcomingLessonsForAdmin(filters?: {
  teacherId?: string;
  studentId?: string;
  from?: string;
  to?: string;
}): Lesson[] {
  return getAllLessons()
    .filter((l) => {
      if (filters?.teacherId && l.teacherId !== filters.teacherId) return false;
      if (filters?.studentId && l.studentId !== filters.studentId) return false;
      if (filters?.from && l.scheduledAt < filters.from) return false;
      if (filters?.to && l.scheduledAt > filters.to) return false;
      return true;
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

export function defaultMakeupTime(scheduledAt: string): string {
  const d = new Date(scheduledAt);
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export { LESSON_MINUTES };
