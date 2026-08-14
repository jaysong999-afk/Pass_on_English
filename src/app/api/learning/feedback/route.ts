import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { assertLearnerAccess } from "@/lib/auth/session";
import {
  addLessonFeedbackInDb,
  markFeedbackReadInDb,
  warmLearningCache,
} from "@/lib/learning/repository";
import { getFeedbacksByStudent } from "@/lib/learning-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

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

    const body = await request.json();
    const feedback = await addLessonFeedbackInDb(body);
    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
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
