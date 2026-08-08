"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  CreditCard,
  Plus,
  RefreshCw,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PaymentInfoPanel } from "@/components/shared/PaymentInfoPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EnrollmentStatus, PaymentRecord, PaymentStatus, StudentEnrollment } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useStudentBasePath } from "@/lib/student-paths";
import {
  formatSessionBalance,
  formatSessionProgressFromEnrollment,
  getSessionsUsed,
  sumSessionBalance,
} from "@/lib/sessions";

import { useActiveLearner, useActiveLearnerId } from "@/contexts/ActiveLearnerContext";

function enrollmentStatusBadge(
  status: EnrollmentStatus,
  t: ReturnType<typeof useTranslations<"studentPortal.enrollment">>
) {
  switch (status) {
    case "active":
      return <Badge variant="success">{t("statusActive")}</Badge>;
    case "expiring_soon":
      return <Badge variant="warning">{t("statusExpiring")}</Badge>;
    case "completed":
      return <Badge variant="secondary">{t("statusCompleted")}</Badge>;
    case "pending_payment":
      return <Badge variant="warning">{t("statusPendingPayment")}</Badge>;
  }
}

function paymentStatusLabel(
  status: PaymentStatus,
  t: ReturnType<typeof useTranslations<"studentPortal.enrollment">>
) {
  switch (status) {
    case "confirmed":
      return { label: t("paymentConfirmed"), variant: "success" as const };
    case "reported":
      return { label: t("paymentReviewing"), variant: "warning" as const };
    case "pending":
      return { label: t("paymentUnpaid"), variant: "secondary" as const };
    case "rejected":
      return { label: t("paymentRejected"), variant: "destructive" as const };
  }
}

function EnrollmentCard({
  enrollment,
  base,
}: {
  enrollment: StudentEnrollment;
  base: string;
}) {
  const t = useTranslations("studentPortal.enrollment");
  const used = getSessionsUsed(enrollment);
  const progress =
    enrollment.sessionsTotal > 0
      ? Math.round((used / enrollment.sessionsTotal) * 100)
      : 0;
  const initials = enrollment.teacherName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <Card className="overflow-hidden border-brand-100/80 transition-shadow hover:shadow-md">
      <CardContent className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div className="flex gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-500 text-lg font-bold text-white shadow-md">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold text-ink">{enrollment.planLabel}</h3>
                {enrollmentStatusBadge(enrollment.status, t)}
              </div>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-muted">
                <User className="h-3.5 w-3.5" />
                {enrollment.teacherName}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-muted">
                <BookOpen className="h-3.5 w-3.5" />
                {enrollment.curriculum}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-muted">
                <CalendarDays className="h-3.5 w-3.5" />
                {formatDate(enrollment.startDate)} — {formatDate(enrollment.endDate)}
              </p>
            </div>
          </div>

          <Button asChild className="shrink-0 gap-2 rounded-xl shadow-sm">
            <Link href={`${base}/enrollment/renew/${enrollment.id}`}>
              <RefreshCw className="h-4 w-4" />
              {t("renew")}
            </Link>
          </Button>
        </div>

        <div className="border-t border-brand-50 bg-mint-50/30 px-5 py-4 sm:px-6">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink-muted">{t("progress")}</span>
            <span className="font-bold tabular-nums text-brand-700">
              {formatSessionProgressFromEnrollment(enrollment)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-600 to-mint-300 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PaymentHistoryRow({ record }: { record: PaymentRecord }) {
  const t = useTranslations("studentPortal.enrollment");
  const status = paymentStatusLabel(record.status, t);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand-100/80 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-ink">{record.label}</p>
        <p className="mt-0.5 text-sm text-ink-muted">{formatDate(record.paidAt)}</p>
      </div>
      <div className="flex items-center gap-3">
        <p className="font-bold text-brand-700">{formatCurrency(record.amountKrw, "KRW")}</p>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
    </div>
  );
}

interface EnrollmentDashboardProps {
  payments: PaymentRecord[];
  defaultTab?: "courses" | "payment";
  studentId?: string;
}

export function EnrollmentDashboard({
  payments,
  defaultTab = "courses",
  studentId: studentIdProp,
}: EnrollmentDashboardProps) {
  const learnerId = useActiveLearnerId();
  const studentId = studentIdProp ?? learnerId;
  const { account: _account } = useActiveLearner();
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const base = useStudentBasePath();
  const [enrollments, setEnrollments] = useState<StudentEnrollment[]>([]);
  const [depositorName, setDepositorName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/student/account")
      .then((res) => res.json())
      .then((data) => {
        if (data.account?.fullName) {
          setDepositorName(data.account.fullName);
        }
      })
      .catch(() => {});
  }, []);

  const loadEnrollments = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/enrollments?studentId=${studentId}`);
      const data = await res.json();
      setEnrollments(data.enrollments ?? []);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    loadEnrollments();
  }, [loadEnrollments]);

  const activeEnrollments = enrollments.filter((e) => e.status !== "completed");
  const sessionBalance = sumSessionBalance(activeEnrollments);
  const pendingAmount = activeEnrollments.find((e) => e.paymentStatus === "pending")?.amountKrw;

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-ink-muted">{t("loadingFlow")}</div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink md:text-2xl">{t("hubTitle")}</h2>
          <p className="mt-1 text-sm text-ink-muted">{t("hubSubtitle")}</p>
        </div>
        <Button asChild size="lg" className="gap-2 rounded-xl shadow-md">
          <Link href={`${base}/enrollment/new`}>
            <Plus className="h-5 w-5" />
            {t("newEnrollment")}
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="border-brand-100/80 bg-gradient-to-br from-brand-50/80 to-white">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-ink-muted">{t("activeCourses")}</p>
            <p className="mt-1 text-3xl font-extrabold text-brand-700">{activeEnrollments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-mint-100 bg-gradient-to-br from-mint-50/60 to-white">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-ink-muted">{t("remainingSessions")}</p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums text-brand-700">
              {formatSessionBalance(sessionBalance.remaining, sessionBalance.total)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">{t("remainingFormat")}</p>
          </CardContent>
        </Card>
        <Card className="border-brand-100/80">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-ink-muted">{t("recentPayment")}</p>
            <p className="mt-1 text-lg font-bold text-ink">
              {payments[0] ? formatCurrency(payments[0].amountKrw, "KRW") : "—"}
            </p>
            {payments[0] && (
              <Badge variant="success" className="mt-2">
                {paymentStatusLabel(payments[0].status, t).label}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-brand-50/80">
          <TabsTrigger value="courses" className="gap-2">
            <BookOpen className="h-4 w-4" />
            {t("tabCourses")}
          </TabsTrigger>
          <TabsTrigger value="payment" id="payment" className="gap-2">
            <CreditCard className="h-4 w-4" />
            {t("tabPayment")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-6 space-y-4">
          {enrollments.length === 0 ? (
            <Card className="border-dashed border-brand-200 bg-brand-50/30">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                  <BookOpen className="h-7 w-7" />
                </div>
                <div>
                  <p className="font-bold text-ink">{t("noCourses")}</p>
                  <p className="mt-1 text-sm text-ink-muted">{t("noCoursesHint")}</p>
                </div>
                <Button asChild className="gap-2 rounded-xl">
                  <Link href={`${base}/enrollment/new`}>
                    {t("newEnrollment")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            enrollments.map((enrollment) => (
              <EnrollmentCard key={enrollment.id} enrollment={enrollment} base={base} />
            ))
          )}

          <Card className="border-mint-200/60 bg-mint-50/40">
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-brand-800">{t("addCourseTitle")}</p>
                <p className="mt-1 text-sm text-ink-muted">{t("addCourseHint")}</p>
              </div>
              <Button asChild variant="secondary" className="shrink-0 gap-2 rounded-xl">
                <Link href={`${base}/enrollment/new`}>
                  <Plus className="h-4 w-4" />
                  {t("newEnrollment")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment" className="mt-6 space-y-6">
          {pendingAmount && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {t("paymentPending")}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <PaymentInfoPanel
              amount={pendingAmount ?? activeEnrollments[0]?.amountKrw ?? 87000}
              currency="KRW"
              bankAccount={tCommon("bankAccount")}
              depositorHint={depositorName || tCommon("studentFallback")}
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("paymentReport")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="depositor">{t("depositor")}</Label>
                  <Input
                    id="depositor"
                    defaultValue={depositorName}
                    placeholder={t("depositorPlaceholder")}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">{t("paymentAmount")}</Label>
                  <Input
                    id="amount"
                    defaultValue={String(pendingAmount ?? activeEnrollments[0]?.amountKrw ?? 87000)}
                    className="h-11 rounded-xl"
                    readOnly
                  />
                </div>
                <Button className="h-11 w-full rounded-xl">{t("paymentReport")}</Button>
                <p className="text-center text-xs text-ink-muted">{t("paymentActivate")}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t("paymentHistory")}</CardTitle>
              <span className="text-xs text-ink-muted">{t("paymentCount", { count: payments.length })}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              {payments.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">{t("noPayments")}</p>
              ) : (
                payments.map((record) => <PaymentHistoryRow key={record.id} record={record} />)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
