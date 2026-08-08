import type { LessonFeedback } from "@/types";
import { formatDate, formatTime } from "@/lib/utils";

function escapeCsvCell(value: string): string {
  const safe = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildFeedbackCsvRows(feedbacks: LessonFeedback[]): string {
  const header = [
    "Lesson Date",
    "Lesson Time",
    "Student",
    "Topic",
    "Progress (Pages)",
    "Feedback",
    "Homework",
    "Submitted At",
  ];

  const rows = feedbacks.map((f) => [
    formatDate(f.lessonDate, "en"),
    formatTime(f.lessonDate, "en"),
    f.studentName,
    f.topic ?? "",
    f.progressPages ?? "",
    f.feedback,
    f.homework ?? "",
    formatDate(f.createdAt, "en") + " " + formatTime(f.createdAt, "en"),
  ]);

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function feedbackCsvFilename(month: string, studentId?: string): string {
  const suffix =
    studentId && studentId !== "all" ? `-${studentId}` : "-all-students";
  return `lesson-feedback-${month}${suffix}.csv`;
}
