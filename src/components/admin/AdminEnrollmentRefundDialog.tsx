"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { calculateRefundPolicy, refundTierLabel } from "@/lib/refunds/policy";
import type {
  EnrollmentRefundPreview,
  FinalizedEnrollmentRefund,
} from "@/lib/refunds/types";
import { formatCurrency } from "@/lib/utils";

interface AdminEnrollmentRefundDialogProps {
  enrollmentId: string;
  planLabel: string;
  disabled?: boolean;
  onFinalized: (result: FinalizedEnrollmentRefund) => void;
}

function friendlyError(error: string): string {
  if (error.includes("unresolved_past_lessons")) {
    return "과거 미처리 수업이 있습니다. 해당 수업을 완료·결석·취소 중 하나로 먼저 확정해 주세요.";
  }
  if (error.includes("refund_preview_changed_retry")) {
    return "수업 기록이 변경되었습니다. 미리보기를 다시 불러온 뒤 확인해 주세요.";
  }
  if (error.includes("refund_already_finalized")) return "이미 환불이 확정된 수강입니다.";
  if (error.includes("adjustment_reason_required")) return "기준 금액과 다른 사유를 입력해 주세요.";
  if (error.includes("paid_sessions_total")) return "결제한 정규수업 횟수를 확인해 주세요.";
  return "처리하지 못했습니다. 수업 기록과 입력값을 확인한 뒤 다시 시도해 주세요.";
}

export function AdminEnrollmentRefundDialog({
  enrollmentId,
  planLabel,
  disabled,
  onFinalized,
}: AdminEnrollmentRefundDialogProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<EnrollmentRefundPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [paidSessionsOverride, setPaidSessionsOverride] = useState("");
  const [refundCompleted, setRefundCompleted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setPreview(null);
    fetch(`/api/admin/enrollments/${enrollmentId}/refund-preview`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "refund_preview_failed");
        const next = body.preview as EnrollmentRefundPreview;
        setPreview(next);
        setActualAmount(next.calculatedRefundAmount == null ? "" : String(next.calculatedRefundAmount));
        if (next.paidSessionsTotal) setPaidSessionsOverride(String(next.paidSessionsTotal));
      })
      .catch((loadError) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setError(friendlyError(loadError instanceof Error ? loadError.message : "refund_preview_failed"));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [enrollmentId, open]);

  const reviewedPolicy = useMemo(() => {
    if (!preview?.basisNeedsReview) return null;
    const paidSessionsTotal = Number(paidSessionsOverride);
    if (!Number.isInteger(paidSessionsTotal) || paidSessionsTotal <= 0) return null;
    return calculateRefundPolicy({
      paidAmount: preview.paidAmount,
      paidSessionsTotal,
      countedSessions: preview.countedSessions,
      currency: preview.currency,
    });
  }, [paidSessionsOverride, preview]);
  const calculatedAmount = preview?.calculatedRefundAmount ?? reviewedPolicy?.amount ?? null;
  const policyTier = preview?.policyTier ?? reviewedPolicy?.tier ?? null;
  const actual = Number(actualAmount);
  const amountChanged = calculatedAmount != null
    && Number.isFinite(actual)
    && actual !== calculatedAmount;
  const canSubmit = useMemo(() => {
    if (!preview || calculatedAmount == null || preview.alreadyRefunded || preview.unresolvedPastSessions > 0) return false;
    if (!Number.isFinite(actual) || actual < 0 || actual > preview.paidAmount) return false;
    if (!refundReason.trim() || !refundCompleted) return false;
    if (amountChanged && !adjustmentReason.trim()) return false;
    if (preview.basisNeedsReview) {
      const paidSessions = Number(paidSessionsOverride);
      if (!Number.isInteger(paidSessions) || paidSessions <= 0) return false;
    }
    return true;
  }, [actual, adjustmentReason, amountChanged, calculatedAmount, paidSessionsOverride, preview, refundCompleted, refundReason]);

  async function finalizeRefund() {
    if (!preview || !canSubmit || calculatedAmount == null) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/enrollments/${enrollmentId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedCountedSessions: preview.countedSessions,
          expectedCalculatedAmount: calculatedAmount,
          actualRefundAmount: actual,
          refundReason: refundReason.trim(),
          adjustmentReason: adjustmentReason.trim() || undefined,
          adminNote: adminNote.trim() || undefined,
          paidSessionsTotalOverride: preview.basisNeedsReview
            ? Number(paidSessionsOverride)
            : undefined,
          refundCompleted: true,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "refund_finalize_failed");
      onFinalized(body.result as FinalizedEnrollmentRefund);
      setOpen(false);
    } catch (submitError) {
      setError(friendlyError(submitError instanceof Error ? submitError.message : "refund_finalize_failed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        환불·수강 취소
      </Button>

      <Dialog open={open} onOpenChange={(next) => !submitting && setOpen(next)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>환불 완료 및 수강 취소</DialogTitle>
            <DialogDescription>
              {planLabel}의 환불 송금을 실제로 완료한 뒤 최종 확정해 주세요. 확정하면 잔여 수업이 취소되고 재무·알림·채팅 상태가 함께 반영됩니다.
            </DialogDescription>
          </DialogHeader>

          {loading && <p className="py-10 text-center text-sm text-gray-500">환불 기준 계산 중…</p>}
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          {preview && !loading && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-xl border bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <Summary label="결제금액" value={formatCurrency(preview.paidAmount, preview.currency)} />
                <Summary label="정책 적용 수업" value={`${preview.countedSessions}회`} />
                <Summary label="학생 결석 포함" value={`${preview.studentAbsentSessions}회`} />
                <Summary label="회사·강사 사유 제외" value={`${preview.companyExcludedSessions}회`} />
                <Summary label="취소할 잔여 수업" value={`${preview.futureCancellableSessions}회`} />
                <Summary
                  label="환불 기준"
                  value={policyTier ? refundTierLabel(policyTier) : "기준 횟수 확인 필요"}
                />
              </div>

              {preview.unresolvedPastSessions > 0 && (
                <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  과거 미처리 수업 {preview.unresolvedPastSessions}건이 있어 확정할 수 없습니다. 수업 운영 센터에서 상태를 먼저 정리해 주세요.
                </div>
              )}

              {preview.basisNeedsReview && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <Label htmlFor={`paid-sessions-${enrollmentId}`}>결제한 정규수업 횟수 확인</Label>
                  <p className="text-xs text-amber-800">과거 회차 조정 이력만으로 원 결제 횟수를 확정할 수 없습니다. 무료·보너스·보강 회차를 제외한 결제 회차를 입력하세요.</p>
                  <Input
                    id={`paid-sessions-${enrollmentId}`}
                    type="number"
                    min={1}
                    step={1}
                    value={paidSessionsOverride}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPaidSessionsOverride(value);
                      const paidSessionsTotal = Number(value);
                      if (Number.isInteger(paidSessionsTotal) && paidSessionsTotal > 0) {
                        const next = calculateRefundPolicy({
                          paidAmount: preview.paidAmount,
                          paidSessionsTotal,
                          countedSessions: preview.countedSessions,
                          currency: preview.currency,
                        });
                        setActualAmount(String(next.amount));
                      }
                    }}
                  />
                  <p className="text-xs text-amber-800">횟수를 입력하면 서버가 최종 확정 시 정책 금액을 다시 계산합니다. 계산 결과가 달라지면 새 미리보기를 요구합니다.</p>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`calculated-${enrollmentId}`}>기준 환불금액</Label>
                  <Input
                    id={`calculated-${enrollmentId}`}
                    value={calculatedAmount == null
                      ? "기준 횟수 확인 필요"
                      : formatCurrency(calculatedAmount, preview.currency)}
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`actual-${enrollmentId}`}>실제 환불금액 ({preview.currency})</Label>
                  <Input
                    id={`actual-${enrollmentId}`}
                    type="number"
                    min={0}
                    max={preview.paidAmount}
                    step={preview.currency === "KRW" ? 1 : 0.01}
                    value={actualAmount}
                    onChange={(event) => setActualAmount(event.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`reason-${enrollmentId}`}>환불·수강 취소 사유</Label>
                <Textarea
                  id={`reason-${enrollmentId}`}
                  value={refundReason}
                  onChange={(event) => setRefundReason(event.target.value)}
                  placeholder="예: 학생 개인 사정으로 중도 수강 취소"
                />
              </div>

              {amountChanged && (
                <div className="space-y-2">
                  <Label htmlFor={`adjustment-${enrollmentId}`}>기준 금액과 다르게 처리한 사유</Label>
                  <Textarea
                    id={`adjustment-${enrollmentId}`}
                    value={adjustmentReason}
                    onChange={(event) => setAdjustmentReason(event.target.value)}
                    placeholder="실제 환불금액 조정 근거를 입력하세요."
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor={`note-${enrollmentId}`}>관리자 메모 (선택)</Label>
                <Textarea
                  id={`note-${enrollmentId}`}
                  value={adminNote}
                  onChange={(event) => setAdminNote(event.target.value)}
                  placeholder="송금 일시, 확인 내역 등 내부 메모"
                />
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={refundCompleted}
                  onChange={(event) => setRefundCompleted(event.target.checked)}
                />
                <span><strong>실제 환불 송금을 완료했습니다.</strong><br />확정 후에는 되돌릴 수 없으며 잔여 수업과 학생↔선생님 채팅이 종료됩니다.</span>
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={submitting} onClick={() => setOpen(false)}>닫기</Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canSubmit || submitting}
                  onClick={() => void finalizeRefund()}
                >
                  {submitting ? "확정 처리 중…" : "환불 완료 및 수강 취소 확정"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 font-semibold text-gray-900">{value}</p>
    </div>
  );
}
