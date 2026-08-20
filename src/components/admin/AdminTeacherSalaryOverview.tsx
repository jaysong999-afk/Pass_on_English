"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Download,
  Settings2,
  Users,
  AlertTriangle,
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
import { SalaryStatusBadge, formatSalaryMonth } from "@/components/shared/SalaryStatusBadge";
import type { AdminSalaryMonthSummary, AdminSalaryRow } from "@/lib/admin/teacher-salary-overview-store";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type {
  SalaryBonusPolicyConfig,
  TeacherSalaryAdjustment,
  SalaryLessonVerificationRow,
} from "@/types";

function formatPhpAmount(amount: number) {
  return amount.toLocaleString("en-PH");
}

function rowKey(row: AdminSalaryRow) {
  return `${row.teacherId}-${row.month}`;
}

function statusDisplay(row: AdminSalaryRow) {
  if (row.needsReview && row.status !== "completed") {
    return { label: "검토필요", variant: "destructive" as const };
  }
  return { label: null, variant: null };
}

export function AdminTeacherSalaryOverview() {
  const [month, setMonth] = useState("");
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [summary, setSummary] = useState<AdminSalaryMonthSummary | null>(null);
  const [rows, setRows] = useState<AdminSalaryRow[]>([]);
  const [bonusPolicy, setBonusPolicy] = useState<SalaryBonusPolicyConfig | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [bulkRateOpen, setBulkRateOpen] = useState(false);

  const load = useCallback(async (targetMonth?: string) => {
    setLoading(true);
    try {
      const query = targetMonth ? `?month=${encodeURIComponent(targetMonth)}` : "";
      const res = await fetch(`/api/admin/teacher-salary${query}`);
      const data = await res.json();
      const resolvedMonth = data.summary?.month ?? targetMonth ?? "";
      setMonth(resolvedMonth);
      setAvailableMonths(data.availableMonths ?? []);
      setSummary(data.summary ?? null);
      setRows(data.rows ?? []);
      setBonusPolicy(data.bonusPolicy ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => rows.find((r) => rowKey(r) === selectedKey) ?? null,
    [rows, selectedKey]
  );

  async function patch(body: Record<string, unknown>) {
    setActing(true);
    try {
      const res = await fetch("/api/admin/teacher-salary", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const keepKey = selectedKey;
        await load(month);
        if (keepKey) setSelectedKey(keepKey);
        return true;
      }
      if (res.status === 409) {
        const data = await res.json();
        const names = (data.preview?.differing ?? [])
          .map((d: { name: string; currentRate: number }) => `${d.name} (₱${d.currentRate})`)
          .join(", ");
        const ok = window.confirm(
          `시급이 다른 강사가 있습니다: ${names}\n\n그래도 ₱${body.hourlyRatePhp}로 일괄 변경하시겠습니까?`
        );
        if (ok) {
          setActing(true);
          const forceRes = await fetch("/api/admin/teacher-salary", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...body, force: true }),
          });
          if (forceRes.ok) {
            await load(month);
            return true;
          }
        }
      }
      return false;
    } finally {
      setActing(false);
    }
  }

  function downloadCsv() {
    if (!month) return;
    window.location.href = `/api/admin/teacher-salary?month=${encodeURIComponent(month)}&format=csv`;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-ink">강사 급여</h2>
          <div className="relative">
            <select
              className="h-10 appearance-none rounded-xl border border-gray-300 bg-white py-2 pl-3 pr-9 text-sm font-medium"
              value={month}
              disabled={loading || availableMonths.length === 0}
              onChange={(e) => {
                setSelectedKey(null);
                void load(e.target.value);
              }}
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {formatSalaryMonth(m, "ko")}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={downloadCsv} disabled={!month}>
            <Download className="h-4 w-4" />
            CSV 다운로드
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setBulkRateOpen(true)}>
            <Users className="h-4 w-4" />
            시급 일괄 수정
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setPolicyOpen(true)}>
            <Settings2 className="h-4 w-4" />
            보너스 정책
          </Button>
          <Button
            className="bg-violet-600 hover:bg-violet-700"
            disabled={
              acting ||
              !month ||
              !summary?.monthEnded ||
              rows.every((r) => r.status !== "estimated" && !r.isLiveEstimate)
            }
            onClick={() => patch({ action: "finalize_all", month })}
          >
            전체 정산 확정
          </Button>
        </div>
      </div>

      {summary && !summary.monthEnded && (
        <div className="flex items-start gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {formatSalaryMonth(summary.month, "ko")} 정산이 진행 중입니다. 월말이 지난 후 강사별 근무
            시간을 검증하고 개별 확정할 수 있습니다.
          </p>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border bg-white px-4 py-3 text-sm md:grid-cols-5">
          <SummaryItem label="총 예정" value={`₱${formatPhpAmount(summary.estimatedTotal)}`} />
          <SummaryItem label="확정" value={`₱${formatPhpAmount(summary.confirmedTotal)}`} />
          <SummaryItem label="Processing" value={`₱${formatPhpAmount(summary.processingTotal)}`} />
          <SummaryItem
            label="지급완료"
            value={`₱${formatPhpAmount(summary.paidTotal + summary.completedTotal)}`}
          />
          <SummaryItem
            label="검토 필요"
            value={`${summary.reviewCount}건`}
            highlight={summary.reviewCount > 0}
          />
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              <TableHead>강사</TableHead>
              <TableHead className="text-right">수업수</TableHead>
              <TableHead className="text-right">시간</TableHead>
              <TableHead className="text-right">기본급</TableHead>
              <TableHead className="text-right">보너스</TableHead>
              <TableHead className="text-right">공제</TableHead>
              <TableHead className="text-right">총액</TableHead>
              <TableHead className="text-right">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-gray-500">
                  불러오는 중…
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center text-sm text-gray-500">
                  해당 월 급여 데이터가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              rows.map((row) => {
                const key = rowKey(row);
                const active = selectedKey === key;
                const status = statusDisplay(row);
                return (
                  <TableRow
                    key={key}
                    className={cn(
                      "cursor-pointer transition-colors",
                      active ? "bg-violet-50 hover:bg-violet-50" : "hover:bg-gray-50"
                    )}
                    onClick={() => setSelectedKey(active ? null : key)}
                  >
                    <TableCell className="font-medium">{row.teacherName}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.completedClasses}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.totalHours}h</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhpAmount(row.baseSalary)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhpAmount(row.bonusTotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600">
                      {row.deductions > 0 ? formatPhpAmount(row.deductions) : "0"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {formatPhpAmount(row.total)}
                    </TableCell>
                    <TableCell className="text-right">
                      {status.variant === "destructive" ? (
                        <Badge variant="destructive">{status.label}</Badge>
                      ) : (
                        <SalaryStatusBadge status={row.status} locale="ko" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>

      {selected && (
        <SalaryDetailPanel
          row={selected}
          monthEnded={summary?.monthEnded ?? false}
          acting={acting}
          onPatch={patch}
          onReload={() => load(month)}
        />
      )}

      {bonusPolicy && (
        <BonusPolicyDialog
          open={policyOpen}
          policy={bonusPolicy}
          acting={acting}
          onClose={() => setPolicyOpen(false)}
          onSave={async (policy) => {
            const ok = await patch({ action: "update_bonus_policy", policy });
            if (ok) setPolicyOpen(false);
          }}
        />
      )}

      <BulkRateDialog
        open={bulkRateOpen}
        acting={acting}
        onClose={() => setBulkRateOpen(false)}
        onApply={async (rate) => {
          const previewRes = await fetch("/api/admin/teacher-salary", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "preview_bulk_hourly_rate", hourlyRatePhp: rate }),
          });
          const preview = await previewRes.json();
          if (preview.hasDifferingRates) {
            const names = preview.differing
              .map((d: { name: string; currentRate: number }) => `${d.name} (₱${d.currentRate})`)
              .join(", ");
            const ok = window.confirm(
              `시급이 다른 강사가 있습니다:\n${names}\n\n₱${rate}로 일괄 변경하시겠습니까?`
            );
            if (!ok) return;
          }
          const ok = await patch({ action: "bulk_update_hourly_rate", hourlyRatePhp: rate, force: true });
          if (ok) setBulkRateOpen(false);
        }}
      />
    </div>
  );
}

function SummaryItem({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className={cn("text-center md:text-left", highlight && "text-amber-800")}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SalaryDetailPanel({
  row,
  monthEnded,
  acting,
  onPatch,
  onReload,
}: {
  row: AdminSalaryRow;
  monthEnded: boolean;
  acting: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onReload: () => void;
}) {
  const [lessons, setLessons] = useState<SalaryLessonVerificationRow[]>([]);
  const [adjustments, setAdjustments] = useState<TeacherSalaryAdjustment[]>([]);
  const [detailLoading, setDetailLoading] = useState(true);
  const [hourlyRate, setHourlyRate] = useState(String(row.hourlyRate));
  const [krwAmount, setKrwAmount] = useState(row.krwTransferAmount ? String(row.krwTransferAmount) : "");
  const [adjType, setAdjType] = useState<"bonus" | "penalty">("bonus");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");

  const loadDetail = useCallback(async () => {
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/admin/teacher-salary?teacherId=${encodeURIComponent(row.teacherId)}&month=${encodeURIComponent(row.month)}`
      );
      const data = await res.json();
      setLessons(data.verificationLessons ?? []);
      setAdjustments(data.adjustments ?? []);
    } finally {
      setDetailLoading(false);
    }
  }, [row.teacherId, row.month]);

  useEffect(() => {
    setHourlyRate(String(row.hourlyRate));
    setKrwAmount(row.krwTransferAmount ? String(row.krwTransferAmount) : "");
    void loadDetail();
  }, [row, loadDetail]);

  const payrollLessons = lessons.filter((l) => l.countsForPayroll && l.status === "completed");
  // Sum exact minutes first, then round once. Summing the display values
  // (0.3h per 20-minute lesson) produces 2.999999… for ten lessons and can
  // disagree with the payroll statement's aggregate 3.3h calculation.
  const verifiedMinutes = payrollLessons.reduce((s, l) => s + l.durationMinutes, 0);
  const verifiedHours = Math.round((verifiedMinutes / 60) * 10) / 10;
  const hoursMatch = Math.abs(verifiedHours - row.totalHours) < 0.05;

  async function addAdjustment() {
    if (!adjAmount || !adjReason.trim()) return;
    const ok = await onPatch({
      action: "add_adjustment",
      teacherId: row.teacherId,
      month: row.month,
      type: adjType,
      amountPhp: Number(adjAmount),
      reason: adjReason.trim(),
    });
    if (ok) {
      setAdjAmount("");
      setAdjReason("");
      await loadDetail();
      onReload();
    }
  }

  return (
    <Card className="border-violet-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{row.teacherName} — 급여 세부내역</CardTitle>
            <p className="mt-1 text-sm text-gray-500">
              {formatSalaryMonth(row.month, "ko")}
              {row.isLiveEstimate && (
                <Badge variant="secondary" className="ml-2 text-[10px]">
                  실시간 산출
                </Badge>
              )}
            </p>
          </div>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/admin/teachers/${row.teacherId}`}>강사 상세</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {row.needsReview && row.status !== "completed" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">검토 필요</p>
            <ul className="mt-1 list-inside list-disc text-amber-800">
              {row.reviewReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        )}

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">근무 시간 검증</h3>
            {!detailLoading && (
              <Badge variant={hoursMatch ? "success" : "destructive"}>
                {hoursMatch ? "시간 일치" : `불일치 (수업 합계 ${verifiedHours}h)`}
              </Badge>
            )}
          </div>
          <div className="max-h-56 overflow-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>일시</TableHead>
                  <TableHead>학생</TableHead>
                  <TableHead className="text-right">시간</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">급여 반영</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-gray-500">
                      불러오는 중…
                    </TableCell>
                  </TableRow>
                )}
                {!detailLoading && lessons.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-6 text-center text-sm text-gray-500">
                      해당 월 수업 없음
                    </TableCell>
                  </TableRow>
                )}
                {!detailLoading &&
                  lessons.map((l) => (
                    <TableRow key={l.id} className={cn(!l.countsForPayroll && "opacity-50")}>
                      <TableCell className="text-sm">
                        {formatDate(l.scheduledAt, "ko")} {formatTime(l.scheduledAt, "ko")}
                      </TableCell>
                      <TableCell>{l.studentName}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.durationHours}h</TableCell>
                      <TableCell>{l.status}</TableCell>
                      <TableCell className="text-right">
                        {l.countsForPayroll && l.status === "completed" ? "✓" : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">
            급여 반영 수업 {payrollLessons.length}회 · 합계 {verifiedHours}h (명세서 {row.totalHours}h)
          </p>
        </section>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <DetailStat label="완료 수업" value={`${row.completedClasses}회`} />
          <DetailStat label="수업 시간" value={`${row.totalHours}h`} />
          <DetailStat label="시급" value={formatCurrency(row.hourlyRate, "PHP")} />
          <DetailStat
            label="확정일"
            value={row.adminConfirmedAt ? formatDate(row.adminConfirmedAt, "ko") : "미확정"}
          />
        </div>

        <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-gray-50 p-3">
          <div className="space-y-1">
            <Label htmlFor="hourlyRateEdit" className="text-xs">
              시급 개별 수정 (PHP)
            </Label>
            <Input
              id="hourlyRateEdit"
              type="number"
              className="h-9 w-32"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={acting || !hourlyRate}
            onClick={() =>
              onPatch({
                action: "update_hourly_rate",
                teacherId: row.teacherId,
                hourlyRatePhp: Number(hourlyRate),
              })
            }
          >
            시급 저장
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>항목</TableHead>
                <TableHead className="text-right">금액 (PHP)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <LineItem label="기본급" amount={row.baseSalary} />
              <LineItem label="만근 보너스 (1개월)" amount={row.perfectAttendanceBonus} />
              <LineItem label="누적 만근 보너스" amount={row.quarterlyBonus} />
              <LineItem label="기타 보너스" amount={row.otherIncentives} />
              <LineItem label="공제" amount={-row.deductions} negative={row.deductions > 0} />
              <TableRow className="bg-gray-50 font-semibold">
                <TableCell>총 지급액</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.total, "PHP")}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">기타 보너스 / 패널티</h3>
          <div className="flex flex-wrap gap-2">
            <select
              className="h-9 rounded-lg border px-2 text-sm"
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as "bonus" | "penalty")}
            >
              <option value="bonus">보너스</option>
              <option value="penalty">패널티</option>
            </select>
            <Input
              type="number"
              placeholder="금액 (PHP)"
              className="h-9 w-28"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
            />
            <Input
              placeholder="사유"
              className="h-9 min-w-[180px] flex-1"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
            />
            <Button size="sm" disabled={acting} onClick={addAdjustment}>
              추가
            </Button>
          </div>
          {adjustments.length > 0 && (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>일시</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>사유</TableHead>
                    <TableHead>처리자</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-xs">
                        {formatDate(a.createdAt, "ko")} {formatTime(a.createdAt, "ko")}
                      </TableCell>
                      <TableCell>{a.type === "bonus" ? "보너스" : "패널티"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ₱{formatPhpAmount(a.amountPhp)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{a.reason}</TableCell>
                      <TableCell className="text-xs text-gray-500">{a.createdBy}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        <div className="rounded-xl bg-gray-50 px-4 py-3 text-sm">
          <p className="text-xs font-semibold uppercase text-gray-400">지급 계좌</p>
          <p className="mt-1 font-medium">
            {row.payoutAccount.label} · {row.payoutAccount.accountNumber}
          </p>
          {row.payoutAccount.accountName && (
            <p className="text-gray-600">{row.payoutAccount.accountName}</p>
          )}
        </div>

        {row.status === "paid" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-emerald-900">최종 종결 — 원화 송금액 입력</p>
            <p className="text-xs text-emerald-800">
              선생님 계좌 PHP 입금 완료 후, 수수료를 포함한 실제 원화 송금액을 입력하세요. 종결 시
              재무관리에 지출이 반영됩니다.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="krwAmount" className="text-xs">
                  원화 송금액 (KRW, 수수료 포함)
                </Label>
                <Input
                  id="krwAmount"
                  type="number"
                  className="h-9 w-40"
                  value={krwAmount}
                  onChange={(e) => setKrwAmount(e.target.value)}
                />
              </div>
              <Button
                size="sm"
                className="bg-emerald-700 hover:bg-emerald-800"
                disabled={acting || !krwAmount}
                onClick={() =>
                  onPatch({
                    action: "complete",
                    id: row.id,
                    krwTransferAmount: Number(krwAmount),
                  })
                }
              >
                최종 완료
              </Button>
            </div>
          </div>
        )}

        {row.status === "completed" && row.krwTransferAmount && (
          <div className="rounded-xl border bg-gray-50 px-4 py-3 text-sm">
            <p className="font-semibold">종결 완료</p>
            <p className="mt-1 text-gray-600">
              원화 송금 ₩{row.krwTransferAmount.toLocaleString()} ·{" "}
              {row.completedAt ? formatDate(row.completedAt, "ko") : ""}
            </p>
            <p className="mt-1 text-xs text-gray-500">재무관리 지출에 반영됨</p>
          </div>
        )}

        <WorkflowActions row={row} monthEnded={monthEnded} acting={acting} onPatch={onPatch} />
      </CardContent>
    </Card>
  );
}

function WorkflowActions({
  row,
  monthEnded,
  acting,
  onPatch,
}: {
  row: AdminSalaryRow;
  monthEnded: boolean;
  acting: boolean;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {(row.isLiveEstimate || row.status === "estimated") && monthEnded && (
        <Button
          size="sm"
          disabled={acting}
          onClick={() =>
            onPatch({ action: "confirm", teacherId: row.teacherId, month: row.month })
          }
        >
          근무 확인 · 정산 확정
        </Button>
      )}
      {row.status === "confirmed" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={acting}
          onClick={() => onPatch({ action: "mark_processing", id: row.id })}
        >
          송금 진행 중
        </Button>
      )}
      {row.status === "processing" && (
        <Button
          size="sm"
          className="bg-blue-600 hover:bg-blue-700"
          disabled={acting}
          onClick={() => onPatch({ action: "mark_php_paid", id: row.id })}
        >
          PHP 입금 완료
        </Button>
      )}
      {(row.isLiveEstimate || row.status === "estimated") && !monthEnded && (
        <p className="text-xs text-gray-500 self-center">
          월말 이후 근무 시간 검증 및 확정이 가능합니다.
        </p>
      )}
    </div>
  );
}

function BonusPolicyDialog({
  open,
  policy,
  acting,
  onClose,
  onSave,
}: {
  open: boolean;
  policy: SalaryBonusPolicyConfig;
  acting: boolean;
  onClose: () => void;
  onSave: (policy: SalaryBonusPolicyConfig) => Promise<void>;
}) {
  const [draft, setDraft] = useState(policy);

  useEffect(() => {
    if (open) setDraft(structuredClone(policy));
  }, [open, policy]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>보너스 정책 설정</DialogTitle>
          <DialogDescription>
            1개월 만근 보너스와 3개월 누적 만근 보너스 조건을 설정합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>1개월 만근 — 시간당 보너스 (PHP)</Label>
            <Input
              type="number"
              value={draft.perfectAttendancePerHourPhp}
              onChange={(e) =>
                setDraft({ ...draft, perfectAttendancePerHourPhp: Number(e.target.value) })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>1개월 만근 설명</Label>
            <Input
              value={draft.perfectAttendanceDescription}
              onChange={(e) =>
                setDraft({ ...draft, perfectAttendanceDescription: e.target.value })
              }
            />
          </div>
          <div className="space-y-1">
            <Label>누적 기간 (개월)</Label>
            <Input
              type="number"
              value={draft.quarterlyPeriodMonths}
              onChange={(e) =>
                setDraft({ ...draft, quarterlyPeriodMonths: Number(e.target.value) })
              }
            />
          </div>
          {draft.quarterlyTiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">최소 시간</Label>
                <Input
                  type="number"
                  value={tier.minHours}
                  onChange={(e) => {
                    const tiers = [...draft.quarterlyTiers];
                    tiers[i] = { ...tiers[i], minHours: Number(e.target.value) };
                    setDraft({ ...draft, quarterlyTiers: tiers });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">최대 시간</Label>
                <Input
                  type="number"
                  placeholder="무제한"
                  value={tier.maxHours ?? ""}
                  onChange={(e) => {
                    const tiers = [...draft.quarterlyTiers];
                    tiers[i] = {
                      ...tiers[i],
                      maxHours: e.target.value ? Number(e.target.value) : null,
                    };
                    setDraft({ ...draft, quarterlyTiers: tiers });
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">보너스 (PHP)</Label>
                <Input
                  type="number"
                  value={tier.amountPhp}
                  onChange={(e) => {
                    const tiers = [...draft.quarterlyTiers];
                    tiers[i] = { ...tiers[i], amountPhp: Number(e.target.value) };
                    setDraft({ ...draft, quarterlyTiers: tiers });
                  }}
                />
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button disabled={acting} onClick={() => onSave(draft)}>
              저장
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkRateDialog({
  open,
  acting,
  onClose,
  onApply,
}: {
  open: boolean;
  acting: boolean;
  onClose: () => void;
  onApply: (rate: number) => Promise<void>;
}) {
  const [rate, setRate] = useState("150");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>시급 일괄 수정</DialogTitle>
          <DialogDescription>
            활성 강사 전원의 시급을 변경합니다. 시급이 다른 강사가 있으면 확인 창이 표시됩니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>새 시급 (PHP)</Label>
            <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              취소
            </Button>
            <Button disabled={acting || !rate} onClick={() => onApply(Number(rate))}>
              적용
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-white px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function LineItem({
  label,
  amount,
  negative,
}: {
  label: string;
  amount: number;
  negative?: boolean;
}) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell
        className={cn("text-right tabular-nums", negative && amount !== 0 && "text-red-600")}
      >
        {negative && amount !== 0 ? "−" : ""}
        {formatPhpAmount(Math.abs(amount))}
      </TableCell>
    </TableRow>
  );
}
