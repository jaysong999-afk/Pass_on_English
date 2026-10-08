import type {
  LessonRescheduleRequest,
  RescheduleInitiator,
  RescheduleRequestStatus,
} from "@/types";
import { snapIsoToSlotGrid } from "@/lib/availability/time-utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { createClient } from "@/lib/supabase/server";
import { createBootstrapDbClient, createServiceDbClient } from "@/lib/supabase/db-client";
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
import { refreshTeacherAttendancePolicyEventByRequest } from "@/lib/teacher-attendance-policy-event-repository";

interface RescheduleRow {
  id: string;
  lesson_id: string;
  enrollment_id: string | null;
  teacher_id: string;
  student_id: string;
  initiator: RescheduleInitiator;
  original_scheduled_at: string;
  proposed_scheduled_at: string;
  status: RescheduleRequestStatus;
  reason: string | null;
  request_month: string;
  is_trial_request: boolean;
  teacher_bonus_policy_applies: boolean;
  closed_reason: string | null;
  responded_at: string | null;
  created_at: string;
  teacher?: TeacherNameDbJoin | null;
  student?: StudentNameDbJoin | null;
}

export const RESCHEDULE_SELECT = `
  id,
  lesson_id,
  enrollment_id,
  teacher_id,
  student_id,
  initiator,
  original_scheduled_at,
  proposed_scheduled_at,
  status,
  reason,
  request_month,
  is_trial_request,
  teacher_bonus_policy_applies,
  closed_reason,
  responded_at,
  created_at,
  teacher:teachers!lesson_reschedule_requests_teacher_id_fkey(display_name),
  student:students!lesson_reschedule_requests_student_id_fkey(english_name, full_name)
`;

function rowToRequest(
  row: RescheduleRow,
  names?: { teacherName?: string; studentName?: string }
): LessonRescheduleRequest {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    enrollmentId: row.enrollment_id ?? undefined,
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
    isTrialRequest: row.is_trial_request,
    teacherBonusPolicyApplies: row.teacher_bonus_policy_applies,
    closedReason: row.closed_reason ?? undefined,
    createdAt: row.created_at,
    respondedAt: row.responded_at ?? undefined,
  };
}

function rescheduleRpcError(error: { message: string }): string | null {
  const known = [
    "lesson_not_found",
    "enrollment_not_found",
    "lesson_not_eligible",
    "forbidden",
    "pending_request_exists",
    "slot_unavailable",
    "teacher_lesson_overlap",
    "student_reschedule_limit_reached",
    "reschedule_deadline_passed",
    "not_found",
    "not_pending",
    "not_awaiting_student",
    "not_awaiting_teacher",
    "not_initiator",
    "invalid_action",
  ];
  const code = known.find((candidate) => error.message.includes(candidate)) ?? null;
  return code === "teacher_lesson_overlap" ? "slot_unavailable" : code;
}

export async function warmRescheduleCache(): Promise<LessonRescheduleRequest[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .select(RESCHEDULE_SELECT)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw new Error(`reschedule_fetch_failed: ${error.message}`);
  const requests = ((data ?? []) as unknown as RescheduleRow[]).map((row) => rowToRequest(row));
  setRescheduleCache(requests);
  return requests;
}

export async function listAllRescheduleRequestsInDb(limit = 200) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .select(RESCHEDULE_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`reschedule_fetch_failed: ${error.message}`);
  return ((data ?? []) as unknown as RescheduleRow[]).map((row) => rowToRequest(row));
}

export async function listStudentRescheduleRequestsInDb(studentId: string, limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .select(RESCHEDULE_SELECT)
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`student_reschedule_fetch_failed: ${error.message}`);
  const requests = ((data ?? []) as unknown as RescheduleRow[]).map((row) => rowToRequest(row));
  requests.forEach(patchRescheduleInCache);
  return requests;
}

export async function listTeacherRescheduleRequestsInDb(teacherId: string, limit = 100) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .select(RESCHEDULE_SELECT)
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`teacher_reschedule_fetch_failed: ${error.message}`);
  const requests = ((data ?? []) as unknown as RescheduleRow[]).map((row) => rowToRequest(row));
  requests.forEach(patchRescheduleInCache);
  return requests;
}

export async function getRescheduleRequestInDb(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lesson_reschedule_requests")
    .select(RESCHEDULE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`reschedule_fetch_failed: ${error.message}`);
  return data ? rowToRequest(data as unknown as RescheduleRow) : null;
}

export async function countTeacherApprovedReschedulesForEnrollmentInDb(
  enrollmentId: string | undefined,
  teacherId: string
): Promise<number> {
  if (!enrollmentId) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("lesson_reschedule_requests")
    .select("id", { count: "exact", head: true })
    .eq("enrollment_id", enrollmentId)
    .eq("teacher_id", teacherId)
    .eq("initiator", "teacher")
    .eq("status", "approved")
    .eq("is_trial_request", false)
    .eq("teacher_bonus_policy_applies", true);
  if (error) throw new Error(`teacher_reschedule_count_failed: ${error.message}`);
  return count ?? 0;
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

export async function createRescheduleRequestInDb(
  input: CreateRescheduleInput
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  const proposedScheduledAt = snapIsoToSlotGrid(input.proposedScheduledAt, CANONICAL_TIMEZONE);
  if (Number.isNaN(new Date(proposedScheduledAt).getTime())) return { error: "invalid_time" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("create_lesson_reschedule_request", {
      p_lesson_id: input.lessonId,
      p_proposed_scheduled_at: proposedScheduledAt,
      p_reason: input.reason?.trim() || "",
      p_initiator: input.initiator,
    })
    .single();

  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
    throw new Error(`reschedule_create_failed: ${error.message}`);
  }

  const request = rowToRequest(data as unknown as RescheduleRow);
  patchRescheduleInCache(request);
  return { request };
}

async function respondToRescheduleRequestInDb(
  id: string,
  action: "approve" | "reject" | "cancel"
): Promise<{ request?: LessonRescheduleRequest; error?: string }> {
  const current = await getRescheduleRequestInDb(id);
  if (!current) return { error: "not_found" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("respond_lesson_reschedule_request", {
      p_request_id: id,
      p_action: action,
    })
    .single();
  if (error) {
    const code = rescheduleRpcError(error);
    if (code) return { error: code };
    throw new Error(`reschedule_${action}_failed: ${error.message}`);
  }

  const request = rowToRequest(data as unknown as RescheduleRow, {
    teacherName: current.teacherName,
    studentName: current.studentName,
  });
  patchRescheduleInCache(request);
  if (
    action === "approve" &&
    request.status === "approved" &&
    request.initiator === "teacher" &&
    request.teacherBonusPolicyApplies !== false &&
    !request.isTrialRequest
  ) {
    await refreshTeacherAttendancePolicyEventByRequest(request.id);
  }
  if (action === "approve" && request.closedReason === "expired_at_start") {
    return { request, error: "request_expired" };
  }
  return { request };
}

export function approveRescheduleRequestInDb(id: string, role: "teacher" | "student") {
  void role;
  return respondToRescheduleRequestInDb(id, "approve");
}

export function rejectRescheduleRequestInDb(id: string, role: "teacher" | "student") {
  void role;
  return respondToRescheduleRequestInDb(id, "reject");
}

export function cancelRescheduleRequestInDb(id: string, role: "teacher" | "student") {
  void role;
  return respondToRescheduleRequestInDb(id, "cancel");
}

export function adminApproveRescheduleRequestInDb(id: string) {
  return respondToRescheduleRequestInDb(id, "approve");
}

export function adminRejectRescheduleRequestInDb(id: string) {
  return respondToRescheduleRequestInDb(id, "reject");
}

export async function expireDueRescheduleRequestsInDb(): Promise<number> {
  const supabase = createServiceDbClient();
  const { data, error } = await supabase.rpc("expire_due_lesson_reschedule_requests");
  if (error) {
    if (
      error.code === "42883" ||
      error.code === "PGRST202" ||
      error.message.includes("does not exist") ||
      error.message.includes("Could not find the function")
    ) return 0;
    throw new Error(`reschedule_expiry_failed: ${error.message}`);
  }
  return Number(data ?? 0);
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
