"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeacherLessonDetailCard } from "@/components/teacher/TeacherLessonDetailCard";
import { RescheduleRequestForm } from "@/components/shared/RescheduleRequestForm";
import { LessonStatusBadge } from "@/components/shared/LessonStatusBadge";
import type { LessonDisplayContext } from "@/lib/teacher-lesson-context";
import type { Lesson } from "@/types";

interface LessonDetailResponse {
  lesson: Lesson;
  display: LessonDisplayContext | null;
  needsFeedback: boolean;
}

export default function TeacherLessonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [data, setData] = useState<LessonDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRescheduleForm, setShowRescheduleForm] = useState(false);

  const load = () => {
    if (!lessonId) return;
    setLoading(true);
    fetch(`/api/teacher/lessons/${lessonId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setData(json))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    params.then((p) => setLessonId(p.id));
  }, [params]);

  useEffect(() => {
    load();
  }, [lessonId]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading lesson…</p>;
  }

  if (!data?.lesson) {
    return <p className="text-gray-500">Lesson not found.</p>;
  }

  const { lesson, display, needsFeedback } = data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
        <Link href="/teacher">
          <ArrowLeft className="h-4 w-4" />
          My Lessons
        </Link>
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">Lesson Details</h1>
        <LessonStatusBadge status={lesson.status} locale="en" studentAbsent={lesson.studentAbsent} />
      </div>

      {display ? (
        <TeacherLessonDetailCard display={display} editableTextbook />
      ) : (
        <p className="text-sm text-gray-500">Student information unavailable.</p>
      )}

      {needsFeedback && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            This lesson has ended. Please submit feedback to mark it complete.
          </p>
          <Button asChild className="mt-3 bg-emerald-600 hover:bg-emerald-700" size="sm">
            <Link href={`/teacher/lessons/${lesson.id}/feedback`}>
              Write Feedback
            </Link>
          </Button>
        </div>
      )}

      {lesson.status === "reschedule_pending" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A reschedule request is pending approval.
        </p>
      ) : lesson.status === "scheduled" && !showRescheduleForm ? (
        <Button variant="secondary" onClick={() => setShowRescheduleForm(true)}>
          Request Reschedule
        </Button>
      ) : lesson.status === "scheduled" && showRescheduleForm ? (
        <RescheduleRequestForm
          lesson={lesson}
          initiator="teacher"
          onCancel={() => setShowRescheduleForm(false)}
          onSubmitted={() => {
            setShowRescheduleForm(false);
            load();
          }}
          labels={{
            title: "Request Reschedule",
            proposedTime: "Proposed Date & Time",
            reason: "Reason",
            reasonPlaceholder: "Reason for the schedule change",
            submit: "Send Request",
            cancel: "Cancel",
            submitting: "Sending…",
            success: "Request sent. Waiting for student approval.",
            pendingExists: "A reschedule request is already pending for this lesson.",
          }}
        />
      ) : null}
    </div>
  );
}
