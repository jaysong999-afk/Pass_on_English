import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { requireTeacherAuth } from "@/lib/auth/session";
import {
  getFeedbacksByTeacher,
  getFeedbacksByTeacherMonth,
} from "@/lib/learning-store";
import { warmLearningCache } from "@/lib/learning/repository";
import { buildFeedbackCsvRows, feedbackCsvFilename } from "@/lib/feedback-csv";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();

  let teacherId: string;
  try {
    ({ teacherId } = await requireTeacherAuth());
  } catch (error) {
    return authErrorResponse(error);
  }

  try {
    await warmLearningCache();
  } catch (error) {
    console.error("[teacher/feedback GET] warm cache", error);
  }

  const { searchParams } = new URL(request.url);
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
