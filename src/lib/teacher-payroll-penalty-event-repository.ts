import type { TeacherPayrollPenaltyEvent } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherPayrollPenaltyEventCache,
  setTeacherPayrollPenaltyEventCache,
  upsertTeacherPayrollPenaltyEventCache,
} from "@/lib/teacher-payroll-penalty-event-cache";

interface PenaltyEventRow {
  id: string;
  teacher_id: string;
  lesson_id: string;
  operation_log_id: string | null;
  salary_month: string;
  occurred_at: string;
  duration_minutes: number;
  hourly_rate_snapshot_php: number;
  unpaid_amount_php: number;
  deduction_amount_php: number;
  reason: string;
  status: "active" | "reversed";
  created_at: string;
  reversed_at: string | null;
  reversal_reason: string | null;
}

const PENALTY_EVENT_SELECT =
  "id, teacher_id, lesson_id, operation_log_id, salary_month, occurred_at, duration_minutes, hourly_rate_snapshot_php, unpaid_amount_php, deduction_amount_php, reason, status, created_at, reversed_at, reversal_reason";

function rowToPenaltyEvent(row: PenaltyEventRow): TeacherPayrollPenaltyEvent {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    lessonId: row.lesson_id,
    operationLogId: row.operation_log_id ?? undefined,
    salaryMonth: row.salary_month,
    occurredAt: row.occurred_at,
    durationMinutes: row.duration_minutes,
    hourlyRateSnapshotPhp: Number(row.hourly_rate_snapshot_php),
    unpaidAmountPhp: Number(row.unpaid_amount_php),
    deductionAmountPhp: Number(row.deduction_amount_php),
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reversedAt: row.reversed_at ?? undefined,
    reversalReason: row.reversal_reason ?? undefined,
  };
}

export async function warmTeacherPayrollPenaltyEventCache() {
  const supabase = await createClient();
  const fromMonth = new Date();
  fromMonth.setMonth(fromMonth.getMonth() - 24);
  const monthKey = `${fromMonth.getFullYear()}-${String(fromMonth.getMonth() + 1).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("teacher_payroll_penalty_events")
    .select(PENALTY_EVENT_SELECT)
    .gte("salary_month", monthKey)
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (error) {
    // During the code-first deployment window migration 051 may not exist yet.
    if (error.code === "42P01" || error.message.includes("does not exist")) return [];
    throw new Error(`teacher_penalty_events_fetch_failed: ${error.message}`);
  }

  const events = ((data ?? []) as PenaltyEventRow[]).map(rowToPenaltyEvent);
  setTeacherPayrollPenaltyEventCache(events);
  return getTeacherPayrollPenaltyEventCache();
}

export async function refreshTeacherPayrollPenaltyEventByLesson(lessonId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_payroll_penalty_events")
    .select(PENALTY_EVENT_SELECT)
    .eq("lesson_id", lessonId)
    .maybeSingle();
  if (error) throw new Error(`teacher_penalty_event_fetch_failed: ${error.message}`);
  if (!data) return null;
  const event = rowToPenaltyEvent(data as PenaltyEventRow);
  upsertTeacherPayrollPenaltyEventCache(event);
  return event;
}

export async function reverseTeacherPayrollPenaltyEventInDb(
  lessonId: string,
  reason = "노쇼 조치 취소"
): Promise<boolean> {
  const supabase = await createClient();
  const { data: existing, error: fetchError } = await supabase
    .from("teacher_payroll_penalty_events")
    .select(PENALTY_EVENT_SELECT)
    .eq("lesson_id", lessonId)
    .eq("status", "active")
    .maybeSingle();
  if (fetchError) {
    if (fetchError.code === "42P01" || fetchError.message.includes("does not exist")) return false;
    throw new Error(`teacher_penalty_event_fetch_failed: ${fetchError.message}`);
  }
  if (!existing) return false;

  const event = rowToPenaltyEvent(existing as PenaltyEventRow);
  const { data, error } = await supabase
    .from("teacher_payroll_penalty_events")
    .update({
      status: "reversed",
      reversed_at: new Date().toISOString(),
      reversal_reason: reason,
    })
    .eq("id", event.id)
    .eq("status", "active")
    .select(PENALTY_EVENT_SELECT)
    .single();
  if (error) throw new Error(`teacher_penalty_event_reverse_failed: ${error.message}`);

  upsertTeacherPayrollPenaltyEventCache(rowToPenaltyEvent(data as PenaltyEventRow));

  const { data: statement, error: statementError } = await supabase
    .from("teacher_salary_statements")
    .select("id, status, is_live_estimate, deductions")
    .eq("teacher_id", event.teacherId)
    .eq("month", event.salaryMonth)
    .maybeSingle();
  if (statementError) throw new Error(`teacher_penalty_statement_fetch_failed: ${statementError.message}`);

  if (statement && statement.status === "estimated") {
    const { error: updateError } = await supabase
      .from("teacher_salary_statements")
      .update({ deductions: Math.max(0, Number(statement.deductions) - event.deductionAmountPhp) })
      .eq("id", statement.id);
    if (updateError) throw new Error(`teacher_penalty_statement_update_failed: ${updateError.message}`);
  } else if (statement && ["processing", "paid", "completed"].includes(statement.status)) {
    const correctionReason = `노쇼 패널티 취소 보정 (${event.id})`;
    const { data: duplicate, error: duplicateError } = await supabase
      .from("teacher_bonuses")
      .select("id")
      .eq("teacher_id", event.teacherId)
      .eq("reason", correctionReason)
      .maybeSingle();
    if (duplicateError) throw new Error(`teacher_penalty_correction_fetch_failed: ${duplicateError.message}`);
    if (!duplicate) {
      const { error: correctionError } = await supabase.from("teacher_bonuses").insert({
        teacher_id: event.teacherId,
        month_key: new Date().toISOString().slice(0, 7),
        amount_php: event.deductionAmountPhp,
        reason: correctionReason,
      });
      if (correctionError) {
        throw new Error(`teacher_penalty_correction_insert_failed: ${correctionError.message}`);
      }
    }
  }

  return true;
}
