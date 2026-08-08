"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CalendarClock, ChevronRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MonthlyLessonCalendar } from "@/components/student/MonthlyLessonCalendar";
import {
  GlobalRescheduleDialog,
  LessonDetailDialog,
} from "@/components/student/LessonDialogs";
import { RescheduleProgressPanel } from "@/components/shared/RescheduleProgressPanel";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store";
import { useStudentBasePath } from "@/lib/student-paths";
import { formatSessionBalance, sumSessionBalance } from "@/lib/sessions";
import { getStudentTimezone } from "@/lib/availability/timezone";
import type { Locale } from "@/lib/i18n/config";
import { formatDate, formatLessonTimeRange, formatTime } from "@/lib/utils";
import { useActiveLearner, useActiveLearnerId } from "@/contexts/ActiveLearnerContext";
import type { Lesson } from "@/types";

export function MyLessonsHub() {
  const learnerId = useActiveLearnerId();
  const { loading: learnerLoading } = useActiveLearner();
  const locale = useLocale() as Locale;
  const studentTz = getStudentTimezone(locale);
  const t = useTranslations("studentPortal.lessons");
  const tReschedule = useTranslations("studentPortal.reschedule");
  const tCommon = useTranslations("studentPortal.common");
  const base = useStudentBasePath();
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [studentLessons, setStudentLessons] = useState<Lesson[]>([]);
  const [makeupRemaining, setMakeupRemaining] = useState(2);
  const makeupLimit = 2;

  const loadData = useCallback(async () => {
    if (!learnerId) return;
    const [lessonsRes, rescheduleRes] = await Promise.all([
      fetch(`/api/teacher/lessons?scope=student&studentId=${learnerId}`),
      fetch(`/api/lessons/reschedule?studentId=${learnerId}`),
    ]);
    const lessonsData = await lessonsRes.json();
    const rescheduleData = await rescheduleRes.json();
    setStudentLessons(
      (lessonsData.lessons ?? []).sort(
        (a: Lesson, b: Lesson) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      )
    );
    setMakeupRemaining(rescheduleData.makeupRemaining ?? 2);
  }, [learnerId]);

  useEffect(() => {
    if (learnerId) void loadData();
  }, [loadData, learnerId]);

  const enrollments = learnerId
    ? getEnrollmentsByStudent(learnerId).filter((e) => e.status !== "completed")
    : [];
  const sessionBalance = sumSessionBalance(enrollments);

  const now = new Date();
  const nextLesson = studentLessons.find(
    (l) =>
      (l.status === "scheduled" || l.status === "reschedule_pending") &&
      new Date(l.scheduledAt) >= now
  );

  const openLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setDetailOpen(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lessonId = params.get("lesson");
    if (lessonId) {
      const lesson = studentLessons.find((l) => l.id === lessonId);
      if (lesson) openLesson(lesson);
    }
  }, [studentLessons]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink md:text-2xl">{t("title")}</h2>
        <p className="mt-1 text-sm text-ink-muted">{t("subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-md">
          <p className="text-xs font-medium text-brand-100">{t("nextLesson")}</p>
          {nextLesson ? (
            <>
              <p className="mt-1 text-xl font-bold tabular-nums">
                {formatLessonTimeRange(
                  nextLesson.scheduledAt,
                  nextLesson.durationMinutes,
                  locale,
                  studentTz
                )}
              </p>
              <p className="mt-0.5 text-sm text-brand-100">
                {formatDate(nextLesson.scheduledAt)} · {nextLesson.teacherName}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-brand-100">{t("noUpcoming")}</p>
          )}
        </div>

        <div className="rounded-2xl border border-mint-200/80 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-ink-muted">{t("remainingThisMonth")}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-700">
            {enrollments.length > 0
              ? formatSessionBalance(sessionBalance.remaining, sessionBalance.total)
              : "—"}
          </p>
          <Link
            href={`${base}/enrollment`}
            className="mt-2 inline-flex items-center gap-0.5 text-xs font-semibold text-brand-600 hover:underline"
          >
            {t("enrollmentInfo")}
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-ink-muted">{t("makeupRemaining")}</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-ink">
            {makeupRemaining}
            <span className="text-base font-semibold text-ink-muted">
              {" / "}
              {makeupLimit}
              {tCommon("sessions")}
            </span>
          </p>
          {nextLesson?.status === "reschedule_pending" && (
            <Badge variant="warning" className="mt-2">
              {t("reschedulePending")}
            </Badge>
          )}
        </div>
      </div>

      <MonthlyLessonCalendar
        lessons={studentLessons}
        onLessonSelect={openLesson}
        initialMonth={new Date()}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          size="lg"
          className="flex-1 gap-2 rounded-xl shadow-sm"
          onClick={() => setRescheduleOpen(true)}
        >
          <CalendarClock className="h-5 w-5" />
          {t("rescheduleButton")}
        </Button>
        <Button asChild variant="secondary" size="lg" className="flex-1 gap-2 rounded-xl">
          <Link href={`${base}/chat`}>
            <MessageCircle className="h-5 w-5" />
            {t("messageTeacher")}
          </Link>
        </Button>
      </div>

      <RescheduleProgressPanel
        role="student"
        fetchUrl={`/api/lessons/reschedule?studentId=${learnerId}`}
        timeZone={studentTz}
        locale={locale === "zh-CN" ? "zh" : locale === "ko" ? "ko" : "en"}
        title={tReschedule("progressTitle")}
        emptyMessage={tReschedule("empty")}
        onUpdated={loadData}
        labels={{
          originalTime: tReschedule("originalTime"),
          proposedTime: tReschedule("proposedTime"),
          reason: tReschedule("reason"),
          approve: tReschedule("approve"),
          reject: tReschedule("reject"),
          cancel: tReschedule("cancel"),
          processing: tReschedule("processing"),
        }}
      />

      <LessonDetailDialog
        lesson={selectedLesson}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        makeupRemaining={makeupRemaining}
        onRescheduleSubmitted={loadData}
      />

      <GlobalRescheduleDialog
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
        lessons={studentLessons}
        makeupRemaining={makeupRemaining}
        onSelectLesson={openLesson}
      />
    </div>
  );
}
