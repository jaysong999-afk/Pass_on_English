import { NextResponse } from "next/server";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { buildLessonDisplayContext } from "@/lib/teacher-lesson-context";
import {
  completeLessonAsStudentAbsentInDb,
  getLessonByIdInDb,
  lessonNeedsFeedback,
} from "@/lib/lessons/repository";
import { getFeedbackByLesson } from "@/lib/learning-store-sync";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const lesson = await getLessonByIdInDb(id);
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
  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const lesson = await getLessonByIdInDb(id);
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
      if (lesson.studentAbsent) {
        return NextResponse.json({ lesson });
      }
      return NextResponse.json({ error: "Lesson already completed" }, { status: 409 });
    }
    if (lesson.status === "cancelled") {
      return NextResponse.json({ error: "Cancelled lesson cannot be marked absent" }, { status: 400 });
    }
    try {
      const updated = await completeLessonAsStudentAbsentInDb(id);
      if (!updated) {
        return NextResponse.json({ error: "Unable to mark absent" }, { status: 400 });
      }
      try {
        const { ensureRenewalOffersInDb } = await import("@/lib/enrollments/repository");
        await ensureRenewalOffersInDb();
      } catch (error) {
        console.error("[teacher/lessons/:id PATCH] renewal offer", error);
      }
      return NextResponse.json({ lesson: updated });
    } catch (error) {
      console.error("[teacher/lessons/:id PATCH]", error);
      return NextResponse.json({ error: "mark_absent_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
