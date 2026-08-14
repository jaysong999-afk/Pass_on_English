"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Calendar, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeacherLessonDetailCard } from "@/components/teacher/TeacherLessonDetailCard";
import { RescheduleProgressPanel } from "@/components/shared/RescheduleProgressPanel";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import type { LessonDisplayContext } from "@/lib/teacher-lesson-context";
import type { Lesson } from "@/types";
import { formatDate, formatLessonTimeRange, formatTime } from "@/lib/utils";

interface LessonWithDisplay {
  lesson: Lesson;
  display: LessonDisplayContext | null;
}

interface HubData {
  nextLesson: LessonWithDisplay | null;
  todayLessons: LessonWithDisplay[];
  actionRequired: LessonWithDisplay[];
}

export function TeacherMyLessonsHub() {
  const [data, setData] = useState<HubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/teacher/lessons?timeZone=${encodeURIComponent(TEACHER_TIMEZONE)}`
      );
      const json = (await res.json()) as Partial<HubData> & { error?: string };

      if (!res.ok) {
        setData(null);
        setError(json.error ?? "Could not load lessons.");
        return;
      }

      if (!Array.isArray(json.todayLessons) || !Array.isArray(json.actionRequired)) {
        setData(null);
        setError("Unexpected response from server.");
        return;
      }

      setData({
        nextLesson: json.nextLesson ?? null,
        todayLessons: json.todayLessons,
        actionRequired: json.actionRequired,
      });
    } catch {
      setData(null);
      setError("Could not load lessons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">Loading your lessons…</p>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        {error ?? "Could not load lessons. Please refresh."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Next Lesson
        </h2>
        {data.nextLesson?.display ? (
          <TeacherLessonDetailCard
            display={data.nextLesson.display}
            editableTextbook
            showViewLink
          />
        ) : (
          <Card>
            <CardContent className="py-8 text-center text-sm text-gray-400">
              No upcoming lessons scheduled.
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-emerald-600" />
              Today&apos;s Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pb-4">
            {data.todayLessons.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No lessons scheduled for today.
              </p>
            ) : (
              data.todayLessons.map(({ lesson, display }) => (
                <Link
                  key={lesson.id}
                  href={`/teacher/lessons/${lesson.id}`}
                  className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">
                      {display?.englishName ?? lesson.studentName ?? "Student"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatLessonTimeRange(
                        lesson.scheduledAt,
                        lesson.durationMinutes,
                        "en",
                        TEACHER_TIMEZONE
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Action Required
            </CardTitle>
            <p className="text-xs text-amber-700/80">
              Lessons ended — feedback not yet submitted
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5 pb-4">
            {data.actionRequired.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                All caught up! No pending feedback.
              </p>
            ) : (
              data.actionRequired.map(({ lesson, display }) => (
                <Link
                  key={lesson.id}
                  href={`/teacher/lessons/${lesson.id}/feedback`}
                  className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-sm transition-colors hover:bg-amber-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-amber-950">
                      {display?.englishName ?? lesson.studentName ?? "Student"}
                    </p>
                    <p className="text-xs text-amber-800/70">
                      {formatTime(lesson.scheduledAt, "en", TEACHER_TIMEZONE)} ·{" "}
                      Write feedback
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <RescheduleProgressPanel
        role="teacher"
        fetchUrl="/api/lessons/reschedule"
        timeZone={TEACHER_TIMEZONE}
        locale="en"
        title="Reschedule Requests"
        emptyMessage="No reschedule requests."
        onUpdated={load}
        labels={{
          originalTime: "Current time",
          proposedTime: "Proposed time",
          reason: "Reason",
          approve: "Approve",
          reject: "Reject",
          cancel: "Cancel request",
          processing: "Processing…",
        }}
      />
    </div>
  );
}
