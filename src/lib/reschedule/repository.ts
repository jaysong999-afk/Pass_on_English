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
  warmLessonCache,
} from "@/lib/lessons/repository";
import {
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
import {
  studentNameFromDb,
  teacherNameFromDb,
  type StudentNameDbJoin,
  type TeacherNameDbJoin,
} from "@/lib/db/join-types";

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
  teacher?: TeacherNameDbJoin | null;
  student?: StudentNameDbJoin | null;
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

function rowToRequest(row: RescheduleRow, names?: { teacherName?: string; studentName?: string }): LessonRescheduleRequest {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    teacherId: row.teacher_id,
    teacherName: names?.teacherName ?? teacherNameFromDb(row.teacher),
    studentId: row.student_id,
    studentName: names?.studentName ?? studentNameFromDb(row.student, "Student"),
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

function rescheduleRpcError(error: { message: string }): string | null {
  const known = [
    "lesson_not_found", "lesson_not_eligible", "forbidden", "pending_request_exists",
    "slot_unavailable", "monthly_limit_reached", "not_found", "not_pending",
    "not_awaiting_student", "not_awaiting_teacher", "not_initiator", "invalid_action",
  ];
  return known.find((code) => error.message.includes(code)) ?? null;
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
  void status;
  const { data, error } = await supabase
    .rpc("create_lesson_reschedule_request", {
      p_lesson_id: lesson.id,
      p_proposed_scheduled_at: proposedScheduledAt,
      p_reason: input.reason?.trim() || "",
      p_initiator: input.initiator,
      p_request_month: requestMonth,
    })
    .single();

  if (error) {
    if (error.message.includes("Student reschedule limit exceeded")) {
      return { error: "monthly_limit_reached" };
    }
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
    throw new Error(`reschedule_create_failed: ${error.message}`);
  }

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
  const { error } = await supabase.rpc("respond_lesson_reschedule_request", {
    p_request_id: id,
    p_action: "approve",
  });

  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
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
  const { error } = await supabase.rpc("respond_lesson_reschedule_request", {
    p_request_id: id,
    p_action: "reject",
  });

  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
    throw new Error(`reschedule_reject_failed: ${error.message}`);
  }
  await warmLessonCache();
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
  const { error } = await supabase.rpc("respond_lesson_reschedule_request", {
    p_request_id: id,
    p_action: "approve",
  });

  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
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
  const { error } = await supabase.rpc("respond_lesson_reschedule_request", {
    p_request_id: id,
    p_action: "reject",
  });

  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
    throw new Error(`reschedule_admin_reject_failed: ${error.message}`);
  }
  await warmLessonCache();
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
  const { error } = await supabase.rpc("respond_lesson_reschedule_request", {
    p_request_id: id,
    p_action: "cancel",
  });

  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
    throw new Error(`reschedule_cancel_failed: ${error.message}`);
  }
  await warmLessonCache();
  await warmRescheduleCache();
  return { request: getRescheduleRequestById(id) };
}

export function createRescheduleRequest(_input: CreateRescheduleInput) {
  void _input;
  throw new Error("deprecated: use createRescheduleRequestInDb");
}

export function approveRescheduleRequest(_id: string, _role: "teacher" | "student") {
  void _id;
  void _role;
  throw new Error("deprecated: use approveRescheduleRequestInDb");
}

export function rejectRescheduleRequest(_id: string, _role: "teacher" | "student") {
  void _id;
  void _role;
  throw new Error("deprecated: use rejectRescheduleRequestInDb");
}

export function adminApproveRescheduleRequest(_id: string) {
  void _id;
  throw new Error("deprecated: use adminApproveRescheduleRequestInDb");
}

export function adminRejectRescheduleRequest(_id: string) {
  void _id;
  throw new Error("deprecated: use adminRejectRescheduleRequestInDb");
}

export function cancelRescheduleRequest(_id: string, _role: "teacher" | "student") {
  void _id;
  void _role;
  throw new Error("deprecated: use cancelRescheduleRequestInDb");
}

export function resetRescheduleStore() {
  setRescheduleCache([]);
}
