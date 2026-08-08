"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import { formatDate, formatTime } from "@/lib/utils";
import type { Lesson } from "@/types";

export default function TeacherLessonFeedbackPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [lessonId, setLessonId] = useState<string | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [englishName, setEnglishName] = useState("");
  const [loading, setLoading] = useState(true);

  const [feedback, setFeedback] = useState("");
  const [homework, setHomework] = useState("");
  const [topic, setTopic] = useState("");
  const [progressPages, setProgressPages] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [markingAbsent, setMarkingAbsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [absentMarked, setAbsentMarked] = useState(false);
  const [showAbsentConfirm, setShowAbsentConfirm] = useState(false);

  useEffect(() => {
    params.then((p) => setLessonId(p.id));
  }, [params]);

  useEffect(() => {
    if (!lessonId) return;
    setLoading(true);
    fetch(`/api/teacher/lessons/${lessonId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.lesson) {
          setLesson(data.lesson);
          setEnglishName(data.display?.englishName ?? data.lesson.studentName ?? "Student");
          if (data.lesson.status === "completed" && data.lesson.studentAbsent) {
            setAbsentMarked(true);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [lessonId]);

  const handleSubmit = async () => {
    if (!feedback.trim() || !lesson?.studentId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/learning/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          studentId: lesson.studentId,
          studentName: lesson.studentName,
          teacherId: lesson.teacherId,
          teacherName: lesson.teacherName,
          lessonDate: lesson.scheduledAt,
          topic: topic.trim() || undefined,
          feedback: feedback.trim(),
          homework: homework.trim() || undefined,
          progressPages: progressPages.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setTimeout(() => router.push("/teacher"), 1500);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkStudentAbsent = async () => {
    if (!lessonId) return;
    setMarkingAbsent(true);
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_student_absent" }),
      });
      if (res.ok) {
        setShowAbsentConfirm(false);
        setAbsentMarked(true);
        setTimeout(() => router.push("/teacher"), 1500);
      }
    } finally {
      setMarkingAbsent(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (!lesson) {
    return <p className="text-gray-500">Lesson not found.</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Button variant="ghost" size="sm" asChild className="gap-1 -ml-2">
        <Link href={`/teacher/lessons/${lesson.id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to lesson
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lesson Feedback</CardTitle>
          <p className="text-sm text-gray-500">
            {englishName} · {formatDate(lesson.scheduledAt, "en")}{" "}
            {formatTime(lesson.scheduledAt, "en", TEACHER_TIMEZONE)}
          </p>
        </CardHeader>
      </Card>

      {submitted ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle className="mb-2 inline h-5 w-5" /> Feedback sent and lesson
          marked complete. Redirecting…
        </div>
      ) : absentMarked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <UserX className="mb-2 inline h-5 w-5" /> Student marked absent. Lesson
          completed and included in your payroll. Redirecting…
        </div>
      ) : (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label>Lesson Topic (optional)</Label>
              <Input
                placeholder="e.g. Daily Conversation · Hobbies"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Progress (pages) *</Label>
              <Input
                placeholder="e.g. p. 15–17"
                value={progressPages}
                onChange={(e) => setProgressPages(e.target.value)}
                className="rounded-xl"
              />
              <p className="text-xs text-gray-400">
                Record textbook page progress for the next lesson.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Feedback for Student *</Label>
              <Textarea
                placeholder="What did you cover? What went well? What to improve?"
                rows={4}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Homework (optional)</Label>
              <Textarea
                placeholder="Assign homework for the student"
                rows={2}
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="border-amber-300 text-amber-900 hover:bg-amber-50 sm:flex-1"
                disabled={submitting || markingAbsent}
                onClick={() => setShowAbsentConfirm(true)}
              >
                <UserX className="h-4 w-4" />
                Mark Student Absent
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 sm:flex-1"
                disabled={!feedback.trim() || !progressPages.trim() || submitting || markingAbsent}
                onClick={handleSubmit}
              >
                {submitting ? "Submitting…" : "Submit & Complete"}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              If the student did not attend, use Mark Student Absent — no feedback
              required. The lesson still counts toward your monthly payroll.
            </p>
          </CardContent>
        </Card>
      )}

      <Dialog open={showAbsentConfirm} onOpenChange={setShowAbsentConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark student as absent?</DialogTitle>
            <DialogDescription>
              {englishName} will be recorded as absent for this lesson. No feedback
              will be sent. The lesson will be marked complete and included in your
              payroll calculation.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowAbsentConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={markingAbsent}
              onClick={handleMarkStudentAbsent}
            >
              {markingAbsent ? "Processing…" : "Confirm Absent"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
