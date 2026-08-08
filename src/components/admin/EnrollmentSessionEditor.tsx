"use client";

import { useCallback, useEffect, useState } from "react";
import { Minus, Plus, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SessionAdjustment, StudentEnrollment } from "@/types";
import {
  formatAdjustmentLine,
  formatSessionBalance,
  getSessionsUsed,
} from "@/lib/sessions";
import { formatDate, formatTime } from "@/lib/utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";

interface EnrollmentSessionEditorProps {
  studentId: string;
  studentName: string;
}

interface AdjustmentLogEntry extends SessionAdjustment {
  enrollmentId: string;
  planLabel: string;
}

function StepperButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-gray-800 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
    >
      {children}
    </button>
  );
}

export function EnrollmentSessionEditor({ studentId, studentName }: EnrollmentSessionEditorProps) {
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { remaining: string; total: string; reason: string }>
  >({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/enrollments?studentId=${studentId}`);
      const data = await res.json();
      const list: StudentEnrollment[] = data.enrollments ?? [];
      setEnrollments(list);
      setDrafts(
        Object.fromEntries(
          list.map((e) => [
            e.id,
            {
              remaining: String(e.sessionsRemaining),
              total: String(e.sessionsTotal),
              reason: "",
            },
          ])
        )
      );
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  const adjustmentLog: AdjustmentLogEntry[] = enrollments
    .flatMap((e) =>
      (e.adjustments ?? []).map((adj) => ({
        ...adj,
        enrollmentId: e.id,
        planLabel: e.planLabel,
      }))
    )
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const applyDelta = (enrollmentId: string, deltaRemaining: number, deltaTotal = 0) => {
    setDrafts((prev) => {
      const e = enrollments.find((x) => x.id === enrollmentId);
      if (!e) return prev;
      const d = prev[enrollmentId] ?? {
        remaining: String(e.sessionsRemaining),
        total: String(e.sessionsTotal),
        reason: "",
      };
      const currentTotal = parseInt(d.total, 10);
      const baseTotal = Number.isNaN(currentTotal) ? e.sessionsTotal : currentTotal;
      const total = Math.max(1, baseTotal + deltaTotal);

      const currentRemaining = parseInt(d.remaining, 10);
      const baseRemaining = Number.isNaN(currentRemaining) ? e.sessionsRemaining : currentRemaining;
      const remaining = Math.min(total, Math.max(0, baseRemaining + deltaRemaining));
      return {
        ...prev,
        [enrollmentId]: { ...d, remaining: String(remaining), total: String(total) },
      };
    });
  };

  const save = async (enrollmentId: string) => {
    const draft = drafts[enrollmentId];
    if (!draft) return;

    const sessionsRemaining = parseInt(draft.remaining, 10);
    const sessionsTotal = parseInt(draft.total, 10);

    if (Number.isNaN(sessionsRemaining) || Number.isNaN(sessionsTotal)) return;
    if (sessionsRemaining < 0 || sessionsTotal < 1 || sessionsRemaining > sessionsTotal) return;

    setSavingId(enrollmentId);
    try {
      const res = await fetch(`/api/enrollments/${enrollmentId}/sessions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionsRemaining,
          sessionsTotal,
          reason: draft.reason || `${studentName} 수업 횟수 조정`,
          adminName: "관리자",
        }),
      });
      if (res.ok) {
        await load();
      }
    } finally {
      setSavingId(null);
    }
  };

  const resetDraft = (enrollment: StudentEnrollment) => {
    setDrafts((prev) => ({
      ...prev,
      [enrollment.id]: {
        remaining: String(enrollment.sessionsRemaining),
        total: String(enrollment.sessionsTotal),
        reason: "",
      },
    }));
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-500">수강 정보 불러오는 중...</CardContent>
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
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold">수업 횟수 관리</h3>
        <p className="mt-1 text-sm text-gray-500">
          잔여/전체 형식(예: 12회/20회). ± 버튼 또는 직접 입력 후 저장하면 하단 로그에 기록됩니다.
        </p>
      </div>

      {(editableEnrollments.length > 0 ? editableEnrollments : enrollments.slice(0, 1)).map(
        (enrollment) => {
          const draft = drafts[enrollment.id] ?? {
            remaining: String(enrollment.sessionsRemaining),
            total: String(enrollment.sessionsTotal),
            reason: "",
          };
          const draftRemaining = parseInt(draft.remaining, 10);
          const draftTotal = parseInt(draft.total, 10);
          const used = getSessionsUsed({
            sessionsTotal: Number.isNaN(draftTotal) ? enrollment.sessionsTotal : draftTotal,
            sessionsRemaining: Number.isNaN(draftRemaining)
              ? enrollment.sessionsRemaining
              : draftRemaining,
          });
          const dirty =
            draft.remaining !== String(enrollment.sessionsRemaining) ||
            draft.total !== String(enrollment.sessionsTotal);
          const readOnly = enrollment.status === "completed";

          return (
            <Card key={enrollment.id} className="border-violet-100">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{enrollment.planLabel}</CardTitle>
                    <p className="mt-1 text-sm text-gray-500">
                      {enrollment.teacherName} · {enrollment.curriculum}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-base font-bold tabular-nums">
                    {formatSessionBalance(
                      Number.isNaN(draftRemaining) ? enrollment.sessionsRemaining : draftRemaining,
                      Number.isNaN(draftTotal) ? enrollment.sessionsTotal : draftTotal
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>잔여 수업</Label>
                    <div className="flex items-center gap-2">
                      <StepperButton
                        label="잔여 1회 감소"
                        onClick={() => applyDelta(enrollment.id, -1)}
                      >
                        <Minus className="h-4 w-4 stroke-[2.5]" />
                      </StepperButton>
                      <Input
                        value={draft.remaining}
                        disabled={readOnly}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [enrollment.id]: { ...draft, remaining: e.target.value },
                          }))
                        }
                        className="h-10 text-center font-bold tabular-nums"
                        inputMode="numeric"
                      />
                      <StepperButton
                        label="잔여 1회 증가"
                        onClick={() => applyDelta(enrollment.id, 1)}
                      >
                        <Plus className="h-4 w-4 stroke-[2.5]" />
                      </StepperButton>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        disabled={readOnly}
                        onClick={() => applyDelta(enrollment.id, -5)}
                      >
                        −5회
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        disabled={readOnly}
                        onClick={() => applyDelta(enrollment.id, 5)}
                      >
                        +5회
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>전체 수업 (이번 기간)</Label>
                    <div className="flex items-center gap-2">
                      <StepperButton
                        label="전체 1회 감소"
                        onClick={() => applyDelta(enrollment.id, 0, -1)}
                      >
                        <Minus className="h-4 w-4 stroke-[2.5]" />
                      </StepperButton>
                      <Input
                        value={draft.total}
                        disabled={readOnly}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [enrollment.id]: { ...draft, total: e.target.value },
                          }))
                        }
                        className="h-10 text-center font-bold tabular-nums"
                        inputMode="numeric"
                      />
                      <StepperButton
                        label="전체 1회 증가"
                        onClick={() => applyDelta(enrollment.id, 0, 1)}
                      >
                        <Plus className="h-4 w-4 stroke-[2.5]" />
                      </StepperButton>
                    </div>
                    <p className="text-xs text-gray-500">
                      사용 {used}회 · {formatDate(enrollment.startDate, "ko")} ~{" "}
                      {formatDate(enrollment.endDate, "ko")}
                    </p>
                  </div>
                </div>

                {!readOnly && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`reason-${enrollment.id}`}>조정 사유 (선택)</Label>
                      <Textarea
                        id={`reason-${enrollment.id}`}
                        placeholder="예: 보강 2회 추가, 결석 차감 등"
                        value={draft.reason}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [enrollment.id]: { ...draft, reason: e.target.value },
                          }))
                        }
                        rows={2}
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        className="gap-2 bg-violet-600 hover:bg-violet-700"
                        disabled={!dirty || savingId === enrollment.id}
                        onClick={() => save(enrollment.id)}
                      >
                        <Save className="h-4 w-4" />
                        {savingId === enrollment.id ? "저장 중..." : "변경 저장"}
                      </Button>
                      {dirty && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="gap-2"
                          onClick={() => resetDraft(enrollment)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          되돌리기
                        </Button>
                      )}
                    </div>
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
            <p className="text-sm text-gray-500">아직 조정 기록이 없습니다. 저장하면 여기에 표시됩니다.</p>
          ) : (
            <ul className="divide-y rounded-xl border">
              {adjustmentLog.map((adj) => (
                <li key={adj.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 text-sm">
                  <span className="font-medium tabular-nums text-gray-800">
                    {formatDate(adj.at, "ko")}{" "}
                    {formatTime(adj.at, "ko", CANONICAL_TIMEZONE)}
                  </span>
                  <Badge variant="outline" className="font-normal">
                    {adj.planLabel}
                  </Badge>
                  <span className="font-semibold text-violet-700">{formatAdjustmentLine(adj)}</span>
                  <span className="text-gray-500">{adj.adminName}</span>
                  {adj.reason && <span className="w-full text-gray-600">— {adj.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
