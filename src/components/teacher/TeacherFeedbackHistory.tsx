"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, ClipboardList, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { students } from "@/lib/mock-data";
import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { formatDate, formatTime } from "@/lib/utils";
import type { LessonFeedback } from "@/types";

const TEACHER_NAME = "Sarah Mitchell";

function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function TeacherFeedbackHistory() {
  const [feedbacks, setFeedbacks] = useState<LessonFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [studentTab, setStudentTab] = useState("all");
  const [exportMonth, setExportMonth] = useState(currentMonthKey());
  const [exporting, setExporting] = useState(false);
  const [viewing, setViewing] = useState<LessonFeedback | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/teacher/feedback?teacherId=${CURRENT_TEACHER_ID}`
      );
      const data = await res.json();
      setFeedbacks(data.feedbacks ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const myStudents = useMemo(() => {
    const byTeacher = students.filter((s) => s.teacherName === TEACHER_NAME);
    const fromFeedbacks = feedbacks
      .map((f) => students.find((s) => s.id === f.studentId))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    const map = new Map<string, (typeof students)[number]>();
    for (const s of [...byTeacher, ...fromFeedbacks]) map.set(s.id, s);
    return Array.from(map.values());
  }, [feedbacks]);

  const filteredFeedbacks = useMemo(() => {
    const list =
      studentTab === "all"
        ? feedbacks
        : feedbacks.filter((f) => f.studentId === studentTab);
    return list.sort(
      (a, b) => new Date(b.lessonDate).getTime() - new Date(a.lessonDate).getTime()
    );
  }, [feedbacks, studentTab]);

  const handleDownloadCsv = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        teacherId: CURRENT_TEACHER_ID,
        format: "csv",
        month: exportMonth,
      });
      if (studentTab !== "all") {
        params.set("studentId", studentTab);
      }
      const res = await fetch(`/api/teacher/feedback?${params.toString()}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="(.+)"/);
      const filename = match?.[1] ?? `lesson-feedback-${exportMonth}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const selectedStudentLabel =
    studentTab === "all"
      ? "all students"
      : getStudentDisplayName(
          myStudents.find((s) => s.id === studentTab) ?? {
            fullName: studentTab,
          }
        );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <ClipboardList className="h-7 w-7 text-emerald-600" />
          Lesson Feedback
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Review feedback you have sent to students. Filter by student or download
          a monthly CSV export.
        </p>
      </div>

      <Card className="border-emerald-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Download CSV</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="export-month">Month</Label>
            <Input
              id="export-month"
              type="month"
              className="h-11 rounded-xl"
              value={exportMonth}
              onChange={(e) => setExportMonth(e.target.value)}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-11 gap-2 rounded-xl sm:shrink-0"
            disabled={exporting}
            onClick={handleDownloadCsv}
          >
            <Download className="h-4 w-4" />
            {exporting ? "Downloading…" : "Download CSV"}
          </Button>
        </CardContent>
        <p className="px-6 pb-4 text-xs text-gray-400">
          Exports feedback for {selectedStudentLabel} in the selected month.
        </p>
      </Card>

      <Tabs value={studentTab} onValueChange={setStudentTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-gray-100 p-1">
          <TabsTrigger value="all" className="rounded-lg px-3 py-2 text-sm">
            All
          </TabsTrigger>
          {myStudents.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="rounded-lg px-3 py-2 text-sm">
              {getStudentDisplayName(s)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {studentTab === "all" ? "All Feedback" : "Student Feedback"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : filteredFeedbacks.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No feedback submitted yet for this student.
            </p>
          ) : (
            filteredFeedbacks.map((item) => (
              <div key={item.id} className="rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">{item.studentName}</p>
                    <p className="text-sm text-gray-500">
                      {formatDate(item.lessonDate, "en")}{" "}
                      {formatTime(item.lessonDate, "en", TEACHER_TIMEZONE)}
                    </p>
                    {item.topic && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        {item.topic}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1"
                    onClick={() => setViewing(item)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                </div>
                {item.progressPages && (
                  <p className="mt-2 text-xs text-gray-500">
                    Progress: {item.progressPages}
                  </p>
                )}
                <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                  {item.feedback}
                </p>
                {item.homework && (
                  <p className="mt-2 flex items-center gap-1 text-xs font-medium text-emerald-700">
                    <BookOpen className="h-3.5 w-3.5" />
                    Homework assigned
                  </p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">Feedback Detail</DialogTitle>
                <p className="text-sm text-gray-500">
                  {viewing.studentName} · {formatDate(viewing.lessonDate, "en")}{" "}
                  {formatTime(viewing.lessonDate, "en", TEACHER_TIMEZONE)}
                </p>
              </DialogHeader>
              <div className="space-y-4">
                {viewing.topic && (
                  <p className="text-sm font-medium text-emerald-700">{viewing.topic}</p>
                )}
                {viewing.progressPages && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-400">
                      Progress (pages)
                    </p>
                    <p className="mt-1 text-sm">{viewing.progressPages}</p>
                  </div>
                )}
                <div className="rounded-xl bg-emerald-50/60 p-4">
                  <p className="text-sm font-semibold text-emerald-900">Feedback</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    {viewing.feedback}
                  </p>
                </div>
                {viewing.homework && (
                  <div className="rounded-xl border border-emerald-100 p-4">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                      <BookOpen className="h-4 w-4" />
                      Homework
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                      {viewing.homework}
                    </p>
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  Submitted {formatDate(viewing.createdAt, "en")}{" "}
                  {formatTime(viewing.createdAt, "en", TEACHER_TIMEZONE)}
                </p>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
