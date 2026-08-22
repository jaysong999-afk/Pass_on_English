import type { SupabaseClient } from "@supabase/supabase-js";
import type { Lesson, LessonStatus } from "@/types";
import { LESSON_MINUTES } from "@/lib/availability/constants";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import {
  getLessonCache,
  patchLessonInCache,
  removeLessonFromCache,
  setLessonCache,
} from "@/lib/lessons/lesson-cache";
import { isTrialRelevantForHold } from "@/lib/enrollments/trial-path";
import { isUuid } from "@/lib/teachers/resolve-teacher-id";
import { notifyTeacherOfLessonAssignmentInDb } from "@/lib/notifications/teacher-lesson-assignment";
import {
  getAllLessons,
  getTeacherLessons,
  getStudentLessons,
  getLessonById,
  pushLesson,
  deleteLessonById,
  removeFutureScheduledLessonsForEnrollment,
  replaceLesson,
  updateLessonStatus,
  updateLessonSchedule,
  completeLesson,
  completeLessonAsStudentAbsent,
  createTrialLesson,
  getLessonsAssignedToTeacher,
  getLessonEndTime,
  isLessonEnded,
  getNextLesson,
  getTodayLessons,
  getActionRequiredLessons,
  lessonNeedsFeedback,
} from "@/lib/teacher-lesson-store-sync";
import type { CreateTrialLessonInput } from "@/lib/teacher-lesson-store-sync";
import {
  studentNameFromDb,
  teacherNameFromDb,
  type StudentNameDbJoin,
  type TeacherNameDbJoin,
} from "@/lib/db/join-types";

interface LessonRow {
  id: string;
  enrollment_id: string | null;
  teacher_id: string;
  student_id: string;
  scheduled_at: string;
  duration_minutes: number;
  status: LessonStatus;
  is_trial: boolean;
  student_absent: boolean;
  teacher_no_show: boolean;
  unpaid_for_teacher: boolean;
  cancel_reason: string | null;
  original_teacher_id: string | null;
  related_lesson_id: string | null;
  operation_note: string | null;
  completed_at: string | null;
  created_at: string;
}

interface LessonJoinRow extends LessonRow {
  teacher?: TeacherNameDbJoin | null;
  student?: StudentNameDbJoin | null;
}

const LESSON_SELECT = `
  id,
  enrollment_id,
  teacher_id,
  student_id,
  scheduled_at,
  duration_minutes,
  status,
  is_trial,
  student_absent,
  teacher_no_show,
  unpaid_for_teacher,
  cancel_reason,
  original_teacher_id,
  related_lesson_id,
  operation_note,
  completed_at,
  created_at,
  teacher:teachers!lessons_teacher_id_fkey(display_name),
  student:students!lessons_student_id_fkey(english_name, full_name)
`;

export function rowToLesson(row: LessonJoinRow, names?: { teacherName?: string; studentName?: string }): Lesson {
  const teacherName = names?.teacherName ?? teacherNameFromDb(row.teacher);
  const studentName = names?.studentName ?? studentNameFromDb(row.student, "Student");

  return {
    id: row.id,
    enrollmentId: row.enrollment_id ?? undefined,
    teacherId: row.teacher_id,
    teacherName,
    studentId: row.student_id,
    studentName,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    isTrial: row.is_trial,
    studentAbsent: row.student_absent,
    teacherNoShow: row.teacher_no_show,
    unpaidForTeacher: row.unpaid_for_teacher,
    cancelReason: (row.cancel_reason as Lesson["cancelReason"]) ?? undefined,
    originalTeacherId: row.original_teacher_id ?? undefined,
    relatedLessonId: row.related_lesson_id ?? undefined,
    operationNote: row.operation_note ?? undefined,
    payrollTeacherId: row.teacher_id,
    payrollTeacherName: teacherName,
  };
}

function cloneLesson(lesson: Lesson): Lesson {
  return { ...lesson };
}

async function fetchLessonRows(filter?: {
  teacherId?: string;
  studentId?: string;
  enrollmentId?: string;
}): Promise<LessonJoinRow[]> {
  const supabase = filter ? await createClient() : createBootstrapDbClient();
  let query = supabase.from("lessons").select(LESSON_SELECT);

  if (filter?.teacherId) query = query.eq("teacher_id", filter.teacherId);
  if (filter?.studentId) query = query.eq("student_id", filter.studentId);
  if (filter?.enrollmentId) query = query.eq("enrollment_id", filter.enrollmentId);

  const { data, error } = await query.order("scheduled_at", { ascending: true });
  if (error) {
    throw new Error(`lessons_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as unknown as LessonJoinRow[];
}

export async function warmLessonCache(): Promise<Lesson[]> {
  const rows = await fetchLessonRows();
  const lessons = rows.map((row) => rowToLesson(row));
  setLessonCache(lessons);
  return lessons;
}

export async function listStudentLessonsInDb(studentId: string): Promise<Lesson[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .eq("student_id", studentId)
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`student_lessons_fetch_failed: ${error.message}`);
  }

  const lessons = ((data ?? []) as unknown as LessonJoinRow[]).map((row) => rowToLesson(row));
  for (const lesson of lessons) {
    patchLessonInCache(lesson);
  }
  return lessons;
}

export async function listFuturePaidLessonsForEnrollmentInDb(
  enrollmentId: string,
  studentId: string,
  teacherId: string
): Promise<Lesson[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .eq("student_id", studentId)
    .eq("is_trial", false)
    .in("status", ["scheduled", "reschedule_pending"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`enrollment_future_lessons_fetch_failed: ${error.message}`);
  }

  return ((data ?? []) as unknown as LessonJoinRow[])
    .map((row) => rowToLesson(row))
    .filter(
      (lesson) =>
        lesson.enrollmentId === enrollmentId ||
        (!lesson.enrollmentId && lesson.teacherId === teacherId)
    );
}

export async function listActiveLessonTimeKeysForTeacherInDb(
  teacherId: string
): Promise<Set<number>> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("scheduled_at")
    .eq("teacher_id", teacherId)
    .in("status", ["scheduled", "reschedule_pending", "pending_payment"]);

  if (error) {
    throw new Error(`teacher_lesson_times_fetch_failed: ${error.message}`);
  }

  return new Set(
    (data ?? []).map((row) => new Date(String(row.scheduled_at)).getTime())
  );
}

export async function getLessonByIdInDb(id: string): Promise<Lesson | null> {
  const cached = getLessonById(id);
  if (cached) return cloneLesson(cached);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`lesson_fetch_failed: ${error.message}`);
  }
  if (!data) return null;

  const lesson = rowToLesson(data as unknown as LessonJoinRow);
  patchLessonInCache(lesson);
  return lesson;
}

/** Read the persisted row without allowing an in-memory read model to win. */
export async function getPersistedLessonByIdInDb(id: string): Promise<Lesson | null> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`lesson_fetch_failed: ${error.message}`);
  if (!data) return null;
  const lesson = rowToLesson(data as unknown as LessonJoinRow);
  patchLessonInCache(lesson);
  return lesson;
}

export {
  getAllLessons,
  getTeacherLessons,
  getStudentLessons,
  getLessonById,
  pushLesson,
  replaceLesson,
  deleteLessonById,
  removeFutureScheduledLessonsForEnrollment,
  updateLessonStatus,
  updateLessonSchedule,
  completeLesson,
  completeLessonAsStudentAbsent,
  createTrialLesson,
  getLessonsAssignedToTeacher,
  getLessonEndTime,
  isLessonEnded,
  getNextLesson,
  getTodayLessons,
  getActionRequiredLessons,
  lessonNeedsFeedback,
};

export type { CreateTrialLessonInput };

export async function insertLessonInDb(
  input: Omit<Lesson, "id"> & { id?: string }
): Promise<Lesson> {
  const supabase = await createClient();
  const payload = {
    ...(input.id && isUuid(input.id) ? { id: input.id } : {}),
    enrollment_id: input.enrollmentId ?? null,
    teacher_id: input.teacherId,
    student_id: input.studentId,
    scheduled_at: input.scheduledAt,
    duration_minutes: input.durationMinutes,
    status: input.status,
    is_trial: input.isTrial,
    student_absent: input.studentAbsent ?? false,
    teacher_no_show: input.teacherNoShow ?? false,
    unpaid_for_teacher: input.unpaidForTeacher ?? false,
    cancel_reason: input.cancelReason ?? null,
    original_teacher_id: input.originalTeacherId ?? null,
    related_lesson_id: input.relatedLessonId ?? null,
    operation_note: input.operationNote ?? null,
  };

  const { data, error } = await supabase
    .from("lessons")
    .insert(payload)
    .select(LESSON_SELECT)
    .single();

  if (error) {
    throw new Error(`lesson_insert_failed: ${error.message}`);
  }

  const lesson = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: input.teacherName,
    studentName: input.studentName,
  });
  patchLessonInCache(lesson);
  return lesson;
}

export async function insertLessonsInDb(inputs: Array<Omit<Lesson, "id"> & { id?: string }>): Promise<Lesson[]> {
  if (inputs.length === 0) return [];

  const supabase = createBootstrapDbClient();
  const payload = inputs.map((input) => ({
    enrollment_id: input.enrollmentId ?? null,
    teacher_id: input.teacherId,
    student_id: input.studentId,
    scheduled_at: input.scheduledAt,
    duration_minutes: input.durationMinutes,
    status: input.status,
    is_trial: input.isTrial,
    student_absent: input.studentAbsent ?? false,
    teacher_no_show: input.teacherNoShow ?? false,
    unpaid_for_teacher: input.unpaidForTeacher ?? false,
    operation_note: input.operationNote ?? null,
  }));

  const { data, error } = await supabase.from("lessons").insert(payload).select(LESSON_SELECT);
  if (error) {
    throw new Error(`lessons_batch_insert_failed: ${error.message}`);
  }

  const lessons = (data as unknown as LessonJoinRow[]).map((row, index) =>
    rowToLesson(row, {
      teacherName: inputs[index]?.teacherName,
      studentName: inputs[index]?.studentName,
    })
  );

  for (const lesson of lessons) {
    patchLessonInCache(lesson);
  }

  return lessons;
}

export async function updateLessonStatusInDb(id: string, status: LessonStatus): Promise<Lesson | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({ status })
    .eq("id", id)
    .select(LESSON_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`lesson_status_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const existing = getLessonById(id);
  const lesson = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: existing?.teacherName,
    studentName: existing?.studentName,
  });
  patchLessonInCache(lesson);
  return lesson;
}

export async function updateLessonScheduleInDb(
  id: string,
  scheduledAt: string,
  status: LessonStatus = "scheduled"
): Promise<Lesson | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({ scheduled_at: scheduledAt, status })
    .eq("id", id)
    .select(LESSON_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`lesson_schedule_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const existing = getLessonById(id);
  const lesson = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: existing?.teacherName,
    studentName: existing?.studentName,
  });
  patchLessonInCache(lesson);
  return lesson;
}

export async function replaceLessonInDb(lesson: Lesson): Promise<Lesson> {
  if (!isUuid(lesson.id)) {
    patchLessonInCache(lesson);
    return cloneLesson(lesson);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .upsert({
      id: lesson.id,
      enrollment_id: lesson.enrollmentId ?? null,
      teacher_id: lesson.teacherId,
      student_id: lesson.studentId,
      scheduled_at: lesson.scheduledAt,
      duration_minutes: lesson.durationMinutes,
      status: lesson.status,
      is_trial: lesson.isTrial,
      student_absent: lesson.studentAbsent ?? false,
      teacher_no_show: lesson.teacherNoShow ?? false,
      unpaid_for_teacher: lesson.unpaidForTeacher ?? false,
      cancel_reason: lesson.cancelReason ?? null,
      original_teacher_id: lesson.originalTeacherId ?? null,
      related_lesson_id: lesson.relatedLessonId ?? null,
      operation_note: lesson.operationNote ?? null,
    })
    .select(LESSON_SELECT)
    .single();

  if (error) {
    throw new Error(`lesson_upsert_failed: ${error.message}`);
  }

  const saved = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: lesson.teacherName,
    studentName: lesson.studentName,
  });
  patchLessonInCache(saved);
  return saved;
}

export async function deleteLessonByIdInDb(
  id: string,
  client?: SupabaseClient
): Promise<boolean> {
  // Lesson deletion is currently exposed only through guarded admin
  // operations. Use the bootstrap/service client so RLS policies for regular
  // authenticated users cannot turn a successful admin action into a
  // misleading zero-row `lesson_not_found` response.
  const supabase = client ?? createBootstrapDbClient();
  const { error, count } = await supabase.from("lessons").delete({ count: "exact" }).eq("id", id);
  if (error) {
    throw new Error(`lesson_delete_failed: ${error.message}`);
  }
  if ((count ?? 0) === 0) return false;
  removeLessonFromCache(id);
  return true;
}

export async function deleteLessonsByIdsInDb(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const supabase = createBootstrapDbClient();
  const { error } = await supabase.from("lessons").delete().in("id", ids);
  if (error) {
    throw new Error(`lessons_delete_failed: ${error.message}`);
  }
  for (const id of ids) {
    removeLessonFromCache(id);
  }
}

export async function removeFutureScheduledLessonsForEnrollmentInDb(
  enrollmentId: string,
  studentId?: string,
  teacherId?: string
): Promise<number> {
  const now = new Date().toISOString();
  const future = getLessonCache().filter((l) => {
    if (l.isTrial) return false;
    const linked =
      l.enrollmentId === enrollmentId ||
      (!l.enrollmentId && studentId && teacherId && l.studentId === studentId && l.teacherId === teacherId);
    if (!linked) return false;
    if (!["scheduled", "reschedule_pending"].includes(l.status)) return false;
    return l.scheduledAt >= now;
  });

  await deleteLessonsByIdsInDb(future.map((l) => l.id));
  return future.length;
}

export async function createTrialLessonInDb(input: CreateTrialLessonInput): Promise<Lesson> {
  const lesson = await insertLessonInDb({
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    studentId: input.studentId,
    studentName: input.studentName,
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes ?? LESSON_MINUTES,
    status: "scheduled",
    isTrial: true,
  });
  await notifyTeacherOfLessonAssignmentInDb({
    assignmentKey: `trial:${lesson.id}`,
    lesson,
  });
  return lesson;
}

function isRelevantScheduledTrial(
  lesson: Pick<Lesson, "isTrial" | "studentId" | "status" | "scheduledAt" | "durationMinutes">,
  studentId: string
): boolean {
  if (!lesson.isTrial) return false;
  if (lesson.studentId !== studentId) return false;
  if (lesson.status !== "scheduled") return false;
  return isTrialRelevantForHold(lesson.scheduledAt, lesson.durationMinutes);
}

export async function findPendingTrialLessonInDb(studentId: string): Promise<Lesson | null> {
  const cached = getLessonCache()
    .filter((l) => isRelevantScheduledTrial(l, studentId))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  if (cached) return cloneLesson(cached);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select(LESSON_SELECT)
    .eq("student_id", studentId)
    .eq("is_trial", true)
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`pending_trial_fetch_failed: ${error.message}`);
  }

  const match = ((data ?? []) as unknown as LessonJoinRow[])
    .map((row) => rowToLesson(row))
    .find((lesson) => isRelevantScheduledTrial(lesson, studentId));
  return match ?? null;
}

export async function attachLessonEnrollmentInDb(
  lessonId: string,
  enrollmentId: string
): Promise<Lesson | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({ enrollment_id: enrollmentId })
    .eq("id", lessonId)
    .select(LESSON_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`lesson_attach_enrollment_failed: ${error.message}`);
  }
  if (!data) return null;

  const existing = getLessonById(lessonId);
  const lesson = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: existing?.teacherName,
    studentName: existing?.studentName,
  });
  patchLessonInCache(lesson);
  return lesson;
}

export async function completeLessonInDb(id: string): Promise<Lesson | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({
      status: "completed",
      student_absent: false,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(LESSON_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`lesson_complete_failed: ${error.message}`);
  }
  if (!data) return null;

  const existing = getLessonById(id);
  const lesson = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: existing?.teacherName,
    studentName: existing?.studentName,
  });
  patchLessonInCache(lesson);
  return lesson;
}

export async function completeLessonAsStudentAbsentInDb(id: string): Promise<Lesson | null> {
  const existing = await getLessonByIdInDb(id);
  if (!existing || existing.status === "cancelled") return null;
  if (existing.status === "completed") return cloneLesson(existing);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .update({
      status: "completed",
      student_absent: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(LESSON_SELECT)
    .maybeSingle();

  if (error) {
    throw new Error(`lesson_absent_complete_failed: ${error.message}`);
  }
  if (!data) return null;

  const lesson = rowToLesson(data as unknown as LessonJoinRow, {
    teacherName: existing.teacherName,
    studentName: existing.studentName,
  });
  patchLessonInCache(lesson);
  return lesson;
}
