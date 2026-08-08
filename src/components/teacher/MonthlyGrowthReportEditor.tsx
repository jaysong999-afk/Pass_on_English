"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileText, Send, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { students } from "@/lib/mock-data";
import { getStudentDisplayName } from "@/lib/student-display-name";
import type { MonthlyGrowthReport } from "@/types";

const TEACHER_ID = "teacher-1";
const TEACHER_NAME = "Sarah Mitchell";

function formatMonthLabel(month: string) {
  const [y, m] = month.split("-");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(Number(y), Number(m) - 1, 1)
  );
}

const emptyForm = {
  studentId: "student-1",
  month: "2026-07",
  title: "July Growth Report",
  lessonsCovered: "",
  progressMade: "",
  areasToWorkOn: "",
  nextMonthGoals: "",
  overallComment: "",
};

export function MonthlyGrowthReportEditor() {
  const [reports, setReports] = useState<MonthlyGrowthReport[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [filterStudentId, setFilterStudentId] = useState<string>("all");
  const [viewingReport, setViewingReport] = useState<MonthlyGrowthReport | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/learning/reports?teacherId=${TEACHER_ID}`);
    const data = await res.json();
    setReports(data.reports ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const myStudents = useMemo(() => {
    const byTeacher = students.filter((s) => s.teacherName === TEACHER_NAME);
    const fromReports = reports
      .map((r) => students.find((s) => s.id === r.studentId))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
    const map = new Map<string, (typeof students)[number]>();
    for (const s of [...byTeacher, ...fromReports]) map.set(s.id, s);
    return Array.from(map.values());
  }, [reports]);

  const selectedStudent = myStudents.find((s) => s.id === form.studentId);

  const filteredReports = useMemo(() => {
    const list =
      filterStudentId === "all"
        ? reports
        : reports.filter((r) => r.studentId === filterStudentId);
    return list.sort((a, b) => {
      const studentCmp = a.studentName.localeCompare(b.studentName);
      if (studentCmp !== 0) return studentCmp;
      return b.month.localeCompare(a.month);
    });
  }, [reports, filterStudentId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/learning/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: form.studentId,
          studentName: getStudentDisplayName(selectedStudent),
          teacherId: TEACHER_ID,
          teacherName: TEACHER_NAME,
          month: form.month,
          title: form.title,
          lessonsCovered: form.lessonsCovered,
          progressMade: form.progressMade,
          areasToWorkOn: form.areasToWorkOn,
          nextMonthGoals: form.nextMonthGoals,
          overallComment: form.overallComment,
        }),
      });
      setSaved(true);
      setForm({ ...emptyForm, studentId: form.studentId, month: form.month });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const loadReportToForm = (report: MonthlyGrowthReport) => {
    setForm({
      studentId: report.studentId,
      month: report.month,
      title: report.title,
      lessonsCovered: report.lessonsCovered,
      progressMade: report.progressMade,
      areasToWorkOn: report.areasToWorkOn,
      nextMonthGoals: report.nextMonthGoals,
      overallComment: report.overallComment,
    });
    setSaved(false);
    setViewingReport(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <TrendingUp className="h-7 w-7 text-emerald-600" />
          Monthly Growth Report
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Write end-of-month reports — they are delivered to students in Learning Results.
        </p>
      </div>

      <Card className="border-emerald-100">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-emerald-600" />
            Write Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Student</Label>
                <select
                  className="flex h-11 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm"
                  value={form.studentId}
                  onChange={(e) => setForm({ ...form, studentId: e.target.value })}
                >
                  {myStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getStudentDisplayName(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Month</Label>
                <Input
                  type="month"
                  className="h-11 rounded-xl"
                  value={form.month}
                  onChange={(e) => setForm({ ...form, month: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Report Title</Label>
              <Input
                className="h-11 rounded-xl"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>

            <Field
              label="What We Covered This Month"
              value={form.lessonsCovered}
              onChange={(v) => setForm({ ...form, lessonsCovered: v })}
              rows={3}
              required
            />
            <Field
              label="Progress Made"
              value={form.progressMade}
              onChange={(v) => setForm({ ...form, progressMade: v })}
              rows={2}
              required
            />
            <Field
              label="Areas to Work On"
              value={form.areasToWorkOn}
              onChange={(v) => setForm({ ...form, areasToWorkOn: v })}
              rows={2}
              required
            />
            <Field
              label="Next Month's Goals"
              value={form.nextMonthGoals}
              onChange={(v) => setForm({ ...form, nextMonthGoals: v })}
              rows={2}
              required
            />
            <Field
              label="Teacher's Overall Comment"
              value={form.overallComment}
              onChange={(v) => setForm({ ...form, overallComment: v })}
              rows={3}
              required
            />

            {saved && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                Report published! The student can view it in Learning Results.
              </p>
            )}

            <Button
              type="submit"
              className="h-11 w-full gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700"
              disabled={saving}
            >
              <Send className="h-4 w-4" />
              {saving ? "Publishing..." : "Publish to Student"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">Published Reports</CardTitle>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Filter by student</Label>
              <select
                className="flex h-10 w-full rounded-xl border border-gray-300 bg-white px-3 text-sm sm:w-52"
                value={filterStudentId}
                onChange={(e) => setFilterStudentId(e.target.value)}
              >
                <option value="all">All students</option>
                {myStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {getStudentDisplayName(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 pb-4">
          {filteredReports.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No published reports for this student yet.
            </p>
          ) : (
            filteredReports.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{r.studentName}</p>
                  <p className="text-sm text-gray-500">
                    {formatMonthLabel(r.month)} · {r.title}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => setViewingReport(r)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    View
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => loadReportToForm(r)}
                  >
                    Edit
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewingReport} onOpenChange={(o) => !o && setViewingReport(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          {viewingReport && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{viewingReport.title}</DialogTitle>
                <p className="text-sm text-gray-500">
                  {viewingReport.studentName} · {formatMonthLabel(viewingReport.month)}
                </p>
              </DialogHeader>
              <div className="space-y-3">
                <ReportSection
                  title="What We Covered This Month"
                  content={viewingReport.lessonsCovered}
                />
                <ReportSection title="Progress Made" content={viewingReport.progressMade} />
                <ReportSection
                  title="Areas to Work On"
                  content={viewingReport.areasToWorkOn}
                />
                <ReportSection
                  title="Next Month's Goals"
                  content={viewingReport.nextMonthGoals}
                />
                <ReportSection
                  title="Teacher's Overall Comment"
                  content={viewingReport.overallComment}
                  highlight
                />
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => loadReportToForm(viewingReport)}
                >
                  Edit this report
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 3,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="rounded-xl"
      />
    </div>
  );
}

function ReportSection({
  title,
  content,
  highlight,
}: {
  title: string;
  content: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? "rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4"
          : "rounded-xl border bg-gray-50/80 p-4"
      }
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{content}</p>
    </div>
  );
}
