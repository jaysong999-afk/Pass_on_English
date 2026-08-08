"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminTeacherDetail } from "@/lib/admin/teacher-detail-store";
import {
  ADMIN_TEACHER_STATUS_OPTIONS,
  TEACHER_STATUS_LABELS,
} from "@/lib/admin/teacher-overview-store";
import type { Lesson, Teacher } from "@/types";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";

const LESSON_STATUS: Record<Lesson["status"], string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
  reschedule_pending: "변경 대기",
  pending_payment: "결제 대기",
};

const ENROLLMENT_STATUS: Record<string, string> = {
  active: "수강 중",
  expiring_soon: "만료 임박",
  completed: "완료",
  pending_payment: "결제 대기",
};

export default function AdminTeacherDetailPage() {
  const params = useParams();
  const teacherId = params.id as string;
  const [detail, setDetail] = useState<AdminTeacherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}`);
      if (res.ok) setDetail(await res.json());
      else setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: Teacher["status"]) {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    } finally {
      setStatusSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">선생님 정보 불러오는 중…</p>;
  }

  if (!detail) {
    return <p className="text-gray-500">선생님을 찾을 수 없습니다.</p>;
  }

  const { teacher, listMetrics } = detail;
  const initials = teacher.displayName
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const availabilitySlotCount = (Object.values(detail.availability.slots) as string[][]).reduce(
    (sum, slots) => sum + slots.length,
    0
  );

  return (
    <div className="space-y-6">
      <Card className="border-violet-100 bg-gradient-to-r from-violet-50/80 to-white">
        <CardContent className="flex flex-wrap items-start justify-between gap-6 p-6">
          <div className="flex items-start gap-4">
            <Avatar className="h-16 w-16">
              {teacher.avatarUrl && <AvatarImage src={teacher.avatarUrl} alt={teacher.displayName} />}
              <AvatarFallback className="bg-violet-100 text-lg font-bold text-violet-800">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-2xl font-bold text-ink">{teacher.displayName}</h2>
              <p className="mt-1 text-sm text-gray-600">{teacher.bio}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {teacher.specialties.slice(0, 4).map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {teacher.status === "pending" ? (
              <Badge variant="warning" className="text-sm">
                {TEACHER_STATUS_LABELS.pending}
              </Badge>
            ) : (
              <select
                className="h-10 rounded-xl border border-gray-300 bg-white px-3 text-sm font-medium"
                value={teacher.status}
                disabled={statusSaving}
                onChange={(e) => changeStatus(e.target.value as Teacher["status"])}
              >
                {ADMIN_TEACHER_STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {TEACHER_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Metric label="담당 학생" value={String(listMetrics.studentCount)} />
              <Metric label="오늘 수업" value={String(listMetrics.todayLessonCount)} />
              <Metric label="이번 달 시간" value={`${listMetrics.monthHours}h`} />
              <Metric label="점유율" value={`${listMetrics.occupancyPercent}%`} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-5">
          <CardHeader>
            <CardTitle className="text-base">프로필 · 급여</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="경력" value={`${teacher.experienceYears}년`} />
            <Row label="시급" value={formatCurrency(teacher.hourlyRatePhp, "PHP")} />
            <Row label="이메일" value={teacher.email ?? "—"} />
            <Row label="주간 Availability" value={`${availabilitySlotCount} slots`} />
            <Row
              label="이번 달 예상 급여"
              value={formatCurrency(detail.currentMonthEstimateTotal, "PHP")}
            />
            <Row label="지급 계좌" value={detail.payoutAccount.label} />
            <Row label="계좌번호" value={detail.payoutAccount.accountNumber} />
            <div className="flex gap-2 pt-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/teacher-profiles/${teacher.id}`}>프로필 편집</Link>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href="/admin/teacher-salary">급여 관리</Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-7">
          <CardHeader>
            <CardTitle className="text-base">담당 학생</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.students.length === 0 ? (
              <p className="text-sm text-gray-500">현재 배정된 학생 없음</p>
            ) : (
              <ul className="divide-y rounded-xl border">
                {detail.students.map((s) => (
                  <li key={s.studentId} className="flex items-center justify-between px-4 py-3 text-sm">
                    <div>
                      <Link
                        href={`/admin/students/${s.studentId}`}
                        className="font-medium text-violet-700 hover:underline"
                      >
                        {s.studentName}
                      </Link>
                      <p className="text-xs text-gray-500">{s.planLabel}</p>
                    </div>
                    <Badge variant="secondary">{ENROLLMENT_STATUS[s.status] ?? s.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {detail.application && (
        <Card className="border-amber-100 bg-amber-50/40">
          <CardHeader>
            <CardTitle className="text-base">가입 신청 정보</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm">
            <Row label="실명" value={detail.application.fullName} />
            <Row label="이메일" value={detail.application.email} />
            <Row label="전화" value={detail.application.phone} />
            <Row label="신청일" value={formatDate(detail.application.submittedAt, "ko")} />
            <Button size="sm" variant="outline" asChild className="col-span-2 w-fit">
              <Link href={`/admin/teachers/applications/${detail.application.id}`}>
                지원서 상세
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="lessons">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="lessons">수업</TabsTrigger>
          <TabsTrigger value="enrollments">수강 이력</TabsTrigger>
          <TabsTrigger value="feedback">피드백</TabsTrigger>
          <TabsTrigger value="salary">급여 명세</TabsTrigger>
          <TabsTrigger value="penalties">페널티</TabsTrigger>
        </TabsList>

        <TabsContent value="lessons" className="mt-4 space-y-4">
          {detail.todayLessons.length > 0 && (
            <SectionTable
              title="오늘 수업"
              rows={detail.todayLessons}
              columns={lessonColumns}
            />
          )}
          <SectionTable title="예정 수업" rows={detail.upcomingLessons} columns={lessonColumns} />
          <SectionTable title="최근 수업" rows={detail.recentLessons} columns={lessonColumns} />
        </TabsContent>

        <TabsContent value="enrollments" className="mt-4">
          <DataTable
            empty="수강 이력 없음"
            rows={detail.enrollments}
            columns={[
              { header: "플랜", cell: (e) => e.planLabel },
              { header: "학생 ID", cell: (e) => e.studentId },
              {
                header: "기간",
                cell: (e) =>
                  `${formatDate(e.startDate, "ko")} ~ ${formatDate(e.endDate, "ko")}`,
              },
              {
                header: "수업",
                cell: (e) => `${e.sessionsRemaining}/${e.sessionsTotal}회`,
              },
              { header: "상태", cell: (e) => ENROLLMENT_STATUS[e.status] ?? e.status },
            ]}
          />
        </TabsContent>

        <TabsContent value="feedback" className="mt-4 space-y-3">
          {detail.feedbacks.length === 0 ? (
            <Empty message="피드백 없음" />
          ) : (
            detail.feedbacks.map((fb) => (
              <Card key={fb.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between gap-2">
                    <CardTitle className="text-sm">{fb.topic ?? "수업 피드백"}</CardTitle>
                    <span className="text-xs text-gray-500">{formatDate(fb.lessonDate, "ko")}</span>
                  </div>
                  <p className="text-xs text-gray-500">{fb.studentName}</p>
                </CardHeader>
                <CardContent className="text-sm text-gray-700">{fb.feedback}</CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="salary" className="mt-4">
          <DataTable
            empty="급여 명세 없음"
            rows={detail.salaryStatements}
            columns={[
              { header: "월", cell: (s) => s.month },
              { header: "상태", cell: (s) => s.status },
              { header: "수업", cell: (s) => `${s.completedClasses}회` },
              { header: "시간", cell: (s) => `${s.totalHours}h` },
              {
                header: "합계",
                cell: (s) => formatCurrency(s.baseSalary + s.perfectAttendanceBonus + s.quarterlyBonus + s.otherIncentives - s.deductions, "PHP"),
              },
            ]}
          />
        </TabsContent>

        <TabsContent value="penalties" className="mt-4">
          {detail.penalties.length === 0 ? (
            <Empty message="페널티 기록 없음" />
          ) : (
            <ul className="divide-y rounded-xl border bg-white">
              {detail.penalties.map((p, i) => (
                <li key={`${p.month}-${i}`} className="px-4 py-3 text-sm">
                  <span className="font-medium">{p.month}</span>
                  {" · "}
                  {p.reason}
                  {p.perfectAttendanceForfeited && " · 만근 보너스 상실"}
                  {p.quarterlyBonusReset && " · 분기 보너스 리셋"}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

const lessonColumns = [
  {
    header: "일시",
    cell: (l: Lesson) =>
      `${formatDate(l.scheduledAt, "ko")} ${formatTime(l.scheduledAt, "ko", CANONICAL_TIMEZONE)}`,
  },
  { header: "학생", cell: (l: Lesson) => l.studentName ?? "—" },
  { header: "상태", cell: (l: Lesson) => LESSON_STATUS[l.status] },
  { header: "분", cell: (l: Lesson) => `${l.durationMinutes}분` },
];

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-gray-500">{message}</p>;
}

function DataTable<T>({
  rows,
  columns,
  empty,
}: {
  rows: T[];
  columns: { header: string; cell: (row: T) => React.ReactNode }[];
  empty: string;
}) {
  if (rows.length === 0) return <Empty message={empty} />;
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.header}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.header}>{c.cell(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function SectionTable<T>({
  title,
  rows,
  columns,
}: {
  title: string;
  rows: T[];
  columns: { header: string; cell: (row: T) => React.ReactNode }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      <DataTable rows={rows} columns={columns} empty="" />
    </div>
  );
}
