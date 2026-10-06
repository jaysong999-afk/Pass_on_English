import type { RefundPolicyTier } from "@/lib/refunds/policy";

export type RefundCurrency = "KRW" | "CNY";

export interface EnrollmentRefundPreview {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  teacherName: string;
  planLabel: string;
  status: string;
  currency: RefundCurrency;
  paidAmount: number;
  paidSessionsTotal: number | null;
  paidSessionsSource: string | null;
  basisNeedsReview: boolean;
  countedSessions: number;
  studentAbsentSessions: number;
  companyExcludedSessions: number;
  cancelledSessions: number;
  futureCancellableSessions: number;
  unresolvedPastSessions: number;
  policyVersion: string;
  policyTier: RefundPolicyTier | null;
  refundRate: number | null;
  calculatedRefundAmount: number | null;
  alreadyRefunded: boolean;
}

export interface FinalizeEnrollmentRefundInput {
  enrollmentId: string;
  expectedCountedSessions: number;
  expectedCalculatedAmount: number;
  actualRefundAmount: number;
  refundReason: string;
  adjustmentReason?: string;
  adminNote?: string;
  paidSessionsTotalOverride?: number;
  refundCompleted: true;
}

export interface FinalizedEnrollmentRefund {
  refundId: string;
  enrollmentId: string;
  currency: RefundCurrency;
  calculatedRefundAmount: number;
  actualRefundAmount: number;
  cancelledLessonCount: number;
  financeTransactionId: string;
  studentUserId: string;
  teacherUserIds: string[];
  studentUrl: string;
  teacherUrl: string;
}
