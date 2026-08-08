"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { EnrollmentSessionEditor } from "@/components/admin/EnrollmentSessionEditor";
import type { AdminStudentDetail } from "@/lib/admin/student-detail-store";
import { formatCefrLevel, formatCoursePurposes } from "@/lib/student-survey-labels";
import { formatSessionBalance, getSessionsUsed } from "@/lib/sessions";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import type { EnrollmentStatus, Lesson, PaymentStatus } from "@/types";

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  confirmed: "확인됨",
  reported: "입금 신고",
  pending: "대기",
  rejected: "거절",
};

const ENROLLMENT_STATUS: Record<EnrollmentStatus, string> = {
  active: "수강 중",
  expiring_soon: "만료 임박",
  completed: "완료",
  pending_payment: "결제 대기",
};

const LESSON_STATUS: Record<Lesson["status"], string> = {
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
  reschedule_pending: "변경 대기",
  pending_payment: "결제 대기",
};

const ACCOUNT_TYPE_LABELS = {
  self: "본인 수강",
  guardian: "보호자(자녀)",
};

export default function AdminStudentDetailPage() {
  const params = useParams();
  const studentId = params.id as string;
  const [detail, setDetail] = useState<AdminStudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/students/${studentId}`);
      if (res.ok) {
        setDetail(await res.json());
      } else {
        setDetail(null);
      }
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingEnrollment = detail?.enrollments.find(
    (e) => e.status === "pending_payment" && e.paymentStatus === "reported"
  );

  async function handlePaymentAction(action: "confirm_payment" | "reject_payment") {
    if (!pendingEnrollment) return;
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/enrollments/${pendingEnrollment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        setActionError("처리에 실패했습니다.");
        return;
      }
      await load();
    } catch {
      setActionError("네트워크 오류가 발생했습니다.");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-gray-500">학생 정보 불러오는 중…</p>;
  }

  if (!detail) {
    return <p className="text-gray-500">학생을 찾을 수 없습니다.</p>;
  }

  const { student, displayName, legalName, accountHolder, learner } = detail;
  const paymentStatus = pendingEnrollment?.paymentStatus ?? student.paymentStatus;
  const activeEnrollments = detail.enrollments.filter((e) => e.status !== "completed");

  return (
    <div className="space-y-6">
      <Card className="border-violet-100 bg-gradient-to-r from-violet-50/80 to-white">
        <CardContent className="flex flex-wrap items-start justify-between gap-4 p-6">
          <div>
            <h2 className="text-2xl font-bold text-ink">{displayName}</h2>
            {legalName !== displayName && (
              <p className="mt-1 text-sm text-gray-500">실명: {legalName}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">{student.country === "KR" ? "한국" : "중국"}</Badge>
              <Badge variant={paymentStatus === "confirmed" ? "success" : "warning"}>
                {PAYMENT_LABELS[paymentStatus]}
              </Badge>
              {student.trialUsed && <Badge variant="outline">체험 완료</Badge>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Stat label="최초 수강일" value={detail.firstEnrollmentDate ? formatDate(detail.firstEnrollmentDate, "ko") : "—"} />
            <Stat label="수강 기간" value={detail.enrollmentPeriod ?? "—"} />
            <Stat
              label="잔여 수업"
              value={
                activeEnrollments.length > 0
                  ? formatSessionBalance(
                      activeEnrollments.reduce((s, e) => s + e.sessionsRemaining, 0),
                      activeEnrollments.reduce((s, e) => s + e.sessionsTotal, 0)
                    )
                  : "—"
              }
            />
            <Stat label="수업 피드백" value={`${detail.feedbacks.length}건`} />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-12 gap-6">
        <Card className="col-span-5">
          <CardHeader>
            <CardTitle className="text-base">학습자 프로필</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row label="영어 이름" value={displayName} />
            <Row label="실명" value={legalName} />
            <Row label="생년월일" value={student.dateOfBirth ? formatDate(student.dateOfBirth, "ko") : "—"} />
            <Row label="영어 수준" value={formatCefrLevel(student.englishLevel)} />
            <Row label="수강 목적" value={formatCoursePurposes(student.purposes)} />
            <Row label="연락 이메일" value={student.email ?? "—"} />
            <Row label="연락 전화" value={student.phone ?? "—"} />
            {learner?.surveyNotes && <Row label="설문 메모" value={learner.surveyNotes} />}
            {learner?.createdAt && (
              <Row label="등록일" value={formatDate(learner.createdAt, "ko")} />
            )}
          </CardContent>
        </Card>

        <Card className="col-span-7">
          <CardHeader>
            <CardTitle className="text-base">계정 · 현재 수강</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {accountHolder ? (
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase text-gray-400">결제 계정 (보호자)</p>
                <Row label="계정주" value={accountHolder.fullName} />
                <Row label="유형" value={ACCOUNT_TYPE_LABELS[accountHolder.accountType]} />
                <Row label="이메일" value={accountHolder.email} />
                <Row label="전화" value={accountHolder.phone} />
              </div>
            ) : (
              <p className="text-sm text-gray-500">연결된 계정 정보 없음</p>
            )}
            {activeEnrollments.map((e) => (
              <div key={e.id} className="rounded-xl border p-4 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{e.planLabel}</p>
                  <Badge variant="secondary">{ENROLLMENT_STATUS[e.status]}</Badge>
                </div>
                <p className="text-sm text-gray-500">
                  {e.teacherName} · {e.curriculum}
                </p>
                <p className="text-sm tabular-nums">
                  {formatSessionBalance(e.sessionsRemaining, e.sessionsTotal)} (사용{" "}
                  {getSessionsUsed(e)}회)
                </p>
                <p className="text-xs text-gray-500">
                  {formatDate(e.startDate, "ko")} ~ {formatDate(e.endDate, "ko")} ·{" "}
                  {formatCurrency(e.amountKrw, "KRW")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <EnrollmentSessionEditor studentId={student.id} studentName={displayName} />

      {pendingEnrollment && (
        <Card className="border-green-200 bg-green-50/50">
          <CardHeader>
            <CardTitle className="text-base text-green-800">입금 확인</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">
              {pendingEnrollment.planLabel} · {formatCurrency(pendingEnrollment.amountKrw, "KRW")} —
              입금 확인 시 수강이 활성화됩니다.
            </p>
            {actionError && <p className="text-sm text-red-600">{actionError}</p>}
            <div className="flex gap-2">
              <Button
                className="bg-green-600 hover:bg-green-700"
                disabled={actionLoading}
                onClick={() => handlePaymentAction("confirm_payment")}
              >
                입금 확인 · 수업 승인
              </Button>
              <Button
                variant="destructive"
                disabled={actionLoading}
                onClick={() => handlePaymentAction("reject_payment")}
              >
                거절
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="enrollments">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="enrollments">수강 이력</TabsTrigger>
          <TabsTrigger value="lessons">수업</TabsTrigger>
          <TabsTrigger value="payments">결제</TabsTrigger>
          <TabsTrigger value="feedback">피드백</TabsTrigger>
          <TabsTrigger value="reports">성장 레포트</TabsTrigger>
          <TabsTrigger value="reschedule">변경 요청</TabsTrigger>
          <TabsTrigger value="chat">채팅</TabsTrigger>
        </TabsList>

        <TabsContent value="enrollments" className="mt-4">
          <DataTable
            empty="수강 이력 없음"
            rows={detail.enrollments}
            columns={[
              { header: "플랜", cell: (e) => e.planLabel },
              { header: "선생님", cell: (e) => e.teacherName },
              { header: "기간", cell: (e) => `${formatDate(e.startDate, "ko")} ~ ${formatDate(e.endDate, "ko")}` },
              { header: "수업", cell: (e) => formatSessionBalance(e.sessionsRemaining, e.sessionsTotal) },
              { header: "상태", cell: (e) => ENROLLMENT_STATUS[e.status] },
              { header: "입금", cell: (e) => PAYMENT_LABELS[e.paymentStatus] },
            ]}
          />
        </TabsContent>

        <TabsContent value="lessons" className="mt-4">
          <DataTable
            empty="수업 기록 없음"
            rows={detail.lessons.slice(0, 30)}
            columns={[
              {
                header: "일시",
                cell: (l) =>
                  `${formatDate(l.scheduledAt, "ko")} ${formatTime(l.scheduledAt, "ko", CANONICAL_TIMEZONE)}`,
              },
              { header: "선생님", cell: (l) => l.teacherName },
              { header: "상태", cell: (l) => LESSON_STATUS[l.status] },
              { header: "비고", cell: (l) => (l.isTrial ? "체험" : l.teacherNoShow ? "노쇼" : "—") },
            ]}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <DataTable
            empty="결제 기록 없음"
            rows={detail.payments}
            columns={[
              { header: "일자", cell: (p) => formatDate(p.paidAt, "ko") },
              { header: "내역", cell: (p) => p.label },
              { header: "금액", cell: (p) => formatCurrency(p.amountKrw, "KRW") },
              { header: "입금자", cell: (p) => p.depositorName ?? "—" },
              { header: "상태", cell: (p) => PAYMENT_LABELS[p.status] },
            ]}
          />
        </TabsContent>

        <TabsContent value="feedback" className="mt-4">
          <div className="space-y-3">
            {detail.feedbacks.length === 0 ? (
              <EmptyState message="피드백 없음" />
            ) : (
              detail.feedbacks.map((fb) => (
                <Card key={fb.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-sm font-semibold">{fb.topic ?? "수업 피드백"}</CardTitle>
                      <span className="text-xs text-gray-500">{formatDate(fb.lessonDate, "ko")}</span>
                    </div>
                    <p className="text-xs text-gray-500">{fb.teacherName}</p>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-700 space-y-2">
                    <p>{fb.feedback}</p>
                    {fb.homework && <p className="text-xs text-gray-500">과제: {fb.homework}</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="reports" className="mt-4">
          <div className="space-y-3">
            {detail.reports.length === 0 ? (
              <EmptyState message="성장 레포트 없음" />
            ) : (
              detail.reports.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{r.title}</CardTitle>
                    <p className="text-xs text-gray-500">
                      {r.month} · {r.teacherName}
                    </p>
                  </CardHeader>
                  <CardContent className="text-sm text-gray-700">
                    <p>{r.overallComment}</p>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="reschedule" className="mt-4">
          <DataTable
            empty="변경 요청 없음"
            rows={detail.rescheduleRequests}
            columns={[
              { header: "요청일", cell: (r) => formatDate(r.createdAt, "ko") },
              { header: "기존", cell: (r) => formatDate(r.originalScheduledAt, "ko") },
              { header: "희망", cell: (r) => formatDate(r.proposedScheduledAt, "ko") },
              { header: "상태", cell: (r) => r.status },
              { header: "사유", cell: (r) => r.reason ?? "—" },
            ]}
          />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <DataTable
            empty="채팅방 없음"
            rows={detail.chatRooms}
            columns={[
              { header: "상대", cell: (r) => r.displayName },
              { header: "마지막 메시지", cell: (r) => r.lastMessage || "—" },
              { header: "일시", cell: (r) => formatDate(r.lastMessageAt, "ko") },
              {
                header: "",
                cell: (r) => (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/admin/chat/${r.id}`}>열기</Link>
                  </Button>
                ),
              },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-semibold text-ink">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
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
  if (rows.length === 0) {
    return <EmptyState message={empty} />;
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.header}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((col) => (
                <TableCell key={col.header}>{col.cell(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
