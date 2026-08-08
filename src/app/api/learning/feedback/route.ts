import { NextResponse } from "next/server";
import {
  addLessonFeedback,
  getFeedbacksByStudent,
  markFeedbackRead,
} from "@/lib/learning-store";
import { completeLesson } from "@/lib/teacher-lesson-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }
  return NextResponse.json({ feedbacks: getFeedbacksByStudent(studentId) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const feedback = addLessonFeedback(body);
    if (body.lessonId) {
      completeLesson(body.lessonId as string);
    }
    return NextResponse.json({ feedback }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action");
  if (id && action === "read") {
    markFeedbackRead(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
