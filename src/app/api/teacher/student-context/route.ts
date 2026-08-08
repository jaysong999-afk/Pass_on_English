import { NextResponse } from "next/server";
import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import {
  getTeacherStudentContext,
  updateTeacherStudentContext,
} from "@/lib/teacher-student-context-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");
  const teacherId = searchParams.get("teacherId") ?? CURRENT_TEACHER_ID;

  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  return NextResponse.json({
    context: getTeacherStudentContext(studentId, teacherId),
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const studentId = body.studentId as string;
    const teacherId = (body.teacherId as string) ?? CURRENT_TEACHER_ID;

    if (!studentId) {
      return NextResponse.json({ error: "studentId required" }, { status: 400 });
    }

    const context = updateTeacherStudentContext(studentId, teacherId, {
      textbook: body.textbook,
      videoPlatform: body.videoPlatform,
      specialNotes: body.specialNotes,
    });

    return NextResponse.json({ context });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
}
