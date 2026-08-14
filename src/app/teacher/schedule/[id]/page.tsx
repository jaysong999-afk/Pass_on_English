"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { LessonStatusBadge } from "@/components/shared/LessonStatusBadge";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import { formatDate, formatTime } from "@/lib/utils";
import type { Lesson } from "@/types";

export default function TeacherLessonDetailPage() {
  const params = useParams();
  const lessonId = params.id as string;
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [homework, setHomework] = useState("");
  const [topic, setTopic] = useState("");
  const [progressPages, setProgressPages] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadLesson = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/teacher/lessons/${lessonId}`);
      if (!res.ok) {
        setLesson(null);
        return;
      }
      const data = await res.json();
      setLesson(data.lesson ?? null);
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    void loadLesson();
  }, [loadLesson]);

  if (loading) {
    return <p className="text-gray-500">Loading lesson...</p>;
  }

  if (!lesson) {
    return <p className="text-gray-500">Lesson not found.</p>;
  }

  const handleSubmitFeedback = async () => {
    if (!feedback.trim() || !lesson.studentId) return;
    setSubmitting(true);
    try {
      await fetch("/api/learning/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: lesson.id,
          studentId: lesson.studentId,
          studentName: lesson.studentName,
          teacherId: lesson.teacherId,
          teacherName: lesson.teacherName,
          lessonDate: lesson.scheduledAt,
          topic: topic || undefined,
          feedback: feedback.trim(),
          homework: homework.trim() || undefined,
          progressPages: progressPages.trim() || undefined,
        }),
      });
      setSubmitted(true);
      setShowFeedback(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lesson Details</CardTitle>
            <LessonStatusBadge status={lesson.status} locale="en" />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm text-gray-500">Student</p>
            <p className="font-semibold">{lesson.studentName}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Date & Time</p>
            <p className="font-semibold">
              {formatDate(lesson.scheduledAt, "en")}{" "}
              {formatTime(lesson.scheduledAt, "en", TEACHER_TIMEZONE)}
            </p>
          </div>
        </CardContent>
      </Card>

      {submitted && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Feedback sent! The student can view it in 학습결과.
        </div>
      )}

      {(lesson.status === "scheduled" || lesson.status === "completed") && !submitted && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
                Lesson Feedback
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!showFeedback ? (
                <Button onClick={() => setShowFeedback(true)} className="bg-emerald-600 hover:bg-emerald-700">
                  Write & Send Feedback
                </Button>
              ) : (
                <div className="space-y-4">
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
                    <Label>Feedback for Student *</Label>
                    <Textarea
                      placeholder="What did you cover? What went well? What to improve?"
                      rows={4}
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Progress (pages)</Label>
                    <Input
                      placeholder="e.g. p. 15–17"
                      value={progressPages}
                      onChange={(e) => setProgressPages(e.target.value)}
                      className="rounded-xl"
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
                  <div className="flex gap-2">
                    <Button
                      className="bg-emerald-600 hover:bg-emerald-700"
                      disabled={!feedback.trim() || submitting}
                      onClick={handleSubmitFeedback}
                    >
                      {submitting ? "Sending..." : "Send to Student"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowFeedback(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {lesson.status === "scheduled" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request Reschedule</CardTitle>
          </CardHeader>
          <CardContent>
            {!showReschedule ? (
              <Button variant="secondary" onClick={() => setShowReschedule(true)}>
                Request Change
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Proposed Date & Time</Label>
                  <Input type="datetime-local" />
                </div>
                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Textarea placeholder="Reason for change" />
                </div>
                <Button>Send Request</Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
