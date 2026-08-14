"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  ClipboardList,
  GraduationCap,
  RefreshCw,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
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
import {
  actionLabel,
  type AdminReviewLogsByCategory,
} from "@/lib/admin/admin-review-log-store";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import {
  initiatorLabel,
  rescheduleStatusLabel,
} from "@/lib/reschedule-labels";
import { formatCurrency, formatDate, formatTime } from "@/lib/utils";
import type {
  AdminReviewLogEntry,
  LessonRescheduleRequest,
  StudentEnrollment,
  StudentRegistrationReview,
  TeacherApplication,
} from "@/types";

interface PaymentReviewEnrollment extends StudentEnrollment {
  studentName: string;
  studentLegalName?: string;
  depositorName?: string;
  accountHolderName?: string;
  renewalUnapplied?: boolean;
}

interface ReviewSnapshot {
  reschedule: LessonRescheduleRequest[];
  teacherApplications: TeacherApplication[];
  studentRegistrations: StudentRegistrationReview[];
  paymentEnrollments: PaymentReviewEnrollment[];
  logs: AdminReviewLogsByCategory;
}

type ReviewTab = "reschedule" | "teacher" | "student" | "payment";

const TAB_META: { id: ReviewTab; label: string; icon: typeof RefreshCw }[] = [
  { id: "reschedule", label: "수업 시간 변경", icon: CalendarClock },
  { id: "teacher", label: "신규 선생님", icon: UserPlus },
  { id: "student", label: "신규 학생", icon: GraduationCap },
  { id: "payment", label: "입금 · 수업 활성화", icon: Wallet },
];

export function AdminReviewCenter() {
  const [tab, setTab] = useState<ReviewTab>("reschedule");
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reviews");
      const data = (await res.json()) as ReviewSnapshot;
      setSnapshot(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(
    () => ({
      reschedule: snapshot?.reschedule.length ?? 0,
      teacher: snapshot?.teacherApplications.length ?? 0,
      student: snapshot?.studentRegistrations.length ?? 0,
      payment: snapshot?.paymentEnrollments.length ?? 0,
    }),
    [snapshot]
  );

  const totalPending = counts.reschedule + counts.teacher + counts.student + counts.payment;

  const runAction = async (input: {
    category: "reschedule" | "teacher_signup" | "student_signup" | "payment_activation";
    action: "approve" | "reject" | "confirm" | "activate";
    targetId: string;
  }) => {
    const key = `${input.category}:${input.action}:${input.targetId}`;
    setActingKey(key);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (res.ok) {
        const data = (await res.json()) as { snapshot: ReviewSnapshot };
        setSnapshot(data.snapshot);
        return;
      }

      const data = (await res.json()) as { error?: string };
      const messages: Record<string, string> = {
        profile_incomplete: "프로필(2단계) 미완료 지원서입니다. 선생님이 프로필을 제출한 뒤 승인해 주세요.",
        teacher_not_found: "연결된 선생님 프로필을 찾을 수 없습니다.",
        not_pending: "이미 처리된 지원서입니다.",
        not_found: "대상을 찾을 수 없습니다.",
        slot_unavailable: "해당 시간은 다른 수업이 있어 선택할 수 없습니다.",
      };
      setActionError(messages[data.error ?? ""] ?? "처리에 실패했습니다.");
    } finally {
      setActingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {actionError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">
            학생·선생님 요청과 신규 가입, 입금 신고를 한곳에서 검토합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={totalPending > 0 ? "warning" : "secondary"}>
            대기 {totalPending}건
          </Badge>
          <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewTab)}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          {TAB_META.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="gap-1.5">
              <Icon className="h-4 w-4" />
              {label}
              {counts[id] > 0 && (
                <Badge variant="warning" className="ml-1 px-1.5 py-0 text-[10px]">
                  {counts[id]}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="reschedule" className="mt-4 space-y-4">
          <ReviewQueueCard
            title="수업 시간 변경 요청"
            empty="진행 중인 변경 요청이 없습니다."
            loading={loading}
            isEmpty={!snapshot?.reschedule.length}
          >
            {snapshot?.reschedule.map((req) => {
              const keyApprove = `reschedule:approve:${req.id}`;
              const keyReject = `reschedule:reject:${req.id}`;
              return (
                <div
                  key={req.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{req.studentName}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{req.teacherName}</span>
                    <Badge variant="warning" className="text-[10px]">
                      {initiatorLabel(req.initiator, "ko")}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {rescheduleStatusLabel(req.status, "ko")}
                    </Badge>
                  </div>
                  <dl className="space-y-1 text-xs text-gray-600">
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium">기존:</dt>
                      <dd>
                        {formatDate(req.originalScheduledAt, "ko")}{" "}
                        {formatTime(req.originalScheduledAt, "ko", CANONICAL_TIMEZONE)}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0 font-medium">변경 희망:</dt>
                      <dd className="font-medium text-emerald-800">
                        {formatDate(req.proposedScheduledAt, "ko")}{" "}
                        {formatTime(req.proposedScheduledAt, "ko", CANONICAL_TIMEZONE)}
                      </dd>
                    </div>
                    {req.reason && (
                      <div className="flex gap-2">
                        <dt className="shrink-0 font-medium">사유:</dt>
                        <dd>{req.reason}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      disabled={actingKey === keyApprove}
                      onClick={() =>
                        runAction({
                          category: "reschedule",
                          action: "approve",
                          targetId: req.id,
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-600"
                      disabled={actingKey === keyReject}
                      onClick={() =>
                        runAction({
                          category: "reschedule",
                          action: "reject",
                          targetId: req.id,
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      거절
                    </Button>
                  </div>
                </div>
              );
            })}
          </ReviewQueueCard>
          <ReviewLogSection
            title="수업 시간 변경 처리 로그"
            logs={snapshot?.logs.reschedule ?? []}
            empty="처리된 수업 시간 변경 내역이 없습니다."
          />
        </TabsContent>

        <TabsContent value="teacher" className="mt-4 space-y-4">
          <ReviewQueueCard
            title="신규 선생님 가입 승인"
            empty="승인 대기 중인 선생님 신청이 없습니다."
            loading={loading}
            isEmpty={!snapshot?.teacherApplications.length}
          >
            {snapshot?.teacherApplications.map((app) => {
              const keyApprove = `teacher_signup:approve:${app.id}`;
              const keyReject = `teacher_signup:reject:${app.id}`;
              const profileReady = Boolean(app.teacherId);
              return (
                <div key={app.id} className="rounded-xl border border-gray-100 bg-white p-4 text-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{app.fullName}</span>
                    <Badge variant="warning" className="text-[10px]">
                      승인 대기
                    </Badge>
                    <Badge variant={profileReady ? "success" : "secondary"} className="text-[10px]">
                      {profileReady ? "프로필 완료" : "프로필 미완료"}
                    </Badge>
                  </div>
                  <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">이메일:</span> {app.email}
                    </div>
                    <div>
                      <span className="font-medium">전화:</span> {app.phone}
                    </div>
                    <div>
                      <span className="font-medium">신청일:</span>{" "}
                      {formatDate(app.submittedAt, "ko")}
                    </div>
                    <div>
                      <span className="font-medium">Messenger:</span>{" "}
                      {app.facebookMessengerId}
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      disabled={actingKey === keyApprove || !profileReady}
                      title={
                        profileReady
                          ? undefined
                          : "선생님이 2단계 프로필을 제출해야 승인할 수 있습니다."
                      }
                      onClick={() =>
                        runAction({
                          category: "teacher_signup",
                          action: "approve",
                          targetId: app.id,
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      승인 · 계정 활성화
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-600"
                      disabled={actingKey === keyReject}
                      onClick={() =>
                        runAction({
                          category: "teacher_signup",
                          action: "reject",
                          targetId: app.id,
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      거절
                    </Button>
                  </div>
                </div>
              );
            })}
          </ReviewQueueCard>
          <ReviewLogSection
            title="신규 선생님 처리 로그"
            logs={snapshot?.logs.teacher_signup ?? []}
            empty="처리된 선생님 가입 내역이 없습니다."
          />
        </TabsContent>

        <TabsContent value="student" className="mt-4 space-y-4">
          <ReviewQueueCard
            title="신규 학생 가입 확인"
            empty="확인 대기 중인 학생 가입이 없습니다."
            loading={loading}
            isEmpty={!snapshot?.studentRegistrations.length}
          >
            {snapshot?.studentRegistrations.map((reg) => {
              const keyConfirm = `student_signup:confirm:${reg.id}`;
              const keyReject = `student_signup:reject:${reg.id}`;
              return (
                <div key={reg.id} className="rounded-xl border border-gray-100 bg-white p-4 text-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{reg.learnerEnglishName}</span>
                    <span className="text-gray-500">({reg.learnerFullName})</span>
                    <Badge variant="warning" className="text-[10px]">
                      확인 대기
                    </Badge>
                  </div>
                  <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">보호자/본인:</span> {reg.accountHolderName}
                    </div>
                    <div>
                      <span className="font-medium">이메일:</span> {reg.accountEmail}
                    </div>
                    <div>
                      <span className="font-medium">연락처:</span> {reg.accountPhone}
                    </div>
                    <div>
                      <span className="font-medium">가입일:</span>{" "}
                      {formatDate(reg.submittedAt, "ko")}
                    </div>
                    {reg.englishLevel && (
                      <div>
                        <span className="font-medium">레벨:</span> {reg.englishLevel}
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      disabled={actingKey === keyConfirm}
                      onClick={() =>
                        runAction({
                          category: "student_signup",
                          action: "confirm",
                          targetId: reg.id,
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      가입 확인
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-600"
                      disabled={actingKey === keyReject}
                      onClick={() =>
                        runAction({
                          category: "student_signup",
                          action: "reject",
                          targetId: reg.id,
                        })
                      }
                    >
                      <X className="h-3.5 w-3.5" />
                      거절
                    </Button>
                  </div>
                </div>
              );
            })}
          </ReviewQueueCard>
          <ReviewLogSection
            title="신규 학생 처리 로그"
            logs={snapshot?.logs.student_signup ?? []}
            empty="처리된 학생 가입 내역이 없습니다."
          />
        </TabsContent>

        <TabsContent value="payment" className="mt-4 space-y-4">
          <ReviewQueueCard
            title="수강 신청 · 입금 확인"
            empty="입금 확인 대기 중인 수강 신청이 없습니다."
            loading={loading}
            isEmpty={!snapshot?.paymentEnrollments.length}
          >
            {snapshot?.paymentEnrollments.map((enrollment) => {
              const keyActivate = `payment_activation:activate:${enrollment.id}`;
              const keyReject = `payment_activation:reject:${enrollment.id}`;
              const awaitingDeposit = enrollment.paymentStatus === "pending";
              const legalSuffix = enrollment.studentLegalName
                ? ` (${enrollment.studentLegalName})`
                : "";
              const badgeLabel = enrollment.renewalUnapplied
                ? "재수강 미신청"
                : awaitingDeposit
                  ? "입금 대기"
                  : "입금 신고";
              return (
                <div
                  key={enrollment.id}
                  className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-sm"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/students/${enrollment.studentId}`}
                      className="font-semibold text-ink hover:text-violet-700 hover:underline"
                    >
                      {enrollment.studentName}
                      {legalSuffix}
                    </Link>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-600">{enrollment.planLabel}</span>
                    <Badge
                      variant={
                        enrollment.renewalUnapplied
                          ? "warning"
                          : awaitingDeposit
                            ? "secondary"
                            : "warning"
                      }
                      className="text-[10px]"
                    >
                      {badgeLabel}
                    </Badge>
                    {enrollment.renewedFromEnrollmentId && (
                      <Badge variant="secondary" className="text-[10px]">
                        재수강
                      </Badge>
                    )}
                  </div>
                  <dl className="grid gap-1 text-xs text-gray-600 sm:grid-cols-2">
                    <div>
                      <span className="font-medium">학생:</span> {enrollment.studentName}
                      {legalSuffix}
                    </div>
                    <div>
                      <span className="font-medium">입금자:</span>{" "}
                      {enrollment.depositorName ?? (
                        <span className="text-gray-400">아직 입금 신고 전</span>
                      )}
                    </div>
                    {enrollment.accountHolderName && (
                      <div>
                        <span className="font-medium">계정(보호자):</span>{" "}
                        {enrollment.accountHolderName}
                      </div>
                    )}
                    <div>
                      <span className="font-medium">선생님:</span> {enrollment.teacherName}
                    </div>
                    <div>
                      <span className="font-medium">금액:</span>{" "}
                      {formatCurrency(enrollment.amountKrw, "KRW")}
                    </div>
                    <div>
                      <span className="font-medium">수업:</span> {enrollment.sessionsTotal}회
                    </div>
                    {enrollment.confirmedAt && (
                      <div>
                        <span className="font-medium">신청 확인:</span>{" "}
                        {formatDate(enrollment.confirmedAt, "ko")}{" "}
                        {formatTime(enrollment.confirmedAt, "ko", CANONICAL_TIMEZONE)}
                      </div>
                    )}
                    {enrollment.renewalLastLessonEndedAt && (
                      <div>
                        <span className="font-medium">마지막 수업 종료:</span>{" "}
                        {formatDate(enrollment.renewalLastLessonEndedAt, "ko")}{" "}
                        {formatTime(enrollment.renewalLastLessonEndedAt, "ko", CANONICAL_TIMEZONE)}
                      </div>
                    )}
                    {enrollment.renewalStudentDeadlineAt && (
                      <div>
                        <span className="font-medium">학생 입금 기한:</span>{" "}
                        {formatDate(enrollment.renewalStudentDeadlineAt, "ko")}{" "}
                        {formatTime(enrollment.renewalStudentDeadlineAt, "ko", CANONICAL_TIMEZONE)}
                      </div>
                    )}
                    {enrollment.paymentDeadlineAt && (
                      <div>
                        <span className="font-medium">
                          {enrollment.renewedFromEnrollmentId ? "슬롯 홀드 마감:" : "입금 마감:"}
                        </span>{" "}
                        {formatDate(enrollment.paymentDeadlineAt, "ko")}{" "}
                        {formatTime(enrollment.paymentDeadlineAt, "ko", CANONICAL_TIMEZONE)}
                      </div>
                    )}
                    {enrollment.preferredSlotTime && (
                      <div>
                        <span className="font-medium">희망 시간:</span>{" "}
                        {enrollment.preferredSlotDay ?? ""} {enrollment.preferredSlotTime}
                      </div>
                    )}
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                      disabled={actingKey === keyActivate}
                      onClick={() =>
                        runAction({
                          category: "payment_activation",
                          action: "activate",
                          targetId: enrollment.id,
                        })
                      }
                    >
                      <Check className="h-3.5 w-3.5" />
                      입금 확인 · 수업 활성화
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-red-600"
                      disabled={actingKey === keyReject}
                      onClick={() => {
                        const ok = window.confirm(
                          `${enrollment.studentName} 건을 거절하면 수강 신청이 취소되고, 잡아 둔 수업 시간이 다시 열립니다. 계속할까요?`
                        );
                        if (!ok) return;
                        void runAction({
                          category: "payment_activation",
                          action: "reject",
                          targetId: enrollment.id,
                        });
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                      거절
                    </Button>
                  </div>
                </div>
              );
            })}
          </ReviewQueueCard>
          <ReviewLogSection
            title="입금 · 수업 활성화 처리 로그"
            logs={snapshot?.logs.payment_activation ?? []}
            empty="처리된 입금 확인 내역이 없습니다."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReviewLogSection({
  title,
  logs,
  empty,
}: {
  title: string;
  logs: AdminReviewLogEntry[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-5 w-5 text-emerald-600" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!logs.length ? (
          <p className="py-6 text-center text-sm text-gray-400">{empty}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>처리 시각</TableHead>
                  <TableHead>처리</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>상세</TableHead>
                  <TableHead>담당</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDate(log.at, "ko")}{" "}
                      {formatTime(log.at, "ko", CANONICAL_TIMEZONE)}
                    </TableCell>
                    <TableCell className="text-xs">{actionLabel(log.action)}</TableCell>
                    <TableCell className="font-medium">{log.targetLabel}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-xs text-gray-500">
                      {log.detail ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">{log.adminName}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewQueueCard({
  title,
  empty,
  loading,
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  loading: boolean;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-400">불러오는 중…</p>
        ) : isEmpty ? (
          <p className="py-8 text-center text-sm text-gray-400">{empty}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
