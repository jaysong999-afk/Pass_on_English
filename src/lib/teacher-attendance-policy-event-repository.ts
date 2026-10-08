import type { TeacherAttendancePolicyEvent } from "@/types";
import { createBootstrapDbClient, createServiceDbClient } from "@/lib/supabase/db-client";
import {
  getTeacherAttendancePolicyEventCache,
  setTeacherAttendancePolicyEventCache,
  upsertTeacherAttendancePolicyEventCache,
} from "@/lib/teacher-attendance-policy-event-cache";

interface AttendancePolicyEventRow {
  id: string;
  teacher_id: string;
  enrollment_id: string;
  reschedule_request_id: string;
  event_month: string;
  perfect_attendance_forfeited: boolean;
  quarterly_bonus_reset: boolean;
  created_at: string;
}

const EVENT_SELECT =
  "id, teacher_id, enrollment_id, reschedule_request_id, event_month, perfect_attendance_forfeited, quarterly_bonus_reset, created_at";

function rowToEvent(row: AttendancePolicyEventRow): TeacherAttendancePolicyEvent {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    enrollmentId: row.enrollment_id,
    rescheduleRequestId: row.reschedule_request_id,
    eventMonth: row.event_month,
    perfectAttendanceForfeited: row.perfect_attendance_forfeited,
    quarterlyBonusReset: row.quarterly_bonus_reset,
    createdAt: row.created_at,
  };
}

export async function warmTeacherAttendancePolicyEventCache() {
  const supabase = createBootstrapDbClient();
  const from = new Date();
  from.setMonth(from.getMonth() - 24);
  const fromMonth = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("teacher_attendance_policy_events")
    .select(EVENT_SELECT)
    .gte("event_month", fromMonth)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.message.includes("does not exist")
    ) return [];
    throw new Error(`teacher_attendance_policy_events_fetch_failed: ${error.message}`);
  }
  const events = ((data ?? []) as AttendancePolicyEventRow[]).map(rowToEvent);
  setTeacherAttendancePolicyEventCache(events);
  return getTeacherAttendancePolicyEventCache();
}

export async function refreshTeacherAttendancePolicyEventByRequest(rescheduleRequestId: string) {
  const supabase = createServiceDbClient();
  const { data, error } = await supabase
    .from("teacher_attendance_policy_events")
    .select(EVENT_SELECT)
    .eq("reschedule_request_id", rescheduleRequestId)
    .maybeSingle();
  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST205" ||
      error.message.includes("does not exist")
    ) return null;
    throw new Error(`teacher_attendance_policy_event_fetch_failed: ${error.message}`);
  }
  if (!data) return null;
  const event = rowToEvent(data as AttendancePolicyEventRow);
  upsertTeacherAttendancePolicyEventCache(event);
  return event;
}
