"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentInfoPanel } from "@/components/shared/PaymentInfoPanel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PricingPlan, StudentEnrollment, Teacher } from "@/types";
import type { SlotStartTime } from "@/lib/availability/types";
import { sessionEndTime, slotsForSessionMinutes } from "@/lib/availability/time-utils";
import { formatPlanLabel } from "@/lib/pricing-plan-display";
import type { Locale } from "@/lib/i18n/config";
import { usePricingPlans } from "@/hooks/usePricingPlans";
import {
  formatScheduleDays,
  formatUnifiedSlotLabel,
  nextPlanSlotOccurrenceIso,
  sortTeachersByPlanAvailability,
  type TeacherScheduleSlot,
} from "@/lib/teacher-availability";
import { formatCurrency, formatDate } from "@/lib/utils";
import { addDaysToDateKey } from "@/lib/contract-schedule";
import { useStudentBasePath } from "@/lib/student-paths";
import { getStudentTimezone, getTimezoneShortLabel } from "@/lib/availability/timezone";
import { useActiveLearner } from "@/contexts/ActiveLearnerContext";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { TeacherProfileModal } from "@/components/student/TeacherProfileModal";
import { TeacherSlotPicker } from "@/components/student/TeacherSlotPicker";
import { useTeacherOpenSlots } from "@/hooks/useTeacherOpenSlots";

type FlowMode = "new" | "renew";

interface EnrollmentFlowProps {
  mode: FlowMode;
  teachers: Teacher[];
  enrollment?: StudentEnrollment;
}

interface StudentProfileSummary {
  fullName: string;
  englishName: string;
  trialUsed: boolean;
}

export function EnrollmentFlow({ mode, teachers, enrollment }: EnrollmentFlowProps) {
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const tSurvey = useTranslations("studentPortal.survey");
  const base = useStudentBasePath();

  const { activeLearner, account } = useActiveLearner();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [profile, setProfile] = useState<StudentProfileSummary | null>(null);
  const [initialTrialEligible, setInitialTrialEligible] = useState(false);
  const [trialBookedThisSession, setTrialBookedThisSession] = useState(false);
  const [profileLoading, setProfileLoading] = useState(mode === "new");
  const { plans, loading: plansLoading } = usePricingPlans(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    enrollment?.planId ?? null
  );
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    enrollment?.teacherId ?? null
  );
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [timeError, setTimeError] = useState("");
  const [timeSubmitting, setTimeSubmitting] = useState(false);

  const stepLabels = useMemo(
    () => [t("stepPlan"), t("stepTeacher"), t("stepTime"), t("stepPayment")],
    [t]
  );

  useEffect(() => {
    if (mode !== "new") return;

    fetch("/api/student/account")
      .then((res) => res.json())
      .then((data) => {
        if (data.activeLearner) {
          setInitialTrialEligible(mode === "new" && !data.activeLearner.trialUsed);
          setProfile({
            fullName: data.activeLearner.fullName,
            englishName: data.activeLearner.englishName,
            trialUsed: Boolean(data.activeLearner.trialUsed),
          });
        }
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [mode]);

  useEffect(() => {
    if (plans.length === 0 || selectedPlanId) return;
    setSelectedPlanId(plans[0].id);
  }, [plans, selectedPlanId]);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedTeacher = teachers.find((te) => te.id === selectedTeacherId);
  const depositorName = account?.fullName ?? profile?.fullName ?? tCommon("studentFallback");

  const sortedTeachers = useMemo(() => {
    if (!selectedPlan) return { available: [], closed: [] };
    return sortTeachersByPlanAvailability(
      teachers,
      selectedPlan.scheduleDays,
      selectedPlan.sessionMinutes
    );
  }, [teachers, selectedPlan]);

  const { openSlots } = useTeacherOpenSlots(
    teachers,
    selectedPlan?.scheduleDays,
    selectedPlan?.sessionMinutes ?? 20,
    selectedTeacher?.id ?? null
  );

  const selectedSlot = openSlots.find((s) => s.id === selectedSlotId) ?? null;

  const title = mode === "renew" ? t("renewTitle") : t("newTitle");
  const subtitle =
    mode === "renew"
      ? t("renewSubtitleKeep")
      : initialTrialEligible
        ? t("newSubtitleTrial")
        : t("newSubtitle");

  const renewPlan =
    mode === "renew" && enrollment ? plans.find((p) => p.id === enrollment.planId) : null;
  const renewTeacher =
    mode === "renew" && enrollment
      ? teachers.find((te) => te.id === enrollment.teacherId)
      : null;
  const renewSlotTime = (enrollment?.preferredSlotTime ?? "10:00") as SlotStartTime;

  function handlePlanSelect(planId: string) {
    setSelectedPlanId(planId);
    setSelectedTeacherId(null);
    setSelectedSlotId(null);
  }

  function handleTeacherSelect(teacherId: string) {
    setSelectedTeacherId(teacherId);
    setSelectedSlotId(null);
  }

  async function handleProceedFromTime() {
    setTimeError("");
    if (!selectedSlot) {
      setTimeError(t("selectTimeError"));
      return;
    }

    if (initialTrialEligible && !trialBookedThisSession) {
      if (!selectedTeacher || !selectedPlan) {
        setTimeError(t("selectTimeError"));
        return;
      }
      setTimeSubmitting(true);
      try {
        const scheduledAt = nextPlanSlotOccurrenceIso(
          selectedPlan.scheduleDays,
          selectedSlot.startTime as SlotStartTime
        );
        const res = await fetch("/api/student/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "book_trial",
            scheduledAt,
            teacherId: selectedTeacher.id,
            teacherName: selectedTeacher.displayName,
            planId: selectedPlan.id,
            sessionMinutes: selectedPlan.sessionMinutes,
          }),
        });

        if (!res.ok) {
          setTimeError(t("trialBookFailed"));
          return;
        }

        if (selectedTeacher && selectedPlan) {
          await fetch("/api/teacher/availability", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reserve",
              teacherId: selectedTeacher.id,
              startTime: selectedSlot.startTime,
              studentName: profile
                ? getStudentDisplayName(profile)
                : getStudentDisplayName(activeLearner!),
              planDays: selectedPlan.scheduleDays,
              sessionMinutes: selectedPlan.sessionMinutes,
            }),
          });
        }

        const data = await res.json();
        setTrialBookedThisSession(true);
        setProfile({
          fullName: data.profile.fullName,
          englishName: data.profile.englishName,
          trialUsed: true,
        });
      } catch {
        setTimeError(tSurvey("errorNetwork"));
        return;
      } finally {
        setTimeSubmitting(false);
      }
    }

    setStep(4);
  }

  const locale = useLocale() as Locale;

  if (mode === "renew" && enrollment) {
    if (plansLoading) {
      return <div className="py-12 text-center text-ink-muted">{t("loadingFlow")}</div>;
    }
    if (!renewPlan || !renewTeacher) {
      return (
        <div className="py-16 text-center">
          <p className="text-ink-muted">{t("renewNotAvailable")}</p>
          <Button asChild className="mt-4">
            <Link href={`${base}/enrollment`}>{t("goBack")}</Link>
          </Button>
        </div>
      );
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const renewStartKey =
      enrollment.endDate >= todayKey ? addDaysToDateKey(enrollment.endDate, 1) : todayKey;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3 gap-1 text-ink-muted">
            <Link href={`${base}/enrollment`}>
              <ArrowLeft className="h-4 w-4" />
              {t("flowBack")}
            </Link>
          </Button>
          <h2 className="text-xl font-bold text-ink md:text-2xl">{title}</h2>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>

        <Card className="border-brand-100 bg-brand-50/40">
          <CardContent className="space-y-3 p-4 text-sm">
            <p className="font-medium text-brand-800">{t("renewKeepSummaryTitle")}</p>
            <SummaryRow label={t("planLabel")} value={formatPlanLabel(renewPlan, locale)} />
            <SummaryRow label={t("teacherLabel")} value={renewTeacher.displayName} />
            <SummaryRow
              label={t("stepTime")}
              value={formatUnifiedSlotLabel(
                renewPlan.scheduleDays,
                renewSlotTime,
                locale,
                renewPlan.sessionMinutes
              )}
            />
            <SummaryRow
              label={t("renewStartLabel")}
              value={
                enrollment.endDate >= todayKey
                  ? formatDate(renewStartKey, locale)
                  : t("renewStartSoon")
              }
            />
          </CardContent>
        </Card>

        <PaymentStep
          mode="renew"
          plan={renewPlan}
          teacher={renewTeacher}
          slot={{
            id: `${renewTeacher.id}-unified-${renewSlotTime}`,
            teacherId: renewTeacher.id,
            dayOfWeek: 1,
            dayLabel: renewPlan.scheduleDays[0] ?? "Mon",
            startTime: renewSlotTime,
            endTime: sessionEndTime(renewSlotTime, renewPlan.sessionMinutes),
            isOpen: true,
            sessionMinutes: renewPlan.sessionMinutes,
            blockCount: slotsForSessionMinutes(renewPlan.sessionMinutes),
          }}
          depositorName={depositorName}
          learnerId={activeLearner?.id}
          renewFromEnrollmentId={enrollment.id}
          trialBooked={false}
          onBack={() => {}}
          enrollmentHref={`${base}/enrollment`}
          hideBack
        />
      </div>
    );
  }

  if (profileLoading || plansLoading) {
    return <div className="py-12 text-center text-ink-muted">{t("loadingFlow")}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3 gap-1 text-ink-muted">
          <Link href={`${base}/enrollment`}>
            <ArrowLeft className="h-4 w-4" />
            {t("flowBack")}
          </Link>
        </Button>
        <h2 className="text-xl font-bold text-ink md:text-2xl">{title}</h2>
        <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
      </div>

      <StepIndicator currentStep={step} labels={stepLabels} />

      {step === 1 && (
        <PlanStep
          mode={mode}
          plans={plans}
          selectedPlanId={selectedPlanId}
          onSelect={handlePlanSelect}
          trialEligible={initialTrialEligible}
          onNext={() => setStep(2)}
          enrollmentHref={`${base}/enrollment`}
        />
      )}

      {step === 2 && selectedPlan && (
        <TeacherStep
          plan={selectedPlan}
          sorted={sortedTeachers}
          selectedTeacherId={selectedTeacherId}
          onSelect={handleTeacherSelect}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && selectedPlan && selectedTeacher && (
        <TimeStep
          plan={selectedPlan}
          teacher={selectedTeacher}
          openSlots={openSlots}
          selectedSlotId={selectedSlotId}
          onSelect={setSelectedSlotId}
          trialEligible={initialTrialEligible}
          error={timeError}
          submitting={timeSubmitting}
          onBack={() => setStep(2)}
          onNext={handleProceedFromTime}
        />
      )}

      {step === 4 && selectedPlan && selectedTeacher && selectedSlot && (
        <PaymentStep
          mode={mode}
          plan={selectedPlan}
          teacher={selectedTeacher}
          slot={selectedSlot}
          depositorName={depositorName}
          learnerId={activeLearner?.id}
          trialBooked={trialBookedThisSession}
          onBack={() => setStep(3)}
          enrollmentHref={`${base}/enrollment`}
        />
      )}
    </div>
  );
}

function StepIndicator({ currentStep, labels }: { currentStep: number; labels: string[] }) {
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, index) => {
        const s = index + 1;
        return (
          <div key={label} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                currentStep >= s ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-400"
              }`}
            >
              {currentStep > s ? <Check className="h-4 w-4" /> : s}
            </div>
            <span
              className={`hidden text-xs font-medium sm:block ${
                currentStep >= s ? "text-brand-700" : "text-ink-muted"
              }`}
            >
              {label}
            </span>
            {s < labels.length && <div className="mx-1 h-px flex-1 bg-brand-100" />}
          </div>
        );
      })}
    </div>
  );
}

function PlanStep({
  mode,
  plans,
  selectedPlanId,
  onSelect,
  trialEligible,
  onNext,
  enrollmentHref,
}: {
  mode: FlowMode;
  plans: PricingPlan[];
  selectedPlanId: string | null;
  onSelect: (id: string) => void;
  trialEligible: boolean;
  onNext: () => void;
  enrollmentHref: string;
}) {
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-ink-muted">{t("selectPlan")}</p>
      <div className="space-y-3">
        {plans.map((plan) => (
          <PlanOption
            key={plan.id}
            plan={plan}
            selected={selectedPlanId === plan.id}
            onSelect={() => onSelect(plan.id)}
          />
        ))}
      </div>

      {trialEligible && (
        <div className="rounded-xl border border-mint-200 bg-mint-50/50 p-4">
          <p className="font-semibold text-brand-800">{t("freeTrialTitle")}</p>
          <p className="mt-1 text-sm text-ink-muted">{t("freeTrialDesc")}</p>
        </div>
      )}

      <div className="flex gap-3">
        {mode === "renew" && (
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" asChild>
            <Link href={enrollmentHref}>{tCommon("cancel")}</Link>
          </Button>
        )}
        <Button
          className="h-11 w-full rounded-xl"
          disabled={!selectedPlanId}
          onClick={onNext}
        >
          {t("nextTeacher")}
        </Button>
      </div>
    </div>
  );
}

function TeacherStep({
  plan,
  sorted,
  selectedTeacherId,
  onSelect,
  onBack,
  onNext,
}: {
  plan: PricingPlan;
  sorted: ReturnType<typeof sortTeachersByPlanAvailability>;
  selectedTeacherId: string | null;
  onSelect: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const locale = useLocale() as Locale;

  const [profileTeacher, setProfileTeacher] = useState<{
    teacher: Teacher;
    openSlotCount?: number;
    closed: boolean;
  } | null>(null);

  const profileOpenSlotCount = profileTeacher?.openSlotCount;
  const profileClosed = profileTeacher?.closed ?? false;

  return (
    <div className="space-y-4">
      <Card className="border-brand-100 bg-brand-50/40">
        <CardContent className="flex items-center gap-3 p-4">
          <p className="text-sm text-ink-muted">{t("selectedPlan")}</p>
          <p className="font-bold text-ink">{formatPlanLabel(plan, locale)}</p>
        </CardContent>
      </Card>

      <p className="text-sm font-medium text-ink-muted">{t("teacherSortHint")}</p>

      {sorted.available.length > 0 && (
        <div className="grid gap-3">
          {sorted.available.map(({ teacher, openSlotCount }) => (
            <TeacherCard
              key={teacher.id}
              teacher={teacher}
              selected={selectedTeacherId === teacher.id}
              openSlotCount={openSlotCount}
              closed={false}
              onSelect={() => onSelect(teacher.id)}
              onViewProfile={() =>
                setProfileTeacher({ teacher, openSlotCount, closed: false })
              }
            />
          ))}
        </div>
      )}

      {sorted.closed.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {t("closed")}
          </p>
          <div className="grid gap-3">
            {sorted.closed.map(({ teacher }) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                selected={false}
                openSlotCount={0}
                closed
                onSelect={() => {}}
                onViewProfile={() =>
                  setProfileTeacher({ teacher, openSlotCount: 0, closed: true })
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onBack}>
          {tCommon("back")}
        </Button>
        <Button
          className="h-11 flex-1 rounded-xl"
          disabled={!selectedTeacherId}
          onClick={onNext}
        >
          {t("nextTime")}
        </Button>
      </div>

      <TeacherProfileModal
        teacher={profileTeacher?.teacher ?? null}
        openSlotCount={profileOpenSlotCount}
        closed={profileClosed}
        selected={
          profileTeacher ? selectedTeacherId === profileTeacher.teacher.id : false
        }
        onClose={() => setProfileTeacher(null)}
        onSelect={
          profileTeacher && !profileTeacher.closed
            ? () => onSelect(profileTeacher.teacher.id)
            : undefined
        }
      />
    </div>
  );
}

function TeacherCard({
  teacher,
  selected,
  openSlotCount,
  closed,
  onSelect,
  onViewProfile,
}: {
  teacher: Teacher;
  selected: boolean;
  openSlotCount: number;
  closed: boolean;
  onSelect: () => void;
  onViewProfile: () => void;
}) {
  const t = useTranslations("studentPortal.enrollment");

  const initials = teacher.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);

  return (
    <div
      className={`flex w-full items-start gap-4 rounded-2xl border p-4 transition-all ${
        closed
          ? "border-gray-200 bg-gray-50 opacity-70"
          : selected
            ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20"
            : "border-brand-100/80 bg-white hover:border-mint-200"
      }`}
    >
      <button
        type="button"
        onClick={onViewProfile}
        className="group flex shrink-0 flex-col items-center gap-1 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-label={t("viewProfileAria", { name: teacher.displayName })}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-sm font-bold text-white transition-transform group-hover:scale-105 ${
            closed
              ? "bg-gray-400"
              : "bg-gradient-to-br from-brand-600 to-brand-500"
          }`}
        >
          {initials}
        </div>
        <span className="text-xs font-medium text-brand-600 group-hover:underline">
          {t("profile")}
        </span>
      </button>

      <button
        type="button"
        disabled={closed}
        onClick={onSelect}
        className="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={`font-bold ${closed ? "text-gray-500" : "text-ink"}`}>
            {teacher.displayName}
          </p>
          {closed ? (
            <Badge variant="secondary" className="bg-gray-200 text-gray-600">
              {t("closed")}
            </Badge>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-brand-700">
              <Clock className="h-3.5 w-3.5" />
              {t("openSlots", { count: openSlotCount })}
            </span>
          )}
        </div>
        <p className={`mt-1 line-clamp-2 text-sm ${closed ? "text-gray-400" : "text-ink-muted"}`}>
          {teacher.bio}
        </p>
        {!closed && (
          <div className="mt-2 flex flex-wrap gap-1">
            {teacher.specialties.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s}
              </Badge>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

function TimeStep({
  plan,
  teacher,
  openSlots,
  selectedSlotId,
  onSelect,
  trialEligible,
  error,
  submitting,
  onBack,
  onNext,
}: {
  plan: PricingPlan;
  teacher: Teacher;
  openSlots: TeacherScheduleSlot[];
  selectedSlotId: string | null;
  onSelect: (id: string) => void;
  trialEligible: boolean;
  error: string;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const locale = useLocale() as Locale;

  return (
    <div className="space-y-4">
      <Card className="border-brand-100 bg-brand-50/40">
        <CardContent className="space-y-2 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-ink-muted">{t("planLabel")}</span>
            <span className="font-medium text-ink">{formatPlanLabel(plan, locale)}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-ink-muted">{t("teacherLabel")}</span>
            <span className="font-medium text-ink">{teacher.displayName}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-ink-muted">{t("planDaysLabel")}</span>
            <span className="font-medium text-ink">
              {formatScheduleDays(plan.scheduleDays, locale)}
            </span>
          </div>
        </CardContent>
      </Card>

      {trialEligible && (
        <div className="rounded-xl border border-mint-200 bg-mint-50/50 p-4 text-sm text-ink-muted">
          {t.rich("trialTimeHint", {
            strong: (chunks) => <strong className="text-brand-800">{chunks}</strong>,
          })}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-sm font-medium text-ink-muted">
          {t("selectTime")}{" "}
          <span className="font-normal text-ink-muted/80">
            ({getTimezoneShortLabel(getStudentTimezone(locale), locale)})
          </span>
        </p>
        <p className="text-xs text-ink-muted">
          {t("selectTimePlanApply", {
            days: formatScheduleDays(plan.scheduleDays, locale),
          })}
        </p>
      </div>

      {openSlots.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-ink-muted">
          {t("noTimeSlots")}
        </p>
      ) : (
        <TeacherSlotPicker
          sessionMinutes={plan.sessionMinutes}
          openSlots={openSlots}
          selectedSlotId={selectedSlotId}
          onSelect={onSelect}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onBack}>
          {tCommon("back")}
        </Button>
        <Button
          className="h-11 flex-1 rounded-xl"
          disabled={!selectedSlotId || submitting}
          onClick={onNext}
        >
          {submitting
            ? t("booking")
            : trialEligible
              ? t("bookTrialAndPay")
              : t("nextPayment")}
        </Button>
      </div>
    </div>
  );
}

function PaymentStep({
  mode,
  plan,
  teacher,
  slot,
  depositorName,
  learnerId,
  renewFromEnrollmentId,
  trialBooked,
  onBack,
  enrollmentHref,
  hideBack = false,
}: {
  mode: FlowMode;
  plan: PricingPlan;
  teacher: Teacher;
  slot: TeacherScheduleSlot;
  depositorName: string;
  learnerId?: string;
  renewFromEnrollmentId?: string;
  trialBooked: boolean;
  onBack: () => void;
  enrollmentHref: string;
  hideBack?: boolean;
}) {
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const locale = useLocale() as Locale;
  const [depositor, setDepositor] = useState(depositorName);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handlePaymentReport() {
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/enrollments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          renewFromEnrollmentId
            ? {
                renewFromEnrollmentId,
                depositorName: depositor.trim() || depositorName,
                learnerId,
                locale,
              }
            : {
                planId: plan.id,
                teacherId: teacher.id,
                teacherName: teacher.displayName,
                depositorName: depositor.trim() || depositorName,
                learnerId,
                locale,
                preferredSlotTime: slot.startTime,
              }
        ),
      });

      if (!res.ok) {
        setError(t("paymentReportFailed"));
        return;
      }

      setSubmitted(true);
    } catch {
      setError(tCommon("errorNetwork"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {trialBooked && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-ink-muted">
          {t("trialBooked", {
            slot: formatUnifiedSlotLabel(
              plan.scheduleDays,
              slot.startTime as SlotStartTime,
              locale,
              plan.sessionMinutes
            ),
          })}
        </div>
      )}

      {!trialBooked && mode === "new" && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm text-ink-muted">
          {t("paymentAfterTrialHint")}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("summary")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <SummaryRow label={t("planLabel")} value={formatPlanLabel(plan, locale)} />
          <SummaryRow label={t("teacherLabel")} value={teacher.displayName} />
          <SummaryRow
            label={t("stepTime")}
            value={formatUnifiedSlotLabel(
              plan.scheduleDays,
              slot.startTime as SlotStartTime,
              locale,
              plan.sessionMinutes
            )}
          />
          <SummaryRow
            label={t("sessionCount")}
            value={`${plan.sessionsCount}${tCommon("sessions")} · ${plan.sessionMinutes}${tCommon("minutes")}`}
          />
          <SummaryRow
            label={t("paymentAmountLabel")}
            value={formatCurrency(plan.priceKrw, "KRW")}
            highlight
          />
        </CardContent>
      </Card>

      <PaymentInfoPanel
        amount={plan.priceKrw}
        currency="KRW"
        bankAccount={tCommon("bankAccount")}
        depositorHint={depositor}
      />

      {submitted ? (
        <Card className="border-brand-200 bg-brand-50/30">
          <CardContent className="space-y-3 py-6 text-center">
            <p className="font-semibold text-ink">{t("paymentReportedTitle")}</p>
            <p className="text-sm text-ink-muted">{t("paymentReportedBody")}</p>
            <Button className="h-11 rounded-xl" asChild>
              <Link href={enrollmentHref}>{t("flowComplete")}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("paymentReport")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flow-depositor">{t("depositor")}</Label>
              <Input
                id="flow-depositor"
                value={depositor}
                onChange={(e) => setDepositor(e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button
              className="h-11 w-full rounded-xl"
              disabled={submitting}
              onClick={handlePaymentReport}
            >
              {submitting
                ? t("submittingPayment")
                : mode === "renew"
                  ? t("renewPaymentReport")
                  : t("enrollmentPaymentReport")}
            </Button>
            <p className="text-center text-xs text-ink-muted">
              {mode === "renew" ? t("paymentActivateRenew") : t("paymentActivateNew")}
            </p>
          </CardContent>
        </Card>
      )}

      {!submitted && !hideBack && (
        <div className="flex gap-3">
          <Button variant="secondary" className="h-11 flex-1 rounded-xl" onClick={onBack}>
            {tCommon("back")}
          </Button>
        </div>
      )}
    </div>
  );
}

function PlanOption({
  plan,
  selected,
  onSelect,
}: {
  plan: PricingPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("studentPortal.enrollment");
  const tCommon = useTranslations("studentPortal.common");
  const locale = useLocale() as Locale;

  const popular = plan.isPopular;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-all ${
        selected
          ? "border-brand-600 bg-brand-50 ring-2 ring-brand-600/20"
          : "border-brand-100/80 bg-white hover:border-mint-200"
      }`}
    >
      <div>
        <div className="flex items-center gap-2">
          <p className="font-bold text-ink">{formatPlanLabel(plan, locale)}</p>
          {popular && (
            <Badge className="bg-brand-600 text-white hover:bg-brand-600">
              {tCommon("popular")}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-muted">
          {t("perSession", { count: plan.sessionsCount, minutes: plan.sessionMinutes })}
        </p>
      </div>
      <p className="text-lg font-bold text-brand-700">{formatCurrency(plan.priceKrw, "KRW")}</p>
    </button>
  );
}

function SummaryRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-brand-50 pb-2 last:border-0">
      <span className="text-ink-muted">{label}</span>
      <span className={highlight ? "text-lg font-bold text-brand-700" : "font-medium text-ink"}>
        {value}
      </span>
    </div>
  );
}
