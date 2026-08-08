import { NextResponse } from "next/server";
import { buildLessonDisplayContext } from "@/lib/teacher-lesson-context";
import {
  completeLessonAsStudentAbsent,
  getLessonById,
  lessonNeedsFeedback,
} from "@/lib/teacher-lesson-store";
import { getFeedbackByLesson } from "@/lib/learning-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lesson = getLessonById(id);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const display = buildLessonDisplayContext(lesson);
  const feedback = getFeedbackByLesson(id);

  return NextResponse.json({
    lesson,
    display,
    needsFeedback: lessonNeedsFeedback(lesson),
    feedback: feedback ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lesson = getLessonById(id);
  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  let body: { action?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.action === "mark_student_absent") {
    if (lesson.status === "completed") {
      return NextResponse.json({ error: "Lesson already completed" }, { status: 409 });
    }
    if (lesson.status === "cancelled") {
      return NextResponse.json({ error: "Cancelled lesson cannot be marked absent" }, { status: 400 });
    }
    const updated = completeLessonAsStudentAbsent(id);
    if (!updated) {
      return NextResponse.json({ error: "Unable to mark absent" }, { status: 400 });
    }
    return NextResponse.json({ lesson: updated });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
