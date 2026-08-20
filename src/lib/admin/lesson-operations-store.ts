import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lesson } from "@/types";
import { CANONICAL_TIMEZONE, LESSON_MINUTES } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { addDaysToDateKey, nextScheduledDateOnOrAfter } from "@/lib/contract-schedule";
import {
  appendAdminLessonOperationLogInDb,
  getAdminLessonOperationLogByIdInDb,
  markAdminLessonOperationUndoneInDb,
} from "@/lib/admin/admin-lesson-operation-log-repository";
import { weekStartKeyFromScheduledAt } from "@/lib/admin/admin-lesson-operation-log-utils";
import { adjustEnrollmentSessionsWithScheduleBatchInDb } from "@/lib/lessons/schedule-service";
import {
  deleteLessonByIdInDb,
  getLessonByIdInDb,
  getPersistedLessonByIdInDb,
  insertLessonInDb,
  listStudentLessonsInDb,
  replaceLessonInDb,
} from "@/lib/lessons/repository";
import {
  getEnrollmentsByStudent,
  getActiveEnrollmentsByTeacher,
  updateEnrollmentTeacher,
  getEnrollmentById,
} from "@/lib/enrollment-store-sync";
import { updateEnrollmentEndDateInDb } from "@/lib/enrollments/repository";
import { getStudentDirectoryEntry } from "@/lib/students/student-directory-store-sync";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getCachedPricingPlanById } from "@/lib/pricing-plan-cache";
import {
  formatEnrollmentSlotLabel,
  futureLessonsForEnrollment,
  getEnrollmentScheduleDays,
  isTeacherSlotFree,
} from "@/lib/lesson-scheduler";
import { getAllTeachers, getTeacherById } from "@/lib/teacher-profile-store-sync";
import { applyTeacherNoShowPenaltyInDb, revertTeacherNoShowPenaltyInDb } from "@/lib/teacher-payroll-penalty-repository";
import { getAllLessons, getLessonById } from "@/lib/teacher-lesson-store-sync";
import { restoreOccupiedWeeklyAvailabilityInDb } from "@/lib/teacher-availability/repository";
import { isUuid } from "@/lib/teachers/resolve-teacher-id";

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
  overdueOpenLessonCount: number;
  unresolvedLessonCount: number;
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
    const student = getStudentDirectoryEntry(enrollment.studentId);
    const studentName = student
      ? getStudentDisplayName(student.student)
      : enrollment.studentId;
    const plan = getCachedPricingPlanById(enrollment.planId);
    const upcoming = futureLessonsForEnrollment(enrollment.id, fromTeacherId);
    const overdueOpenLessonCount = getAllLessons().filter((lesson) =>
      lesson.enrollmentId === enrollment.id &&
      lesson.teacherId === fromTeacherId &&
      !lesson.isTrial &&
      ["scheduled", "reschedule_pending"].includes(lesson.status) &&
      new Date(lesson.scheduledAt).getTime() < Date.now()
    ).length;
    const unresolvedLessonCount = upcoming.length + overdueOpenLessonCount;
    const enrollmentLessons = getAllLessons()
      .filter((lesson) => lesson.enrollmentId === enrollment.id)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    const lessonStart = enrollmentLessons[0]
      ? getDateKeyInTimezone(new Date(enrollmentLessons[0].scheduledAt), CANONICAL_TIMEZONE)
      : undefined;
    const lessonEnd = enrollmentLessons.at(-1)
      ? getDateKeyInTimezone(
          new Date(enrollmentLessons.at(-1)!.scheduledAt),
          CANONICAL_TIMEZONE
        )
      : undefined;
    // Legacy/E2E rows created without started_at and ended_at were both mapped
    // to today's date. A multi-day lesson schedule is a stronger source for
    // the transfer preview until those rows are reseeded.
    const missingContractRange =
      enrollment.startDate === enrollment.endDate &&
      lessonStart &&
      lessonEnd &&
      lessonStart !== lessonEnd;

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
      contractStart: missingContractRange ? lessonStart : enrollment.startDate,
      contractEnd: missingContractRange ? lessonEnd : enrollment.endDate,
      status: enrollment.status,
      upcomingLessonCount: upcoming.length,
      overdueOpenLessonCount,
      unresolvedLessonCount,
      scheduleInSync: unresolvedLessonCount === enrollment.sessionsRemaining,
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
  const ignoreOwner = { studentId: enrollment.studentId };
  for (const lesson of scheduled) {
    if (
      isTeacherSlotFree(
        toTeacherId,
        lesson.scheduledAt,
        lesson.id,
        lesson.durationMinutes,
        ignoreOwner
      )
    ) {
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
  lessonId?: string | null;
  note?: string;
  undoable?: boolean;
  undoPayload?: import("@/types").AdminLessonOperationUndoPayload;
}) {
  return appendAdminLessonOperationLogInDb({
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    lessonId: input.lessonId === undefined ? input.lesson.id : input.lessonId ?? "",
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

export async function assignSubstituteTeacher(
  lessonId: string,
  substituteTeacherId: string,
  note?: string
): Promise<Lesson> {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const substitute = getTeacherById(substituteTeacherId);
  if (!substitute || substitute.status !== "active") {
    throw new Error("substitute_not_available");
  }

  if (!isTeacherSlotFree(substituteTeacherId, lesson.scheduledAt, lessonId, lesson.durationMinutes)) {
    throw new Error("substitute_slot_unavailable");
  }

  const updated = await replaceLessonInDb({
    ...lesson,
    originalTeacherId: lesson.originalTeacherId ?? lesson.teacherId,
    originalTeacherName: lesson.originalTeacherName ?? lesson.teacherName,
    teacherId: substitute.id,
    teacherName: substitute.displayName,
    payrollTeacherId: substitute.id,
    payrollTeacherName: substitute.displayName,
    operationNote: note ?? "대체 선생님 배정",
  });

  await logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    action: "assign_substitute",
    summary: `${substitute.displayName} 선생님으로 대체 배정`,
    note: note ?? "대체 선생님 배정",
  });

  return updated;
}

export async function markTeacherNoShow(
  lessonId: string,
  options?: { makeupScheduledAt?: string; note?: string }
): Promise<{ original: Lesson; makeup: Lesson }> {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const originalSnapshot = cloneLesson(lesson);
  const month = monthKeyFromIso(lesson.scheduledAt);
  const noShowTeacherId = lesson.originalTeacherId ?? lesson.teacherId;
  const noShowTeacherName = lesson.originalTeacherName ?? lesson.teacherName;

  const cancelled = await replaceLessonInDb({
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
    await adjustEnrollmentSessionsWithScheduleBatchInDb(enrollment.id, 1, {
      reason: "선생님 노쇼 — 수업 1회 보상",
      adminName: "관리자",
      // The missed lesson is already in the past. Add one future makeup slot
      // and one to the contract total, but do not restore today's balance.
      deltaRemaining: 0,
      // The makeup date is selected below, so avoid generating a second slot
      // here. This keeps the no-show action to exactly one added lesson.
      schedule: false,
    });
  }

  const futureForEnrollment = enrollment
    ? futureLessonsForEnrollment(enrollment.id, lesson.teacherId)
        .filter((candidate) => candidate.status === "scheduled" || candidate.status === "reschedule_pending")
        .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    : [];
  const lastScheduledAt = futureForEnrollment.at(-1)?.scheduledAt ?? lesson.scheduledAt;
  const lastDateKey = getDateKeyInTimezone(new Date(lastScheduledAt), CANONICAL_TIMEZONE);
  const scheduleDays = enrollment ? getEnrollmentScheduleDays(enrollment) : [];
  const nextDateKey = nextScheduledDateOnOrAfter(addDaysToDateKey(lastDateKey, 1), scheduleDays);
  const lastTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: CANONICAL_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(lastScheduledAt));
  const defaultMakeupAt = `${nextDateKey}T${lastTime}:00+09:00`;
  const requestedMakeupAt = options?.makeupScheduledAt;
  // The compensation lesson must be appended after the existing schedule.
  // The modal initially sends the missed lesson's timestamp, so reject any
  // value that would place the makeup in the past or in the middle of the
  // contract and use the next final slot instead.
  const makeupAt =
    requestedMakeupAt && new Date(requestedMakeupAt).getTime() > new Date(lastScheduledAt).getTime()
      ? requestedMakeupAt
      : defaultMakeupAt;

  const makeup = await insertLessonInDb({
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
    relatedLessonId: isUuid(lesson.id) ? lesson.id : undefined,
    operationNote: "노쇼 보강 수업 (노쇼 선생님 무급)",
  });

  if (enrollment) {
    const makeupDate = getDateKeyInTimezone(new Date(makeupAt), CANONICAL_TIMEZONE);
    if (makeupDate > enrollment.endDate) {
      await updateEnrollmentEndDateInDb(enrollment.id, makeupDate);
    }
  }

  await replaceLessonInDb({ ...cancelled, relatedLessonId: makeup.id });
  await applyTeacherNoShowPenaltyInDb(noShowTeacherId, month, "선생님 노쇼");

  await logLessonOperation({
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
      enrollmentDeltaRemaining: 0,
      enrollmentDeltaTotal: enrollment ? 1 : 0,
      penaltyTeacherId: noShowTeacherId,
      penaltyMonth: month,
    },
  });

  return { original: cancelled, makeup };
}

export async function cancelLessonUnpaid(
  lessonId: string,
  note?: string,
  context?: { teacherId?: string; studentId?: string; scheduledAt?: string },
  requestDb?: SupabaseClient
): Promise<{ deletedLessonId: string }> {
  let lesson = isUuid(lessonId)
    ? await getPersistedLessonByIdInDb(lessonId)
    : undefined;
  // Some legacy/read-model lessons use a synthetic id. If the action reaches
  // another server instance, resolve that id using the stable lesson fields
  // sent by the modal instead of failing with lesson_not_found.
  if (!lesson && !isUuid(lessonId) && context?.studentId) {
    const candidates = await listStudentLessonsInDb(context.studentId);
    lesson = candidates.find((candidate) => {
      if (context.teacherId && candidate.teacherId !== context.teacherId) return false;
      if (!context.scheduledAt) return true;
      return new Date(candidate.scheduledAt).getTime() === new Date(context.scheduledAt).getTime();
    });
  }
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending", "pending_payment"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const reason = note?.trim() || "관리자 무급 취소";
  const deletedSnapshot = cloneLesson(lesson);
  const enrollment =
    (lesson.enrollmentId ? getEnrollmentById(lesson.enrollmentId) : undefined) ??
    activeEnrollmentForStudent(lesson.studentId);

  if (!(await deleteLessonByIdInDb(lesson.id, requestDb))) {
    throw new Error("lesson_not_found");
  }

  // Only decrement the contract after the persisted lesson was actually
  // removed. This prevents a stale cache card from changing 12/12 to 11/11
  // while the delete itself fails with lesson_not_found.
  if (enrollment) {
    const adjustment = await adjustEnrollmentSessionsWithScheduleBatchInDb(enrollment.id, -1, {
      reason,
      adminName: "관리자",
      // The selected lesson has already been deleted above. Do not let the
      // scheduler remove a second future lesson for the same adjustment.
      schedule: false,
      deltaRemaining: -1,
    });
    if (adjustment?.error) throw new Error(adjustment.error);
  }

  await logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    // The lesson has already been deleted. Keep the immutable snapshot in
    // undoPayload, but do not insert a dangling FK into the audit table.
    lessonId: null,
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

  return { deletedLessonId: lesson.id };
}

export async function adminRescheduleLesson(
  lessonId: string,
  newScheduledAt: string,
  teacherId?: string
): Promise<Lesson> {
  const lesson = getLessonById(lessonId);
  if (!lesson) throw new Error("lesson_not_found");
  if (!["scheduled", "reschedule_pending"].includes(lesson.status)) {
    throw new Error("lesson_not_active");
  }

  const targetTeacherId = teacherId ?? lesson.teacherId;
  const teacher = getTeacherById(targetTeacherId);
  if (!teacher) throw new Error("teacher_not_found");

  if (!isTeacherSlotFree(targetTeacherId, newScheduledAt, lessonId, lesson.durationMinutes)) {
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

  const result = await replaceLessonInDb(updated);

  await logLessonOperation({
    teacherId: lesson.teacherId,
    teacherName: lesson.teacherName ?? lesson.teacherId,
    lesson,
    action: "reschedule",
    summary: `일정 변경 → ${newScheduledAt.slice(0, 16).replace("T", " ")}`,
    note: "관리자 일정 변경",
  });

  return result;
}

export async function undoAdminLessonOperation(logId: string): Promise<void> {
  const log = await getAdminLessonOperationLogByIdInDb(logId);
  if (!log) throw new Error("log_not_found");
  if (log.undoneAt) throw new Error("already_undone");
  if (!log.undoable || !log.undoPayload) throw new Error("not_undoable");

  const payload = log.undoPayload;

  if (payload.type === "teacher_no_show") {
    if (!payload.originalLesson || !payload.makeupLessonId) {
      throw new Error("invalid_undo_payload");
    }
    const originalLesson = payload.originalLesson;

    const current = isUuid(originalLesson.id)
      ? await getLessonByIdInDb(originalLesson.id)
      : getLessonById(originalLesson.id);
    if (!current || current.status !== "cancelled" || !current.teacherNoShow) {
      throw new Error("lesson_state_changed");
    }

    // Older no-show logs stored a synthetic makeup id in the undo payload,
    // while the database generated a UUID on insert. Resolve that legacy
    // payload through the persisted related_lesson_id/operation note as a
    // fallback so undo removes the actual compensation lesson as well.
    const studentLessons = originalLesson.studentId
      ? await listStudentLessonsInDb(originalLesson.studentId)
      : [];
    let makeup = isUuid(payload.makeupLessonId)
      ? await getLessonByIdInDb(payload.makeupLessonId)
      : undefined;
    if (!makeup) {
      makeup = studentLessons
        .filter((candidate) => {
          if (candidate.id === originalLesson.id) return false;
          if (candidate.teacherId !== originalLesson.teacherId) return false;
          if (candidate.status !== "scheduled" && candidate.status !== "reschedule_pending" && candidate.status !== "cancelled") {
            return false;
          }
          if (candidate.relatedLessonId === originalLesson.id) return true;
          return candidate.operationNote?.includes("노쇼 보강") ?? false;
        })
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0];
    }
    const makeupIds = new Set<string>();
    if (makeup) makeupIds.add(makeup.id);

    // Very old no-show actions scheduled one compensation lesson through the
    // enrollment scheduler and then inserted another explicit makeup lesson.
    // Remove both legacy compensation rows when they are still reversible.
    for (const candidate of studentLessons) {
      if (candidate.id === originalLesson.id) continue;
      if (candidate.teacherId !== originalLesson.teacherId) continue;
      if (payload.enrollmentId && candidate.enrollmentId !== payload.enrollmentId) continue;
      if (new Date(candidate.scheduledAt).getTime() <= new Date(originalLesson.scheduledAt).getTime()) continue;
      const isLegacyCompensation =
        candidate.relatedLessonId === originalLesson.id ||
        candidate.operationNote?.includes("노쇼 보강") ||
        candidate.operationNote?.includes("노쇼 — 수업 1회 보상");
      if (!isLegacyCompensation) continue;
      makeupIds.add(candidate.id);
    }

    for (const id of makeupIds) {
      const candidate = studentLessons.find((lesson) => lesson.id === id) ?? (makeup?.id === id ? makeup : undefined);
      if (candidate?.status === "completed") throw new Error("makeup_already_completed");
      if (candidate && !["scheduled", "reschedule_pending", "cancelled"].includes(candidate.status)) {
        throw new Error("makeup_not_reversible");
      }
    }

    const restored: Lesson = {
      ...originalLesson,
      status: "scheduled",
      teacherNoShow: undefined,
      unpaidForTeacher: undefined,
      cancelReason: undefined,
      relatedLessonId: undefined,
      operationNote: undefined,
    };

    // This is a restoration of the original lesson, not a new booking.  The
    // student's recurring enrollment/hold may still occupy this weekly slot,
    // and the teacher's availability may have changed since the no-show was
    // recorded.  Ignore the restored student's own hold while continuing to
    // reject a real conflict with another student's lesson.
    if (
      !isTeacherSlotFree(
        restored.teacherId,
        restored.scheduledAt,
        restored.id,
        restored.durationMinutes,
        { studentId: restored.studentId, studentName: restored.studentName }
      )
    ) {
      throw new Error("slot_unavailable");
    }

    // Only mutate related records after all validation has succeeded.  This
    // keeps an undo retryable when a genuine conflict is found.
    for (const id of makeupIds) {
      await deleteLessonByIdInDb(id);
    }

    await replaceLessonInDb(restored);

    if (
      payload.enrollmentId &&
      ((payload.enrollmentDeltaTotal ?? 0) !== 0 || (payload.enrollmentDeltaRemaining ?? 0) !== 0)
    ) {
      await adjustEnrollmentSessionsWithScheduleBatchInDb(
        payload.enrollmentId,
        -(payload.enrollmentDeltaTotal ?? payload.enrollmentDeltaRemaining),
        {
          reason: "선생님 노쇼 조치 취소",
          adminName: "관리자",
          deltaRemaining: -payload.enrollmentDeltaRemaining,
          schedule: false,
        }
      );
    }

    if (payload.penaltyTeacherId && payload.penaltyMonth) {
      await revertTeacherNoShowPenaltyInDb(
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
    if (
      !isTeacherSlotFree(
        lesson.teacherId,
        lesson.scheduledAt,
        undefined,
        lesson.durationMinutes,
        { studentId: lesson.studentId, studentName: lesson.studentName }
      )
    ) {
      throw new Error("slot_unavailable");
    }

    await insertLessonInDb(lesson);

    if (payload.enrollmentId && payload.enrollmentDeltaRemaining) {
      await adjustEnrollmentSessionsWithScheduleBatchInDb(
        payload.enrollmentId,
        -payload.enrollmentDeltaRemaining,
        {
          reason: "무급 취소 조치 취소",
          adminName: "관리자",
          schedule: false,
        }
      );
    }
  } else {
    throw new Error("not_undoable");
  }

  await markAdminLessonOperationUndoneInDb(logId);
}

export async function bulkTransferEnrollmentsFromTeacher(input: {
  fromTeacherId: string;
  transfers: { enrollmentId: string; toTeacherId: string }[];
}): Promise<BulkEnrollmentTransferResult> {
  const fromTeacher = getTeacherById(input.fromTeacherId);
  const fromTeacherName = fromTeacher?.displayName ?? input.fromTeacherId;
  const allMoved: Lesson[] = [];
  const transfers: BulkEnrollmentTransferItemResult[] = [];

  for (const transfer of input.transfers) {
    const enrollment = getEnrollmentById(transfer.enrollmentId);
    const toTeacher = getTeacherById(transfer.toTeacherId);
    const student = enrollment ? getStudentDirectoryEntry(enrollment.studentId) : undefined;
    const studentName = student
      ? getStudentDisplayName(student.student)
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

    const scheduled = futureLessonsForEnrollment(enrollment.id, input.fromTeacherId);
    const skipReasons: string[] = [];
    let lessonsMoved = 0;
    let lessonsSkipped = 0;
    const ignoreOwner = { studentId: enrollment.studentId };

    for (const lesson of scheduled) {
      if (
        !isTeacherSlotFree(
          toTeacher.id,
          lesson.scheduledAt,
          lesson.id,
          lesson.durationMinutes,
          ignoreOwner
        )
      ) {
        lessonsSkipped += 1;
        skipReasons.push(
          `${lesson.scheduledAt.slice(0, 16)} — 받는 선생님 시간 불가 (기존 스케줄 유지)`
        );
        continue;
      }

      const moved = await replaceLessonInDb({
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

    updateEnrollmentTeacher(enrollment.id, toTeacher.id, toTeacher.displayName);
    await restoreOccupiedWeeklyAvailabilityInDb(toTeacher.id);

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
export async function bulkReassignTeacherLessons(input: {
  fromTeacherId: string;
  toTeacherId?: string;
  assignments?: { lessonId: string; toTeacherId: string }[];
}): Promise<BulkReassignResult> {
  if (input.toTeacherId && !input.assignments?.length) {
    const previews = getBulkEnrollmentTransferPreview(input.fromTeacherId);
    const result = await bulkTransferEnrollmentsFromTeacher({
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
