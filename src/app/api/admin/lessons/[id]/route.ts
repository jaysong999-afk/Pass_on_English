import { NextResponse } from "next/server";
import {
  assignSubstituteTeacher,
  markTeacherNoShow,
  cancelLessonUnpaid,
  adminRescheduleLesson,
  findAvailableTeachersAt,
} from "@/lib/admin/lesson-operations-store";
import { getLessonById } from "@/lib/teacher-lesson-store";

type OperationBody =
  | { action: "assign_substitute"; substituteTeacherId: string; note?: string }
  | { action: "teacher_no_show"; makeupScheduledAt?: string; note?: string }
  | { action: "cancel_unpaid"; note?: string }
  | { action: "reschedule"; scheduledAt: string; teacherId?: string }
  | { action: "available_teachers" };

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const lesson = getLessonById(id);
  if (!lesson) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const teachers = findAvailableTeachersAt(
    lesson.scheduledAt,
    lesson.teacherId,
    lesson.id
  );
  return NextResponse.json({ lesson, availableTeachers: teachers });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: OperationBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "assign_substitute": {
        const lesson = assignSubstituteTeacher(id, body.substituteTeacherId, body.note);
        return NextResponse.json({ lesson });
      }
      case "teacher_no_show": {
        const result = markTeacherNoShow(id, {
          makeupScheduledAt: body.makeupScheduledAt,
          note: body.note,
        });
        return NextResponse.json(result);
      }
      case "cancel_unpaid": {
        const result = cancelLessonUnpaid(id, body.note);
        return NextResponse.json(result);
      }
      case "reschedule": {
        const lesson = adminRescheduleLesson(id, body.scheduledAt, body.teacherId);
        return NextResponse.json({ lesson });
      }
      default:
        return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "operation_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
