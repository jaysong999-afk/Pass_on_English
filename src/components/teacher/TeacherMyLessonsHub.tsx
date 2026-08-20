"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, BellRing, Calendar, Check, ChevronRight, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TeacherLessonDetailCard } from "@/components/teacher/TeacherLessonDetailCard";
import { RescheduleProgressPanel } from "@/components/shared/RescheduleProgressPanel";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import type { LessonDisplayContext } from "@/lib/teacher-lesson-context";
import type { CoursePurpose, Lesson } from "@/types";
import { formatLessonTimeRange, formatTime } from "@/lib/utils";
import { apiRequest } from "@/lib/api/client";
import { useApiResource } from "@/hooks/useApiResource";
import { formatCoursePurposesEnglish } from "@/lib/student-survey-labels";

interface LessonWithDisplay {
  lesson: Lesson;
  display: LessonDisplayContext | null;
}

interface HubData {
  nextLesson: LessonWithDisplay | null;
  todayLessons: LessonWithDisplay[];
  actionRequired: LessonWithDisplay[];
  newAssignments: Array<LessonWithDisplay & {
    notificationId: string;
    purposes: CoursePurpose[];
    createdAt: string;
  }>;
}

export function TeacherMyLessonsHub() {
  const [viewingAssignment, setViewingAssignment] = useState<HubData["newAssignments"][number] | null>(null);
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [acknowledgedIds, setAcknowledgedIds] = useState<string[]>([]);
  const [acknowledgeError, setAcknowledgeError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const json = await apiRequest<Partial<HubData>>(
      `/api/teacher/lessons?timeZone=${encodeURIComponent(TEACHER_TIMEZONE)}`
    );
    if (!Array.isArray(json.todayLessons) || !Array.isArray(json.actionRequired)) {
      throw new Error("Unexpected response from server.");
    }
    return {
      nextLesson: json.nextLesson ?? null,
      todayLessons: json.todayLessons,
      actionRequired: json.actionRequired,
      newAssignments: Array.isArray(json.newAssignments) ? json.newAssignments : [],
    };
  }, []);
  const { data, loading, error, reload } = useApiResource<HubData | null>(load, null);
  const visibleAssignments = useMemo(
    () => data?.newAssignments.filter((notice) => !acknowledgedIds.includes(notice.notificationId)) ?? [],
    [acknowledgedIds, data]
  );

  const acknowledgeAssignment = useCallback(async (notificationId: string) => {
    setAcknowledgingId(notificationId);
    setAcknowledgeError(null);
    try {
      await apiRequest<{ success: boolean }>("/api/notifications?role=teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [notificationId] }),
      });
      setAcknowledgedIds((current) => [...current, notificationId]);
      if (viewingAssignment?.notificationId === notificationId) {
        setViewingAssignment(null);
      }
    } catch {
      setAcknowledgeError("Could not acknowledge this assignment. Please try again.");
    } finally {
      setAcknowledgingId(null);
    }
  }, [viewingAssignment]);

  if (loading) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">Loading your lessons…</p>
    );
  }

  if (!data) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        {error instanceof Error ? error.message : "Could not load lessons. Please refresh."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {visibleAssignments.length > 0 && (
        <section aria-labelledby="new-lesson-assignments-heading">
          <Card className="overflow-hidden border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 shadow-sm">
            <CardHeader className="border-b border-sky-100 pb-3">
              <CardTitle id="new-lesson-assignments-heading" className="flex items-center gap-2 text-base text-sky-950">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-100">
                  <BellRing className="h-5 w-5 text-sky-700" />
                </span>
                New lesson assignment
                <Badge className="bg-sky-600 text-white hover:bg-sky-600">{visibleAssignments.length}</Badge>
              </CardTitle>
              <p className="text-sm text-sky-800/75">
                A new student or trial lesson has been added to your schedule.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-4">
              {visibleAssignments.map((notice) => (
                <div key={notice.notificationId} className="rounded-xl border border-sky-100 bg-white/90 p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{notice.display?.englishName ?? notice.lesson.studentName ?? "Student"}</p>
                        <Badge className="bg-rose-500 text-white hover:bg-rose-500">NEW</Badge>
                        {notice.lesson.isTrial && <Badge variant="warning">TRIAL</Badge>}
                      </div>
                      <p className="text-sm text-gray-600">
                        First lesson: {formatLessonTimeRange(notice.lesson.scheduledAt, notice.lesson.durationMinutes, "en", TEACHER_TIMEZONE)}
                      </p>
                      <p className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">Learning goals:</span>{" "}
                        {notice.purposes.length > 0 ? formatCoursePurposesEnglish(notice.purposes) : "Not provided"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setViewingAssignment(notice)}>
                        <Eye className="h-4 w-4" />
                        View lesson
                      </Button>
                      <Button
                        size="sm"
                        className="gap-1.5 bg-sky-700 hover:bg-sky-800"
                        disabled={acknowledgingId === notice.notificationId}
                        onClick={() => void acknowledgeAssignment(notice.notificationId)}
                      >
                        <Check className="h-4 w-4" />
                        {acknowledgingId === notice.notificationId ? "Saving…" : "Acknowledge"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {acknowledgeError && <p role="alert" className="text-sm text-red-600">{acknowledgeError}</p>}
            </CardContent>
          </Card>
        </section>
      )}

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
                    <div className="truncate font-medium text-ink">
                      {display?.englishName ?? lesson.studentName ?? "Student"}
                      {lesson.isTrial && (
                        <Badge className="ml-2 bg-rose-500 align-middle text-[10px] text-white hover:bg-rose-500">NEW</Badge>
                      )}
                    </div>
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
        onUpdated={reload}
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

      <Dialog open={Boolean(viewingAssignment)} onOpenChange={(open) => !open && setViewingAssignment(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>New lesson details</DialogTitle>
          </DialogHeader>
          {viewingAssignment?.display && (
            <div>
              <div className="border-b border-sky-100 bg-sky-50 px-5 py-4 pr-12">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Learning goals</p>
                <p className="mt-1 text-sm font-medium text-sky-950">
                  {viewingAssignment.purposes.length > 0
                    ? formatCoursePurposesEnglish(viewingAssignment.purposes)
                    : "Not provided"}
                </p>
              </div>
              <TeacherLessonDetailCard
                display={viewingAssignment.display}
                editableTextbook
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
