"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BadgeDollarSign,
  CalendarCheck,
  ClipboardCheck,
  History,
  ShieldAlert,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type {
  TeacherCompensationOverviewRow,
  TeacherCompensationOverviewSummary,
  TeacherCompensationReviewStatus,
  TeacherHourlyRateHistoryEntry,
  TeacherPayrollPenaltyEvent,
} from "@/types";
import { cn, formatDate } from "@/lib/utils";

interface CompensationDetail {
  penalties: TeacherPayrollPenaltyEvent[];
  rateHistory: TeacherHourlyRateHistoryEntry[];
  reviews: Array<{
    id: string;
    cycle_number: number;
    qualifying_payout_count: number;
    status: TeacherCompensationReviewStatus;
    previous_hourly_rate_php: number;
    new_hourly_rate_php: number | null;
    effective_month: string | null;
    deferred_until: string | null;
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string;
  }>;
}

const emptySummary: TeacherCompensationOverviewSummary = {
  teacherCount: 0,
  reviewDueCount: 0,
  recentPenaltyTeacherCount: 0,
  quarterlyBonusAchieverCount: 0,
};

function nextMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 2).padStart(2, "0")}`.replace(
    /^(\d{4})-13$/,
    (_, year) => `${Number(year) + 1}-01`
  );
}

function formatTenure(months: number) {
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (years === 0) return `${remaining}개월`;
  return `${years}년 ${remaining}개월`;
}

function reviewStatusLabel(status?: TeacherCompensationReviewStatus) {
  if (status === "approved") return "인상 승인";
  if (status === "no_change") return "현행 유지";
  if (status === "deferred") return "심사 보류";
  if (status === "pending") return "심사 대기";
  return "심사 이력 없음";
}

export function TeacherCompensationEvaluation() {
  const [summary, setSummary] = useState(emptySummary);
  const [rows, setRows] = useState<TeacherCompensationOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [error, setError] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [reviewRow, setReviewRow] = useState<TeacherCompensationOverviewRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/teacher-salary?view=evaluation&limit=100");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "평가 데이터를 불러오지 못했습니다.");
      setSummary(payload.summary ?? emptySummary);
      setRows(payload.rows ?? []);
      setMigrationRequired(Boolean(payload.migrationRequired));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "평가 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((row) => row.teacherId === selectedTeacherId) ?? null,
    [rows, selectedTeacherId]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-ink">강사 평가·인상 심사</h2>
          <p className="mt-1 text-sm text-gray-500">
            최근 12회 급여와 출석·패널티 이력을 기준으로 심사 대상을 확인합니다.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          새로고침
        </Button>
      </div>

      {migrationRequired && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">DB migration 051 적용이 필요합니다.</p>
          <p className="mt-1 text-xs text-amber-800">
            적용 전까지 기존 월 급여 정산은 사용할 수 있지만 평가·패널티 원장은 표시되지 않습니다.
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={ClipboardCheck} label="인상 심사 도래" value={`${summary.reviewDueCount}명`} accent="violet" />
        <MetricCard icon={ShieldAlert} label="최근 12개월 패널티" value={`${summary.recentPenaltyTeacherCount}명`} accent="amber" />
        <MetricCard icon={CalendarCheck} label="분기 만근 달성 이력" value={`${summary.quarterlyBonusAchieverCount}명`} accent="emerald" />
        <MetricCard icon={BadgeDollarSign} label="평가 대상 강사" value={`${summary.teacherCount}명`} accent="blue" />
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead>강사</TableHead>
              <TableHead>근속</TableHead>
              <TableHead className="text-right">급여 지급</TableHead>
              <TableHead className="text-right">최근 12회 성과</TableHead>
              <TableHead className="text-right">만근</TableHead>
              <TableHead className="text-right">노쇼·공제</TableHead>
              <TableHead className="text-right">현재 시급</TableHead>
              <TableHead className="text-right">심사</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-gray-500">
                  평가 지표를 불러오는 중…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && !migrationRequired && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-gray-500">
                  평가할 활성 강사가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.map((row) => {
              const active = selectedTeacherId === row.teacherId;
              return (
                <TableRow
                  key={row.teacherId}
                  className={cn("cursor-pointer", active && "bg-violet-50 hover:bg-violet-50")}
                  onClick={() => setSelectedTeacherId(active ? null : row.teacherId)}
                >
                  <TableCell>
                    <div className="font-medium">{row.teacherName}</div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      입사일 {row.employmentStartedAt}
                      {!row.employmentStartedAtVerified && " · 확인 필요"}
                    </div>
                  </TableCell>
                  <TableCell>{formatTenure(row.tenureMonths)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.completedPayoutCount}회
                    <div className="text-xs text-gray-500">
                      {row.reviewDue
                        ? "심사 도래"
                        : row.latestReviewStatus === "deferred" && row.deferredUntil
                          ? `${row.deferredUntil} 재검토`
                          : `다음 심사 ${row.payoutsUntilReview}회 후`}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.recentCompletedClasses}회 · {row.recentTotalHours}h
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    월 {row.recentPerfectMonths}회
                    <div className="text-xs text-gray-500">분기 {row.quarterlyBonusCount}회</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={cn(row.recentNoShowCount > 0 && "font-semibold text-red-600")}>
                      최근 {row.recentNoShowCount}회
                    </span>
                    <div className="text-xs text-gray-500">누적 ₱{row.totalPenaltyPhp.toLocaleString()}</div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    ₱{row.hourlyRatePhp.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.reviewDue ? (
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          setReviewRow(row);
                        }}
                      >
                        심사하기
                      </Button>
                    ) : (
                      <Badge variant="secondary">{reviewStatusLabel(row.latestReviewStatus)}</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selected && <CompensationDetailPanel row={selected} onUpdated={load} />}
      {reviewRow && (
        <CompensationReviewDialog
          row={reviewRow}
          open
          onClose={() => setReviewRow(null)}
          onSaved={async () => {
            setReviewRow(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ClipboardCheck;
  label: string;
  value: string;
  accent: "violet" | "amber" | "emerald" | "blue";
}) {
  const colors = {
    violet: "bg-violet-50 text-violet-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("rounded-xl p-2.5", colors[accent])}><Icon className="h-5 w-5" /></div>
        <div><p className="text-xs text-gray-500">{label}</p><p className="text-xl font-bold">{value}</p></div>
      </CardContent>
    </Card>
  );
}

function CompensationDetailPanel({
  row,
  onUpdated,
}: {
  row: TeacherCompensationOverviewRow;
  onUpdated: () => Promise<void>;
}) {
  const [detail, setDetail] = useState<CompensationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [employmentDate, setEmploymentDate] = useState(row.employmentStartedAt);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/teacher-salary?view=compensation-detail&teacherId=${encodeURIComponent(row.teacherId)}`)
      .then((response) => response.json())
      .then((payload) => { if (!cancelled) setDetail(payload); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [row.teacherId]);

  async function saveEmploymentDate() {
    setSaving(true);
    try {
      const response = await fetch("/api/admin/teacher-salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_employment_start",
          teacherId: row.teacherId,
          employmentStartedAt: employmentDate,
        }),
      });
      if (response.ok) await onUpdated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{row.teacherName} — 평가 이력</CardTitle>
            <p className="mt-1 text-sm text-gray-500">내부 평가 메모는 강사에게 공개되지 않습니다.</p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/teachers/${row.teacherId}`}>선생님 현황에서 기본정보 보기</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-gray-50 p-3">
          <div className="space-y-1">
            <Label htmlFor={`employment-${row.teacherId}`}>재직 시작일</Label>
            <Input
              id={`employment-${row.teacherId}`}
              type="date"
              className="w-44"
              value={employmentDate}
              onChange={(event) => setEmploymentDate(event.target.value)}
            />
          </div>
          <Button size="sm" variant="secondary" disabled={saving || !employmentDate} onClick={saveEmploymentDate}>
            {row.employmentStartedAtVerified ? "재직일 수정" : "재직일 확인"}
          </Button>
        </div>

        {loading && <p className="py-6 text-center text-sm text-gray-500">이력을 불러오는 중…</p>}
        {!loading && detail && (
          <div className="grid gap-4 xl:grid-cols-3">
            <HistorySection title="패널티 이력" empty="패널티 이력이 없습니다.">
              {detail.penalties.map((penalty) => (
                <div key={penalty.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatDate(penalty.occurredAt, "ko")}</span>
                    <Badge variant={penalty.status === "active" ? "destructive" : "secondary"}>
                      {penalty.status === "active" ? "적용" : "취소"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-gray-600">{penalty.reason}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    수업 미지급 ₱{penalty.unpaidAmountPhp.toLocaleString()} · 추가 공제 ₱{penalty.deductionAmountPhp.toLocaleString()}
                  </p>
                </div>
              ))}
            </HistorySection>
            <HistorySection title="시급 변경 이력" empty="시급 변경 이력이 없습니다.">
              {detail.rateHistory.map((rate) => (
                <div key={rate.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">₱{rate.previousHourlyRatePhp.toLocaleString()} → ₱{rate.hourlyRatePhp.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-gray-500">{rate.effectiveMonth} 적용 · {rate.reason}</p>
                </div>
              ))}
            </HistorySection>
            <HistorySection title="연간 심사 이력" empty="심사 이력이 없습니다.">
              {detail.reviews.map((review) => (
                <div key={review.id} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">제 {review.cycle_number}차 심사</span>
                    <Badge variant="secondary">{reviewStatusLabel(review.status)}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">급여 {review.qualifying_payout_count}회 기준</p>
                  {review.review_note && <p className="mt-2 text-gray-600">{review.review_note}</p>}
                </div>
              ))}
            </HistorySection>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HistorySection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold"><History className="h-4 w-4" />{title}</h3>
      <div className="max-h-72 space-y-2 overflow-auto rounded-xl bg-gray-50 p-2">
        {children.length ? children : <p className="px-2 py-6 text-center text-xs text-gray-500">{empty}</p>}
      </div>
    </section>
  );
}

function CompensationReviewDialog({
  row,
  open,
  onClose,
  onSaved,
}: {
  row: TeacherCompensationOverviewRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<"approved" | "no_change" | "deferred">("approved");
  const [rate, setRate] = useState(String(row.hourlyRatePhp));
  const [effectiveMonth, setEffectiveMonth] = useState(nextMonthKey());
  const [deferredUntil, setDeferredUntil] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const cycleNumber = Math.max(1, row.eligibleCycle);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/teacher-salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_compensation_review",
          teacherId: row.teacherId,
          cycleNumber,
          status,
          newHourlyRatePhp: status === "approved" ? Number(rate) : undefined,
          effectiveMonth: status === "approved" ? effectiveMonth : undefined,
          deferredUntil: status === "deferred" ? deferredUntil : undefined,
          reviewNote: note,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "심사를 저장하지 못했습니다.");
      await onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "심사를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.teacherName} — 제 {cycleNumber}차 시급 심사</DialogTitle>
          <DialogDescription>최종 정산 급여 {row.completedPayoutCount}회 기준입니다.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(["approved", "no_change", "deferred"] as const).map((value) => (
              <Button key={value} type="button" variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)}>
                {value === "approved" ? "인상 승인" : value === "no_change" ? "현행 유지" : "보류"}
              </Button>
            ))}
          </div>
          {status === "approved" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>신규 시급 (PHP)</Label><Input type="number" value={rate} onChange={(event) => setRate(event.target.value)} /></div>
              <div className="space-y-1"><Label>적용 시작 월</Label><Input type="month" value={effectiveMonth} onChange={(event) => setEffectiveMonth(event.target.value)} /></div>
            </div>
          )}
          {status === "deferred" && (
            <div className="space-y-1"><Label>재검토일</Label><Input type="date" value={deferredUntil} onChange={(event) => setDeferredUntil(event.target.value)} /></div>
          )}
          <div className="space-y-1"><Label>내부 평가 메모</Label><Textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="성과와 판단 근거를 기록하세요." /></div>
          {error && <p className="flex items-center gap-1 text-sm text-red-600"><AlertTriangle className="h-4 w-4" />{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>취소</Button><Button disabled={saving || (status === "approved" && (!rate || !effectiveMonth)) || (status === "deferred" && !deferredUntil)} onClick={save}>{saving ? "저장 중…" : "심사 확정"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
