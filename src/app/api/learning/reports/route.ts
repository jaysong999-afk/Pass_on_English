import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { assertLearnerAccess, requireTeacherAuth } from "@/lib/auth/session";
import {
  addMonthlyReportInDb,
  markReportReadInDb,
  warmLearningCache,
} from "@/lib/learning/repository";
import { getReportsByStudent, getReportsByTeacher } from "@/lib/learning-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  try {
    await warmLearningCache();
  } catch (error) {
    console.error("[learning/reports GET] warm cache", error);
  }

  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const teacherIdParam = searchParams.get("teacherId");

  if (studentId) {
    try {
      await assertLearnerAccess(studentId);
      return NextResponse.json({ reports: getReportsByStudent(studentId) });
    } catch (error) {
      return authErrorResponse(error);
    }
  }

  if (teacherIdParam) {
    try {
      const { teacherId } = await requireTeacherAuth();
      return NextResponse.json({ reports: getReportsByTeacher(teacherId) });
    } catch (error) {
      return authErrorResponse(error);
    }
  }

  return NextResponse.json({ error: "studentId or teacherId required" }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    await ensureSchedulesBootstrapped();

    const body = await request.json();
    const report = await addMonthlyReportInDb(body);
    return NextResponse.json({ report }, { status: 201 });
  } catch (error) {
    console.error("[learning/reports POST]", error);
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
      await markReportReadInDb(id);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("[learning/reports PATCH]", error);
      return NextResponse.json({ error: "read_failed" }, { status: 400 });
    }
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
