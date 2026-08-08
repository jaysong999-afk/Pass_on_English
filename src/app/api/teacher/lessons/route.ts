import { NextResponse } from "next/server";
import { CURRENT_TEACHER_ID } from "@/lib/availability/constants";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import { buildLessonDisplayContext } from "@/lib/teacher-lesson-context";
import {
  getActionRequiredLessons,
  getNextLesson,
  getStudentLessons,
  getTeacherLessons,
  getTodayLessons,
} from "@/lib/teacher-lesson-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId") ?? CURRENT_TEACHER_ID;
  const timeZone = searchParams.get("timeZone") ?? TEACHER_TIMEZONE;
  const scope = searchParams.get("scope");

  if (scope === "all") {
    return NextResponse.json({ lessons: getTeacherLessons(teacherId) });
  }

  const studentId = searchParams.get("studentId");
  if (scope === "student" && studentId) {
    return NextResponse.json({ lessons: getStudentLessons(studentId) });
  }

  const next = getNextLesson(teacherId);
  const todayLessons = getTodayLessons(teacherId, timeZone);
  const actionRequired = getActionRequiredLessons(teacherId);

  const mapWithContext = (lesson: NonNullable<ReturnType<typeof getNextLesson>>) => {
    const display = buildLessonDisplayContext(lesson);
    return { lesson, display };
  };

  return NextResponse.json({
    nextLesson: next ? mapWithContext(next) : null,
    todayLessons: todayLessons.map(mapWithContext),
    actionRequired: actionRequired.map(mapWithContext),
  });
}
