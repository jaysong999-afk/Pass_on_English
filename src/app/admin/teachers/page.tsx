"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, UserCheck, PauseCircle, UserX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_TEACHER_STATUS_OPTIONS,
  TEACHER_STATUS_LABELS,
  type AdminTeacherListItem,
  type AdminTeacherSummaryCounts,
} from "@/lib/admin/teacher-overview-store";
import type { Teacher } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { PersonAvatar } from "@/components/shared/PersonAvatar";

export default function AdminTeachersPage() {
  const [summary, setSummary] = useState<AdminTeacherSummaryCounts | null>(null);
  const [teachers, setTeachers] = useState<AdminTeacherListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingApplications, setPendingApplications] = useState<
    { id: string; fullName: string; email: string }[]
  >([]);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/teachers");
      const data = await res.json();
      setSummary(data.summary ?? null);
      setTeachers(data.teachers ?? []);
      setPendingApplications(data.pendingApplications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(teacherId: string, status: Teacher["status"]) {
    setUpdatingId(teacherId);
    try {
      const res = await fetch(`/api/admin/teachers/${teacherId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <SummaryCard icon={UserCheck} label="활성" value={summary.active} accent="text-emerald-600" />
          <SummaryCard icon={Users} label="승인 대기" value={summary.pending} accent="text-amber-600" />
          <SummaryCard icon={PauseCircle} label="휴직" value={summary.onLeave} accent="text-blue-600" />
          <SummaryCard icon={UserX} label="종료" value={summary.terminated} accent="text-gray-600" />
        </div>
      )}

      {pendingApplications.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <p className="text-sm text-amber-900">
              승인 대기 가입 신청 <strong>{pendingApplications.length}건</strong>
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/admin/teachers/applications/${pendingApplications[0].id}`}>
                신청 검토
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>강사명</TableHead>
              <TableHead className="text-right">학생 수</TableHead>
              <TableHead className="text-right">오늘 수업</TableHead>
              <TableHead className="text-right">이번 달 시간</TableHead>
              <TableHead className="text-right">수업 점유율</TableHead>
              <TableHead className="text-right">예상 급여</TableHead>
              <TableHead>상태</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-gray-500">
                  불러오는 중…
                </TableCell>
              </TableRow>
            )}
            {!loading && teachers.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-sm text-gray-500">
                  등록된 선생님이 없습니다.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              teachers.map((teacher) => (
                <TableRow key={teacher.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <PersonAvatar
                        name={teacher.displayName}
                        avatarUrl={teacher.avatarUrl}
                        className="h-9 w-9"
                        fallbackClassName="text-xs font-bold"
                      />
                      <span className="font-medium">{teacher.displayName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{teacher.studentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{teacher.todayLessonCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{teacher.monthHours}h</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span title={`${teacher.scheduledThisMonth} / ${teacher.availabilityThisMonth} slots`}>
                      {teacher.occupancyPercent}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {formatCurrency(teacher.estimatedSalaryPhp, "PHP")}
                  </TableCell>
                  <TableCell>
                    {teacher.status === "pending" ? (
                      <Badge variant="warning">{TEACHER_STATUS_LABELS.pending}</Badge>
                    ) : (
                      <select
                        className="h-9 rounded-lg border border-gray-300 bg-white px-2 text-sm"
                        value={teacher.status}
                        disabled={updatingId === teacher.id}
                        onChange={(e) =>
                          changeStatus(teacher.id, e.target.value as Teacher["status"])
                        }
                      >
                        {ADMIN_TEACHER_STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {TEACHER_STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/admin/teachers/${teacher.id}`}>상세</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <Icon className={`h-8 w-8 ${accent}`} />
        <div>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
