import type { Lesson, LessonRescheduleRequest, RescheduleInitiator, RescheduleRequestStatus } from "@/types";
import { CANONICAL_TIMEZONE, LESSON_MINUTES } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { snapIsoToSlotGrid } from "@/lib/availability/time-utils";
import { createClient } from "@/lib/supabase/server";
import { warmEnrollmentCache } from "@/lib/enrollments/repository";
import { isTeacherSlotFree } from "@/lib/lessons/schedule-service";
import { restoreOccupiedWeeklyAvailabilityInDb } from "@/lib/teacher-availability/repository";
import {
  getLessonById,
  updateLessonStatusInDb,
  warmLessonCache,
} from "@/lib/lessons/repository";
import {
  getRescheduleCache,
  patchRescheduleInCache,
  setRescheduleCache,
} from "@/lib/reschedule/reschedule-cache";
import {
  STUDENT_RESCHEDULE_MONTHLY_LIMIT,
  getAllRescheduleRequests,
  getRescheduleRequestById,
  getPendingRequestForLesson,
  getRescheduleRequestsForTeacher,
  getRescheduleRequestsForStudent,
  countStudentRescheduleRequestsThisMonth,
  getStudentRescheduleRemaining,
  getActiveRescheduleRequests,
} from "@/lib/reschedule-store-sync";

interface RescheduleRow {
  id: string;
  lesson_id: string;
  teacher_id: string;
  student_id: string;
  initiator: RescheduleInitiator;
  original_scheduled_at: string;
  proposed_scheduled_at: string;
  status: RescheduleRequestStatus;
  reason: string | null;
  request_month: string;
  responded_at: string | null;
  created_at: string;
  teacher?: { display_name: string | null } | null;
  student?: { english_name: string | null; full_name: string | null } | null;
}

const RESCHEDULE_SELECT = `
  id,
  lesson_id,
  teacher_id,
  student_id,
  initiator,
  original_scheduled_at,
  proposed_scheduled_at,
  status,
  reason,
  request_month,
  responded_at,
  created_at,
  teacher:teachers!lesson_reschedule_requests_teacher_id_fkey(display_name),
  student:students!lesson_reschedule_requests_student_id_fkey(english_name, full_name)
`;

function studentName(row: RescheduleRow): string {
  return row.student?.english_name?.trim() || row.student?.full_name?.trim() || "Student";
}

function rowToRequest(row: RescheduleRow, names?: { teacherName?: string; studentName?: string }): LessonRescheduleRequest {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    teacherId: row.teacher_id,
    teacherName: names?.teacherName ?? row.teacher?.display_name?.trim() ?? "Teacher",
    studentId: row.student_id,
    studentName: names?.studentName ?? studentName(row),
    originalScheduledAt: row.original_scheduled_at,
    proposedScheduledAt: row.proposed_scheduled_at,
    reason: row.reason ?? undefined,
    initiator: row.initiator,
    status: row.status,
    requestMonth: row.request_month,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? undefined,
  };
}

function monthKey(date = new Date()): string {
  return getDateKeyInTimezone(date, CANONICAL_TIMEZONE).slice(0, 7);
}

function activeStatuses(): RescheduleRequestStatus[] {
  return ["pending_student_approval", "pending_teacher_approval"];
}

async function fetchRescheduleRows(): Promise<RescheduleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .select(RESCHEDULE_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`reschedule_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as unknown as RescheduleRow[];
}

export async function warmRescheduleCache(): Promise<LessonRescheduleRequest[]> {
  const rows = await fetchRescheduleRows();
  const requests = rows.map((row) => rowToRequest(row));
  setRescheduleCache(requests);
  return requests;
}

export {
  STUDENT_RESCHEDULE_MONTHLY_LIMIT,
  getAllRescheduleRequests,
  getRescheduleRequestById,
  getPendingRequestForLesson,
  getRescheduleRequestsForTeacher,
  getRescheduleRequestsForStudent,
  countStudentRescheduleRequestsThisMonth,
  getStudentRescheduleRemaining,
  getActiveRescheduleRequests,
};

interface CreateRescheduleInput {
  lessonId: string;
  proposedScheduledAt: string;
  reason?: string;
  initiator: RescheduleInitiator;
}

async function proposedSlotUnavailable(
  lesson: Pick<Lesson, "id" | "teacherId" | "studentId" | "studentName" | "durationMinutes">,
  proposedScheduledAt: string
): Promise<boolean> {
  await warmLessonCache();
  await warmEnrollmentCache();
  const proposed = snapIsoToSlotGrid(proposedScheduledAt, CANONICAL_TIMEZONE);
  // One-off reschedule: this student's weekly hold and Availability Off must
  // not look like another class. Other students and same-date conflicts still block.
  return !isTeacherSlotFree(
    lesson.teacherId,
    proposed,
    lesson.id,
    lesson.durationMinutes ?? LESSON_MINUTES,
    { studentId: lesson.studentId, studentName: lesson.studentName }
  );
}

export async function createRescheduleRequestInDb(
  input: CreateRescheduleInput
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  const lesson = getLessonById(input.lessonId);
  if (!lesson?.studentId) return { error: "lesson_not_found" };
  if (lesson.status !== "scheduled" && lesson.status !== "reschedule_pending") {
    return { error: "lesson_not_eligible" };
  }

  if (getPendingRequestForLesson(input.lessonId)) {
    return { error: "pending_request_exists" };
  }

  const proposedScheduledAt = snapIsoToSlotGrid(
    input.proposedScheduledAt,
    CANONICAL_TIMEZONE
  );
  if (Number.isNaN(new Date(proposedScheduledAt).getTime())) {
    return { error: "invalid_time" };
  }

  if (await proposedSlotUnavailable(lesson, proposedScheduledAt)) {
    return { error: "slot_unavailable" };
  }

  const requestMonth = monthKey();
  if (input.initiator === "student") {
    if (getStudentRescheduleRemaining(lesson.studentId, requestMonth) <= 0) {
      return { error: "monthly_limit_reached" };
    }
  }

  const status: RescheduleRequestStatus =
    input.initiator === "teacher"
      ? "pending_student_approval"
      : "pending_teacher_approval";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .insert({
      lesson_id: lesson.id,
      teacher_id: lesson.teacherId,
      student_id: lesson.studentId,
      initiator: input.initiator,
      original_scheduled_at: lesson.scheduledAt,
      proposed_scheduled_at: proposedScheduledAt,
      status,
      reason: input.reason?.trim() || null,
      request_month: requestMonth,
    })
    .select(RESCHEDULE_SELECT)
    .single();

  if (error) {
    if (error.message.includes("Student reschedule limit exceeded")) {
      return { error: "monthly_limit_reached" };
    }
    throw new Error(`reschedule_create_failed: ${error.message}`);
  }

  await updateLessonStatusInDb(lesson.id, "reschedule_pending");

  const request = rowToRequest(data as unknown as RescheduleRow, {
    teacherName: lesson.teacherName,
    studentName: lesson.studentName,
  });
  patchRescheduleInCache(request);
  return { request };
}

async function finalizeRescheduleApproval(id: string): Promise<LessonRescheduleRequest | null> {
  await warmLessonCache();
  await warmRescheduleCache();
  return getRescheduleRequestById(id) ?? null;
}

export async function approveRescheduleRequestInDb(
  id: string,
  role: "teacher" | "student"
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  await warmLessonCache();
  await warmRescheduleCache();
  const current = getRescheduleRequestById(id);
  if (!current) return { error: "not_found" };

  if (role === "student" && current.status !== "pending_student_approval") {
    return { error: "not_awaiting_student" };
  }
  if (role === "teacher" && current.status !== "pending_teacher_approval") {
    return { error: "not_awaiting_teacher" };
  }

  const lesson = getLessonById(current.lessonId);
  if (!lesson) return { error: "lesson_not_found" };
  if (await proposedSlotUnavailable(lesson, current.proposedScheduledAt)) {
    return { error: "slot_unavailable" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_reschedule_requests")
    .update({
      status: "approved",
      responded_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`reschedule_approve_failed: ${error.message}`);
  }

  const request = await finalizeRescheduleApproval(id);
  if (request) {
    await restoreOccupiedWeeklyAvailabilityInDb(lesson.teacherId);
  }
  return request ? { request } : { error: "not_found" };
}

export async function rejectRescheduleRequestInDb(
  id: string,
  role: "teacher" | "student"
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  const current = getRescheduleRequestById(id);
  if (!current) return { error: "not_found" };

  if (role === "student" && current.status !== "pending_student_approval") {
    return { error: "not_awaiting_student" };
  }
  if (role === "teacher" && current.status !== "pending_teacher_approval") {
    return { error: "not_awaiting_teacher" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_reschedule_requests")
    .update({
      status: "rejected",
      responded_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`reschedule_reject_failed: ${error.message}`);
  }

  await updateLessonStatusInDb(current.lessonId, "scheduled");
  await warmRescheduleCache();
  return { request: getRescheduleRequestById(id) };
}

export async function adminApproveRescheduleRequestInDb(
  id: string
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  await warmLessonCache();
  await warmRescheduleCache();
  const current = getRescheduleRequestById(id);
  if (!current) return { error: "not_found" };
  if (!activeStatuses().includes(current.status)) return { error: "not_pending" };

  const lesson = getLessonById(current.lessonId);
  if (!lesson) return { error: "lesson_not_found" };
  if (await proposedSlotUnavailable(lesson, current.proposedScheduledAt)) {
    return { error: "slot_unavailable" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_reschedule_requests")
    .update({
      status: "approved",
      responded_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`reschedule_admin_approve_failed: ${error.message}`);
  }

  const request = await finalizeRescheduleApproval(id);
  if (request) {
    await restoreOccupiedWeeklyAvailabilityInDb(lesson.teacherId);
  }
  return request ? { request } : { error: "not_found" };
}

export async function adminRejectRescheduleRequestInDb(
  id: string
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  const current = getRescheduleRequestById(id);
  if (!current) return { error: "not_found" };
  if (!activeStatuses().includes(current.status)) return { error: "not_pending" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_reschedule_requests")
    .update({
      status: "rejected",
      responded_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`reschedule_admin_reject_failed: ${error.message}`);
  }

  await updateLessonStatusInDb(current.lessonId, "scheduled");
  await warmRescheduleCache();
  return { request: getRescheduleRequestById(id) };
}

export async function cancelRescheduleRequestInDb(
  id: string,
  role: "teacher" | "student"
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  const current = getRescheduleRequestById(id);
  if (!current) return { error: "not_found" };

  const isPending = activeStatuses().includes(current.status);
  if (!isPending) return { error: "not_cancellable" };
  if (current.initiator !== role) return { error: "not_initiator" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lesson_reschedule_requests")
    .update({
      status: "cancelled",
      responded_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`reschedule_cancel_failed: ${error.message}`);
  }

  await updateLessonStatusInDb(current.lessonId, "scheduled");
  await warmRescheduleCache();
  return { request: getRescheduleRequestById(id) };
}

export function createRescheduleRequest(_input: CreateRescheduleInput) {
  throw new Error("deprecated: use createRescheduleRequestInDb");
}

export function approveRescheduleRequest(_id: string, _role: "teacher" | "student") {
  throw new Error("deprecated: use approveRescheduleRequestInDb");
}

export function rejectRescheduleRequest(_id: string, _role: "teacher" | "student") {
  throw new Error("deprecated: use rejectRescheduleRequestInDb");
}

export function adminApproveRescheduleRequest(_id: string) {
  throw new Error("deprecated: use adminApproveRescheduleRequestInDb");
}

export function adminRejectRescheduleRequest(_id: string) {
  throw new Error("deprecated: use adminRejectRescheduleRequestInDb");
}

export function cancelRescheduleRequest(_id: string, _role: "teacher" | "student") {
  throw new Error("deprecated: use cancelRescheduleRequestInDb");
}

export function resetRescheduleStore() {
  setRescheduleCache([]);
}
