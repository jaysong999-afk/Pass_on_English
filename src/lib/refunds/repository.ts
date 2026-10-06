import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchExchangeRates } from "@/lib/finance/accounting";
import { refreshFinanceTransactionByIdInDb } from "@/lib/finance/repository";
import { sendPushToUsersInDb } from "@/lib/push/send-service";
import { createRequestDbClient, createServiceDbClient } from "@/lib/supabase/db-client";
import type {
  EnrollmentRefundPreview,
  FinalizeEnrollmentRefundInput,
  FinalizedEnrollmentRefund,
} from "@/lib/refunds/types";

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPreview(value: unknown): EnrollmentRefundPreview {
  const row = value as Record<string, unknown>;
  return {
    enrollmentId: String(row.enrollmentId),
    studentId: String(row.studentId),
    studentName: String(row.studentName),
    teacherName: String(row.teacherName),
    planLabel: String(row.planLabel),
    status: String(row.status),
    currency: row.currency === "CNY" ? "CNY" : "KRW",
    paidAmount: Number(row.paidAmount),
    paidSessionsTotal: numberOrNull(row.paidSessionsTotal),
    paidSessionsSource: row.paidSessionsSource == null ? null : String(row.paidSessionsSource),
    basisNeedsReview: Boolean(row.basisNeedsReview),
    countedSessions: Number(row.countedSessions),
    studentAbsentSessions: Number(row.studentAbsentSessions),
    companyExcludedSessions: Number(row.companyExcludedSessions),
    cancelledSessions: Number(row.cancelledSessions),
    futureCancellableSessions: Number(row.futureCancellableSessions),
    unresolvedPastSessions: Number(row.unresolvedPastSessions),
    policyVersion: String(row.policyVersion),
    policyTier: row.policyTier == null
      ? null
      : row.policyTier as EnrollmentRefundPreview["policyTier"],
    refundRate: numberOrNull(row.refundRate),
    calculatedRefundAmount: numberOrNull(row.calculatedRefundAmount),
    alreadyRefunded: Boolean(row.alreadyRefunded),
  };
}

export async function getEnrollmentRefundPreviewInDb(
  enrollmentId: string,
  db?: SupabaseClient
): Promise<EnrollmentRefundPreview> {
  const requestDb = db ?? await createRequestDbClient();
  const { data, error } = await requestDb.rpc("admin_preview_enrollment_refund", {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw new Error(error.message);
  return mapPreview(data);
}

export async function finalizeEnrollmentRefundInDb(
  input: FinalizeEnrollmentRefundInput,
  db?: SupabaseClient
): Promise<FinalizedEnrollmentRefund> {
  const requestDb = db ?? await createRequestDbClient();
  const rates = await fetchExchangeRates();
  const { data, error } = await requestDb.rpc("admin_finalize_enrollment_refund", {
    p_enrollment_id: input.enrollmentId,
    p_expected_counted_sessions: input.expectedCountedSessions,
    p_expected_calculated_amount: input.expectedCalculatedAmount,
    p_actual_refund_amount: input.actualRefundAmount,
    p_refund_reason: input.refundReason,
    p_adjustment_reason: input.adjustmentReason?.trim() || null,
    p_admin_note: input.adminNote?.trim() || null,
    p_paid_sessions_total_override: input.paidSessionsTotalOverride ?? null,
    p_refund_completed: input.refundCompleted,
    p_exchange_rate: rates.cnyToKrw,
    p_exchange_rate_source: rates.source ?? "fallback",
    p_exchange_rate_at: rates.updatedAt,
  });
  if (error) throw new Error(error.message);

  const row = data as Record<string, unknown>;
  const result: FinalizedEnrollmentRefund = {
    refundId: String(row.refundId),
    enrollmentId: String(row.enrollmentId),
    currency: row.currency === "CNY" ? "CNY" : "KRW",
    calculatedRefundAmount: Number(row.calculatedRefundAmount),
    actualRefundAmount: Number(row.actualRefundAmount),
    cancelledLessonCount: Number(row.cancelledLessonCount),
    financeTransactionId: String(row.financeTransactionId),
    studentUserId: String(row.studentUserId),
    teacherUserIds: Array.isArray(row.teacherUserIds)
      ? row.teacherUserIds.map(String)
      : [],
    studentUrl: String(row.studentUrl),
    teacherUrl: String(row.teacherUrl),
  };

  // Keep an already-warmed finance read model current with one row, rather
  // than reloading the complete ledger after a refund.
  await refreshFinanceTransactionByIdInDb(result.financeTransactionId, requestDb);
  return result;
}

/** In-app notifications are committed in the refund transaction; Push is best-effort after commit. */
export async function sendEnrollmentRefundPush(result: FinalizedEnrollmentRefund): Promise<void> {
  const serviceDb = createServiceDbClient();
  const isChinese = result.studentUrl.startsWith("/zh-CN/");
  await Promise.all([
    sendPushToUsersInDb(serviceDb, [result.studentUserId], {
      title: isChinese ? "课程取消及退款处理完成" : "수강 취소 및 환불 처리 완료",
      body: isChinese
        ? "剩余课程已取消，退款处理已完成。"
        : "잔여 수업 취소와 환불 처리가 완료되었습니다.",
      url: result.studentUrl,
      tag: `enrollment-refund-${result.refundId}`,
      data: { kind: "enrollment_refund", refundId: result.refundId },
    }),
    sendPushToUsersInDb(serviceDb, result.teacherUserIds, {
      title: "Enrollment cancelled",
      body: "The student's remaining lessons were cancelled after a refund.",
      url: result.teacherUrl,
      tag: `enrollment-refund-${result.refundId}`,
      data: { kind: "enrollment_refund", refundId: result.refundId },
    }),
  ]);
}
