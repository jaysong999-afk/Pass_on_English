"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Lesson, SessionAdjustment, StudentEnrollment } from "@/types";
import {
  formatAdjustmentLine,
  formatSessionBalance,
  formatSessionProgressFromEnrollment,
} from "@/lib/sessions";
import { formatDate, formatLessonTimeRange, formatTime } from "@/lib/utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { formatEnrollmentSlotLabel } from "@/lib/lesson-scheduler";

interface EnrollmentSessionEditorProps {
  studentId: string;
  studentName: string;
}

interface AdjustmentLogEntry extends SessionAdjustment {
  enrollmentId: string;
  planLabel: string;
}

interface ConfirmTarget {
  enrollment: StudentEnrollment;
  delta: number;
  scheduledCount: number;
}

const SCHEDULE_ERROR_LABELS: Record<string, string> = {
  no_remaining_sessions: "차감할 잔여 수업이 없습니다.",
  no_future_lessons: "삭제할 예정 수업이 없습니다.",
  schedule_failed: "스케줄을 생성할 수 없습니다. 선생님 가용 시간을 확인해 주세요.",
  enrollment_not_found: "수강 정보를 찾을 수 없습니다.",
  invalid_delta: "조정 횟수가 올바르지 않습니다.",
};

function scheduleErrorMessage(code: string) {
  return SCHEDULE_ERROR_LABELS[code] ?? "처리에 실패했습니다. 다시 시도해 주세요.";
}

function StepperButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-gray-300 bg-white text-gray-800 shadow-sm transition-colors hover:border-violet-400 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function maxRemovable(enrollment: StudentEnrollment, scheduledCount: number) {
  return Math.min(enrollment.sessionsRemaining, scheduledCount);
}

export function EnrollmentSessionEditor({ studentId, studentName }: EnrollmentSessionEditorProps) {
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [upcomingLessons, setUpcomingLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftDeltas, setDraftDeltas] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<
    Record<string, { type: "success" | "error"; message: string }>
  >({});
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [enrollmentsRes, lessonsRes] = await Promise.all([
        fetch(`/api/enrollments?studentId=${studentId}`),
        fetch(`/api/admin/lessons?studentId=${studentId}`),
      ]);
      const enrollmentsData = await enrollmentsRes.json();
      const lessonsData = await lessonsRes.json();
      const list: StudentEnrollment[] = enrollmentsData.enrollments ?? [];
      setEnrollments(list);
      setUpcomingLessons(lessonsData.lessons ?? []);
      setReasons((prev) => {
        const next = { ...prev };
        for (const e of list) {
          if (next[e.id] === undefined) next[e.id] = "";
        }
        return next;
      });
      setDraftDeltas((prev) => {
        const next: Record<string, number> = {};
        for (const e of list) {
          next[e.id] = prev[e.id] ?? 0;
        }
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const upcomingByEnrollment = useMemo(() => {
    const map = new Map<string, Lesson[]>();
    for (const lesson of upcomingLessons) {
      if (!lesson.enrollmentId) continue;
      const list = map.get(lesson.enrollmentId) ?? [];
      list.push(lesson);
      map.set(lesson.enrollmentId, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    }
    return map;
  }, [upcomingLessons]);

  const adjustmentLog: AdjustmentLogEntry[] = enrollments
    .flatMap((e) =>
      (e.adjustments ?? []).map((adj) => ({
        ...adj,
        enrollmentId: e.id,
        planLabel: e.planLabel,
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const changeDraftDelta = (enrollment: StudentEnrollment, scheduledCount: number, step: number) => {
    setDraftDeltas((prev) => {
      const current = prev[enrollment.id] ?? 0;
      const limit = maxRemovable(enrollment, scheduledCount);
      const next = Math.max(-limit, Math.min(30, current + step));
      return { ...prev, [enrollment.id]: next };
    });
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[enrollment.id];
      return next;
    });
  };

  const resetDraft = (enrollmentId: string) => {
    setDraftDeltas((prev) => ({ ...prev, [enrollmentId]: 0 }));
    setReasons((prev) => ({ ...prev, [enrollmentId]: "" }));
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[enrollmentId];
      return next;
    });
  };

  const applySessionChange = async (enrollmentId: string, delta: number) => {
    setBusyId(enrollmentId);
    setConfirmTarget(null);
    setFeedback((prev) => {
      const next = { ...prev };
      delete next[enrollmentId];
      return next;
    });

    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/sessions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "adjust_sessions",
          delta,
          reason: reasons[enrollmentId]?.trim() || undefined,
          adminName: "관리자",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback((prev) => ({
          ...prev,
          [enrollmentId]: {
            type: "error",
            message: scheduleErrorMessage(data.error ?? "unknown"),
          },
        }));
        if (data.enrollment) {
          setEnrollments((prev) =>
            prev.map((e) => (e.id === enrollmentId ? data.enrollment : e))
          );
        }
        return;
      }

      const applied = data.appliedDelta as number;
      const sign = applied > 0 ? `+${applied}` : String(applied);
      setFeedback((prev) => ({
        ...prev,
        [enrollmentId]: {
          type: "success",
          message:
            applied > 0
              ? `${sign}회 적용 완료 · ${applied}회 수업이 자동 예약되었습니다.`
              : `${sign}회 적용 완료 · 마지막 예정 ${Math.abs(applied)}회가 삭제되었습니다.`,
        },
      }));

      resetDraft(enrollmentId);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-500">
          수강 정보 불러오는 중...
        </CardContent>
      </Card>
    );
  }

  if (enrollments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">수업 횟수 관리</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">등록된 수강 강좌가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  const editableEnrollments = enrollments.filter((e) => e.status !== "completed");

  return (
    <>
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-bold">수업 횟수 관리</h3>
          <p className="mt-1 text-sm text-gray-500">
            +/− 버튼으로 조정할 횟수를 설정한 뒤 사유를 입력하고 「변경 적용」을 누르세요. 추가 시
            마지막 예정 수업 다음 회차가, 차감 시 마지막 예정 수업부터 자동 반영됩니다.
          </p>
        </div>

        {(editableEnrollments.length > 0 ? editableEnrollments : enrollments.slice(0, 1)).map(
          (enrollment) => {
            const scheduled = upcomingByEnrollment.get(enrollment.id) ?? [];
            const lastScheduled = scheduled[scheduled.length - 1];
            const readOnly = enrollment.status === "completed";
            const busy = busyId === enrollment.id;
            const draftDelta = draftDeltas[enrollment.id] ?? 0;
            const removable = maxRemovable(enrollment, scheduled.length);
            const canDecrease = draftDelta > -removable && !readOnly;
            const canIncrease = draftDelta < 30 && !readOnly;
            const hasDraft = draftDelta !== 0;
            const previewRemaining = enrollment.sessionsRemaining + draftDelta;
            const previewTotal = enrollment.sessionsTotal + draftDelta;
            const previewScheduled = scheduled.length + draftDelta;
            const syncMismatch = scheduled.length !== enrollment.sessionsRemaining;
            const cardFeedback = feedback[enrollment.id];

            return (
              <Card key={enrollment.id} className="border-violet-100">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{enrollment.planLabel}</CardTitle>
                      <p className="mt-1 text-sm text-gray-500">
                        {enrollment.teacherName} · {enrollment.curriculum}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        주간 시간: {formatEnrollmentSlotLabel(enrollment)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-base font-bold tabular-nums">
                      {formatSessionBalance(
                        enrollment.sessionsRemaining,
                        enrollment.sessionsTotal
                      )}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl border bg-gray-50/80 px-4 py-3 text-sm">
                      <p className="text-xs font-medium text-gray-500">현재 진행</p>
                      <p className="mt-1 font-semibold text-ink">
                        {formatSessionProgressFromEnrollment(enrollment)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {formatDate(enrollment.startDate, "ko")} ~{" "}
                        {formatDate(enrollment.endDate, "ko")}
                      </p>
                    </div>
                    <div className="rounded-xl border bg-gray-50/80 px-4 py-3 text-sm">
                      <p className="text-xs font-medium text-gray-500">예정 스케줄</p>
                      <p className="mt-1 font-semibold text-ink">{scheduled.length}회 예약됨</p>
                      {lastScheduled ? (
                        <p className="mt-1 text-xs text-gray-500">
                          마지막: {formatDate(lastScheduled.scheduledAt, "ko")}{" "}
                          {formatLessonTimeRange(
                            lastScheduled.scheduledAt,
                            lastScheduled.durationMinutes,
                            "ko",
                            CANONICAL_TIMEZONE
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-400">예정 수업 없음</p>
                      )}
                      {syncMismatch && !hasDraft && (
                        <p className="mt-2 text-xs text-amber-700">
                          잔여 {enrollment.sessionsRemaining}회와 예정 {scheduled.length}회가
                          일치하지 않습니다.
                        </p>
                      )}
                    </div>
                  </div>

                  {!readOnly && (
                    <>
                      <div className="space-y-2">
                        <Label>조정 횟수 (미리보기)</Label>
                        <div className="flex flex-wrap items-center gap-3">
                          <StepperButton
                            label="1회 차감"
                            disabled={!canDecrease || busy}
                            onClick={() => changeDraftDelta(enrollment, scheduled.length, -1)}
                          >
                            <ChevronLeft className="h-5 w-5 stroke-[2.5]" aria-hidden />
                          </StepperButton>
                          <div className="min-w-[7rem] text-center">
                            <p
                              className={`text-xl font-bold tabular-nums ${
                                hasDraft ? "text-violet-700" : "text-ink"
                              }`}
                            >
                              {draftDelta > 0 ? `+${draftDelta}` : draftDelta === 0 ? "0" : draftDelta}
                              <span className="ml-1 text-sm font-normal text-gray-500">회</span>
                            </p>
                            {hasDraft && (
                              <p className="mt-0.5 text-xs text-violet-600">
                                → {formatSessionBalance(previewRemaining, previewTotal)}
                              </p>
                            )}
                          </div>
                          <StepperButton
                            label="1회 추가"
                            disabled={!canIncrease || busy}
                            onClick={() => changeDraftDelta(enrollment, scheduled.length, 1)}
                          >
                            <ChevronRight className="h-5 w-5 stroke-[2.5]" aria-hidden />
                          </StepperButton>
                        </div>
                        {hasDraft && (
                          <p className="text-xs text-gray-500">
                            적용 시 예정 스케줄 {scheduled.length}회 → {previewScheduled}회
                            {draftDelta > 0
                              ? ` · ${draftDelta}회 자동 예약`
                              : ` · 마지막 ${Math.abs(draftDelta)}회 삭제`}
                          </p>
                        )}
                        {!hasDraft && (
                          <p className="text-xs text-gray-500">
                            최대 {removable}회까지 차감 가능 (잔여·예정 스케줄 기준)
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`reason-${enrollment.id}`}>조정 사유 (선택)</Label>
                        <Textarea
                          id={`reason-${enrollment.id}`}
                          placeholder={`예: ${studentName} 학생 보강 2회 추가, 서비스 보상 등`}
                          value={reasons[enrollment.id] ?? ""}
                          onChange={(e) =>
                            setReasons((prev) => ({
                              ...prev,
                              [enrollment.id]: e.target.value,
                            }))
                          }
                          rows={2}
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="bg-violet-600 hover:bg-violet-700"
                          disabled={!hasDraft || busy}
                          onClick={() =>
                            setConfirmTarget({
                              enrollment,
                              delta: draftDelta,
                              scheduledCount: scheduled.length,
                            })
                          }
                        >
                          변경 적용
                        </Button>
                        {hasDraft && (
                          <Button
                            type="button"
                            variant="ghost"
                            className="gap-2"
                            disabled={busy}
                            onClick={() => resetDraft(enrollment.id)}
                          >
                            <RotateCcw className="h-4 w-4" />
                            되돌리기
                          </Button>
                        )}
                      </div>

                      {cardFeedback && (
                        <p
                          className={`rounded-xl px-3 py-2 text-sm ${
                            cardFeedback.type === "success"
                              ? "border border-emerald-200 bg-emerald-50 text-emerald-900"
                              : "border border-red-200 bg-red-50 text-red-800"
                          }`}
                        >
                          {cardFeedback.message}
                        </p>
                      )}

                      {busy && <p className="text-sm text-gray-500">처리 중…</p>}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          }
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">수업 횟수 조정 로그</CardTitle>
          </CardHeader>
          <CardContent>
            {adjustmentLog.length === 0 ? (
              <p className="text-sm text-gray-500">
                아직 조정 기록이 없습니다. 추가·차감하면 여기에 표시됩니다.
              </p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {adjustmentLog.map((adj) => (
                  <li
                    key={adj.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm"
                  >
                    <span className="font-medium tabular-nums text-gray-800">
                      {formatDate(adj.at, "ko")}{" "}
                      {formatTime(adj.at, "ko", CANONICAL_TIMEZONE)}
                    </span>
                    <Badge variant="outline" className="font-normal">
                      {adj.planLabel}
                    </Badge>
                    <span className="font-semibold text-violet-700">
                      {formatAdjustmentLine(adj)}
                    </span>
                    <span className="text-gray-500">{adj.adminName}</span>
                    {adj.reason && <span className="w-full text-gray-600">— {adj.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmTarget !== null} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>수업 횟수 변경 확인</DialogTitle>
            <DialogDescription>
              아래 내용으로 반영합니다. 스케줄도 함께 조정됩니다.
            </DialogDescription>
          </DialogHeader>
          {confirmTarget && (
            <div className="space-y-4 text-sm">
              <div className="rounded-xl border bg-gray-50 px-4 py-3">
                <p className="font-medium text-ink">{confirmTarget.enrollment.planLabel}</p>
                <p className="mt-2">
                  수업 횟수:{" "}
                  <span className="font-semibold">
                    {formatSessionBalance(
                      confirmTarget.enrollment.sessionsRemaining,
                      confirmTarget.enrollment.sessionsTotal
                    )}
                  </span>
                  {" → "}
                  <span className="font-semibold text-violet-700">
                    {formatSessionBalance(
                      confirmTarget.enrollment.sessionsRemaining + confirmTarget.delta,
                      confirmTarget.enrollment.sessionsTotal + confirmTarget.delta
                    )}
                  </span>
                </p>
                <p className="mt-1 text-gray-600">
                  {confirmTarget.delta > 0
                    ? `마지막 예정 수업 이후 ${confirmTarget.delta}회 자동 예약`
                    : `마지막 예정 ${Math.abs(confirmTarget.delta)}회 삭제`}
                </p>
                <p className="mt-1 text-gray-600">
                  예정 스케줄: {confirmTarget.scheduledCount}회 →{" "}
                  {confirmTarget.scheduledCount + confirmTarget.delta}회
                </p>
              </div>
              {reasons[confirmTarget.enrollment.id]?.trim() && (
                <p className="text-gray-600">
                  <span className="font-medium text-ink">사유:</span>{" "}
                  {reasons[confirmTarget.enrollment.id].trim()}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirmTarget(null)}
                  disabled={busyId === confirmTarget.enrollment.id}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={busyId === confirmTarget.enrollment.id}
                  onClick={() =>
                    applySessionChange(confirmTarget.enrollment.id, confirmTarget.delta)
                  }
                >
                  {busyId === confirmTarget.enrollment.id ? "적용 중…" : "확인 후 적용"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
