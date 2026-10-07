import type {
  TeacherCompensationOverviewRow,
  TeacherCompensationOverviewSummary,
  TeacherCompensationReviewStatus,
  TeacherHourlyRateHistoryEntry,
  TeacherPayrollPenaltyEvent,
} from "@/types";
import { createClient } from "@/lib/supabase/server";
import { getPersistedLessonByIdInDb } from "@/lib/lessons/repository";
import {
  getAdminLessonOperationLogByIdInDb,
  refreshAdminLessonOperationLogByIdInDb,
} from "@/lib/admin/admin-lesson-operation-log-repository";
import { refreshTeacherPayrollPenaltyEventByLesson } from "@/lib/teacher-payroll-penalty-event-repository";
import { deleteLessonById } from "@/lib/teacher-lesson-store-sync";
import { refreshEnrollmentByIdInDb } from "@/lib/enrollments/repository";

interface CompensationOverviewRpcRow {
  id: string;
  display_name: string;
  status: TeacherCompensationOverviewRow["teacherStatus"];
  employment_started_at: string;
  employment_started_at_verified: boolean;
  tenure_months: number;
  hourly_rate_php: number;
  completed_payout_count: number;
  recent_completed_classes: number;
  recent_total_hours: number;
  recent_perfect_months: number;
  quarterly_bonus_count: number;
  lifetime_no_show_count: number;
  recent_no_show_count: number;
  total_penalty_php: number;
  eligible_cycle: number;
  review_due: boolean;
  payouts_until_review: number;
  latest_status: TeacherCompensationReviewStatus | null;
  deferred_until: string | null;
}

interface CompensationOverviewRpcResult {
  summary: TeacherCompensationOverviewSummary;
  rows: CompensationOverviewRpcRow[];
}

export async function getTeacherCompensationOverviewInDb(limit = 100, offset = 0) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_teacher_compensation_overview", {
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    if (error.code === "42883" || error.message.includes("does not exist")) {
      return {
        migrationRequired: true,
        summary: {
          teacherCount: 0,
          reviewDueCount: 0,
          recentPenaltyTeacherCount: 0,
          quarterlyBonusAchieverCount: 0,
        },
        rows: [] as TeacherCompensationOverviewRow[],
      };
    }
    throw new Error(`teacher_compensation_overview_failed: ${error.message}`);
  }

  const result = data as unknown as CompensationOverviewRpcResult;
  return {
    migrationRequired: false,
    summary: result.summary,
    rows: (result.rows ?? []).map((row) => ({
      teacherId: row.id,
      teacherName: row.display_name,
      teacherStatus: row.status,
      employmentStartedAt: row.employment_started_at,
      employmentStartedAtVerified: row.employment_started_at_verified,
      tenureMonths: Number(row.tenure_months),
      hourlyRatePhp: Number(row.hourly_rate_php),
      completedPayoutCount: Number(row.completed_payout_count),
      recentCompletedClasses: Number(row.recent_completed_classes),
      recentTotalHours: Number(row.recent_total_hours),
      recentPerfectMonths: Number(row.recent_perfect_months),
      quarterlyBonusCount: Number(row.quarterly_bonus_count),
      lifetimeNoShowCount: Number(row.lifetime_no_show_count),
      recentNoShowCount: Number(row.recent_no_show_count),
      totalPenaltyPhp: Number(row.total_penalty_php),
      eligibleCycle: Number(row.eligible_cycle),
      reviewDue: Boolean(row.review_due),
      payoutsUntilReview: Number(row.payouts_until_review),
      latestReviewStatus: row.latest_status ?? undefined,
      deferredUntil: row.deferred_until ?? undefined,
    } satisfies TeacherCompensationOverviewRow)),
  };
}

export async function getTeacherCompensationDetailInDb(teacherId: string) {
  const supabase = await createClient();
  const [penaltiesResult, ratesResult, reviewsResult] = await Promise.all([
    supabase
      .from("teacher_payroll_penalty_events")
      .select(
        "id, teacher_id, lesson_id, operation_log_id, salary_month, occurred_at, duration_minutes, hourly_rate_snapshot_php, unpaid_amount_php, deduction_amount_php, reason, status, created_at, reversed_at, reversal_reason"
      )
      .eq("teacher_id", teacherId)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase
      .from("teacher_hourly_rate_history")
      .select(
        "id, teacher_id, previous_hourly_rate_php, hourly_rate_php, effective_month, source, reason, created_at"
      )
      .eq("teacher_id", teacherId)
      .order("effective_month", { ascending: false })
      .limit(30),
    supabase
      .from("teacher_compensation_reviews")
      .select(
        "id, cycle_number, qualifying_payout_count, status, previous_hourly_rate_php, new_hourly_rate_php, effective_month, deferred_until, review_note, reviewed_at, created_at"
      )
      .eq("teacher_id", teacherId)
      .order("cycle_number", { ascending: false })
      .limit(20),
  ]);

  const error = penaltiesResult.error ?? ratesResult.error ?? reviewsResult.error;
  if (error) throw new Error(`teacher_compensation_detail_failed: ${error.message}`);

  const penalties = (penaltiesResult.data ?? []).map((row) => ({
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
  })) as TeacherPayrollPenaltyEvent[];

  const rateHistory = (ratesResult.data ?? []).map((row) => ({
    id: row.id,
    teacherId: row.teacher_id,
    previousHourlyRatePhp: Number(row.previous_hourly_rate_php),
    hourlyRatePhp: Number(row.hourly_rate_php),
    effectiveMonth: row.effective_month,
    source: row.source,
    reason: row.reason,
    createdAt: row.created_at,
  })) as TeacherHourlyRateHistoryEntry[];

  return { penalties, rateHistory, reviews: reviewsResult.data ?? [] };
}

export async function saveTeacherCompensationReviewInDb(input: {
  teacherId: string;
  cycleNumber: number;
  status: Exclude<TeacherCompensationReviewStatus, "pending">;
  newHourlyRatePhp?: number;
  effectiveMonth?: string;
  deferredUntil?: string;
  reviewNote?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("admin_save_teacher_compensation_review", {
      p_teacher_id: input.teacherId,
      p_cycle_number: input.cycleNumber,
      p_status: input.status,
      p_new_hourly_rate_php: input.newHourlyRatePhp ?? null,
      p_effective_month: input.effectiveMonth ?? null,
      p_deferred_until: input.deferredUntil ?? null,
      p_review_note: input.reviewNote ?? null,
    })
    .single();
  if (error) throw new Error(`teacher_compensation_review_save_failed: ${error.message}`);
  return data;
}

export async function updateTeacherEmploymentStartInDb(
  teacherId: string,
  employmentStartedAt: string
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_update_teacher_employment_start", {
    p_teacher_id: teacherId,
    p_employment_started_at: employmentStartedAt,
  });
  if (error) throw new Error(`teacher_employment_start_update_failed: ${error.message}`);
}

export async function applyDueTeacherHourlyRatesInDb() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_due_teacher_hourly_rates");
  if (error) {
    if (error.code === "42883" || error.message.includes("does not exist")) return 0;
    throw new Error(`teacher_due_rates_apply_failed: ${error.message}`);
  }
  return Number(data ?? 0);
}

export async function scheduleTeacherHourlyRateInDb(input: {
  teacherId: string;
  hourlyRatePhp: number;
  effectiveMonth: string;
  source?: "manual_adjustment" | "bulk_adjustment";
  reason: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_schedule_teacher_hourly_rate", {
    p_teacher_id: input.teacherId,
    p_hourly_rate_php: input.hourlyRatePhp,
    p_effective_month: input.effectiveMonth,
    p_source: input.source ?? "manual_adjustment",
    p_reason: input.reason,
  });
  if (error) throw new Error(`teacher_rate_schedule_failed: ${error.message}`);
}

export async function bulkScheduleTeacherHourlyRateInDb(input: {
  teacherIds: string[];
  hourlyRatePhp: number;
  effectiveMonth: string;
  reason: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_bulk_schedule_teacher_hourly_rate", {
    p_teacher_ids: input.teacherIds,
    p_hourly_rate_php: input.hourlyRatePhp,
    p_effective_month: input.effectiveMonth,
    p_reason: input.reason,
  });
  if (error) throw new Error(`teacher_rate_bulk_schedule_failed: ${error.message}`);
  return Number(data ?? 0);
}

export async function applyTeacherNoShowAtomicallyInDb(input: {
  lessonId: string;
  makeupScheduledAt: string;
  weekStartKey: string;
  note?: string;
  adminName?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_apply_teacher_no_show", {
    p_lesson_id: input.lessonId,
    p_makeup_scheduled_at: input.makeupScheduledAt,
    p_week_start_key: input.weekStartKey,
    p_note: input.note ?? null,
    p_admin_name: input.adminName ?? "관리자",
  });
  if (error) throw new Error(error.message);

  const result = data as {
    originalLessonId: string;
    makeupLessonId: string;
    operationLogId: string;
    penaltyEventId: string;
    deductionAmountPhp: number;
  };
  const [original, makeup] = await Promise.all([
    getPersistedLessonByIdInDb(result.originalLessonId),
    getPersistedLessonByIdInDb(result.makeupLessonId),
  ]);
  await Promise.all([
    getAdminLessonOperationLogByIdInDb(result.operationLogId),
    refreshTeacherPayrollPenaltyEventByLesson(result.originalLessonId),
  ]);
  if (!original || !makeup) throw new Error("no_show_result_missing");
  return { original, makeup, deductionAmountPhp: Number(result.deductionAmountPhp) };
}

export async function reverseTeacherNoShowAtomicallyInDb(operationLogId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_reverse_teacher_no_show", {
    p_operation_log_id: operationLogId,
    p_reason: "관리자 노쇼 조치 취소",
  });
  if (error) {
    if (error.code === "42883" || error.message.includes("does not exist")) return false;
    throw new Error(error.message);
  }
  const result = data as {
    handled: boolean;
    originalLessonId?: string;
    makeupLessonId?: string;
    enrollmentId?: string;
  };
  if (!result.handled || !result.originalLessonId) return false;

  if (result.makeupLessonId) deleteLessonById(result.makeupLessonId);
  await Promise.all([
    getPersistedLessonByIdInDb(result.originalLessonId),
    refreshTeacherPayrollPenaltyEventByLesson(result.originalLessonId),
    refreshAdminLessonOperationLogByIdInDb(operationLogId),
    result.enrollmentId ? refreshEnrollmentByIdInDb(result.enrollmentId) : Promise.resolve(null),
  ]);
  return true;
}
