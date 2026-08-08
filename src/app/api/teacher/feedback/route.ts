import { NextResponse } from "next/server";
import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import {
  getFeedbacksByTeacher,
  getFeedbacksByTeacherMonth,
} from "@/lib/learning-store";
import { buildFeedbackCsvRows, feedbackCsvFilename } from "@/lib/feedback-csv";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId") ?? CURRENT_TEACHER_ID;
  const studentId = searchParams.get("studentId");
  const month = searchParams.get("month");
  const format = searchParams.get("format");

  if (format === "csv") {
    if (!month) {
      return NextResponse.json({ error: "month required (YYYY-MM)" }, { status: 400 });
    }
    const rows = getFeedbacksByTeacherMonth(
      teacherId,
      month,
      studentId ?? undefined
    );
    const csv = "\uFEFF" + buildFeedbackCsvRows(rows);
    const filename = feedbackCsvFilename(month, studentId ?? undefined);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  let feedbacks = getFeedbacksByTeacher(teacherId);
  if (studentId && studentId !== "all") {
    feedbacks = feedbacks.filter((f) => f.studentId === studentId);
  }
  if (month) {
    feedbacks = feedbacks.filter((f) => f.lessonDate.slice(0, 7) === month);
  }

  return NextResponse.json({ feedbacks });
}
