import type { TeacherPayrollPenalty } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  getTeacherPayrollPenaltyCache,
  removeTeacherPayrollPenaltyCache,
  setTeacherPayrollPenaltyCache,
  upsertTeacherPayrollPenaltyCache,
} from "@/lib/teacher-payroll-penalty-cache";
import { getTeacherLessons } from "@/lib/teacher-lesson-store-sync";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";

interface TeacherPayrollPenaltyRow {
  id: string;
  teacher_id: string;
  month: string;
  perfect_attendance_forfeited: boolean;
  quarterly_bonus_reset: boolean;
  reason: string | null;
  created_at: string;
}

function rowToPenalty(row: TeacherPayrollPenaltyRow): TeacherPayrollPenalty {
  return {
    teacherId: row.teacher_id,
    month: row.month,
    perfectAttendanceForfeited: row.perfect_attendance_forfeited,
    quarterlyBonusReset: row.quarterly_bonus_reset,
    reason: row.reason ?? undefined,
    createdAt: row.created_at,
  };
}

async function fetchPenaltyRows(): Promise<TeacherPayrollPenaltyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_payroll_penalties")
    .select(
      "id, teacher_id, month, perfect_attendance_forfeited, quarterly_bonus_reset, reason, created_at"
    );

  if (error) {
    throw new Error(`teacher_payroll_penalties_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as TeacherPayrollPenaltyRow[];
}

export async function warmTeacherPayrollPenaltyCache() {
  const rows = await fetchPenaltyRows();
  setTeacherPayrollPenaltyCache(rows.map(rowToPenalty));
  return getTeacherPayrollPenaltyCache();
}

export async function applyTeacherNoShowPenaltyInDb(
  teacherId: string,
  month: string,
  reason?: string
): Promise<TeacherPayrollPenalty> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_payroll_penalties")
    .upsert(
      {
        teacher_id: teacherId,
        month,
        perfect_attendance_forfeited: true,
        quarterly_bonus_reset: true,
        reason: reason ?? null,
      },
      { onConflict: "teacher_id,month" }
    )
    .select(
      "id, teacher_id, month, perfect_attendance_forfeited, quarterly_bonus_reset, reason, created_at"
    )
    .single();

  if (error) {
    throw new Error(`teacher_payroll_penalty_upsert_failed: ${error.message}`);
  }

  const penalty = rowToPenalty(data as TeacherPayrollPenaltyRow);
  upsertTeacherPayrollPenaltyCache(penalty);
  return { ...penalty };
}

export async function revertTeacherNoShowPenaltyInDb(
  teacherId: string,
  month: string,
  reasonMatch?: string
): Promise<boolean> {
  const stillHasNoShow = getTeacherLessons(teacherId).some((lesson) =>
    lesson.teacherNoShow &&
    getDateKeyInTimezone(new Date(lesson.scheduledAt), CANONICAL_TIMEZONE).slice(0, 7) === month
  );
  // A monthly penalty represents all no-shows in that month. Undoing one
  // operation must not restore bonuses while another no-show remains.
  if (stillHasNoShow) return false;

  const existing = getTeacherPayrollPenaltyCache().find(
    (p) => p.teacherId === teacherId && p.month === month
  );
  if (!existing) {
    const row = (await fetchPenaltyRows()).find(
      (p) => p.teacher_id === teacherId && p.month === month
    );
    if (!row) return false;
    if (reasonMatch && !(row.reason ?? "").includes(reasonMatch)) return false;
  } else if (reasonMatch && !(existing.reason ?? "").includes(reasonMatch)) {
    return false;
  }

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("teacher_payroll_penalties")
    .delete({ count: "exact" })
    .eq("teacher_id", teacherId)
    .eq("month", month);

  if (error) {
    throw new Error(`teacher_payroll_penalty_delete_failed: ${error.message}`);
  }

  if ((count ?? 0) === 0) return false;

  removeTeacherPayrollPenaltyCache(teacherId, month);
  return true;
}
