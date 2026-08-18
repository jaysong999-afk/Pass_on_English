import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { assertLearnerAccess, requireTeacherAuth } from "@/lib/auth/session";
import {
  addLessonFeedbackInDb,
  markFeedbackReadInDb,
  warmLearningCache,
} from "@/lib/learning/repository";
import { getFeedbacksByStudent } from "@/lib/learning-store-sync";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getLessonById } from "@/lib/teacher-lesson-store-sync";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  try {
    await warmLearningCache();
  } catch (error) {
    console.error("[learning/feedback GET] warm cache", error);
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  try {
    await assertLearnerAccess(studentId);
    return NextResponse.json({ feedbacks: getFeedbacksByStudent(studentId) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchedulesBootstrapped();
    const { teacherId } = await requireTeacherAuth();
    const body = await request.json();
    const lesson = getLessonById(String(body.lessonId ?? ""));
    if (!lesson) return NextResponse.json({ error: "lesson_not_found" }, { status: 404 });
    if (lesson.teacherId !== teacherId) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const feedback = await addLessonFeedbackInDb({
      ...body,
      teacherId,
      teacherName: lesson.teacherName,
      studentId: lesson.studentId,
      studentName: lesson.studentName,
    });
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse.status === 401 || authResponse.status === 403) return authResponse;
    console.error("[learning/feedback POST]", error);
    const message = error instanceof Error ? error.message : "Invalid body";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action");
  if (id && action === "read") {
    try {
      await markFeedbackReadInDb(id);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[learning/feedback PATCH]", error);
      return NextResponse.json({ error: "read_failed" }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
