import { NextResponse } from "next/server";
import { TEACHER_TIMEZONE } from "@/lib/availability/timezone";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { assertLearnerAccess, requireTeacherAuth } from "@/lib/auth/session";
import { buildLessonDisplayContext } from "@/lib/teacher-lesson-context";
import {
  getActionRequiredLessons,
  getNextLesson,
  getTeacherLessons,
  getTodayLessons,
} from "@/lib/teacher-lesson-store";
import { resolveTeacherId } from "@/lib/teachers/resolve-teacher-id";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { ensureStudentEnrollmentLessonsInDb } from "@/lib/lessons/schedule-service";
import { listStudentLessonsInDb } from "@/lib/lessons/repository";
import type { Lesson } from "@/types";

function mapWithContext(lesson: Lesson) {
  const display = buildLessonDisplayContext(lesson);
  return { lesson, display };
}

function hubPayload(teacherId: string, timeZone: string) {
  const next = getNextLesson(teacherId);
  const todayLessons = getTodayLessons(teacherId, timeZone);
  const actionRequired = getActionRequiredLessons(teacherId);

  return {
    nextLesson: next ? mapWithContext(next) : null,
    todayLessons: todayLessons.map(mapWithContext),
    actionRequired: actionRequired.map(mapWithContext),
  };
}

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const timeZone = searchParams.get("timeZone") ?? TEACHER_TIMEZONE;
  const scope = searchParams.get("scope");

  if (scope === "all") {
    try {
      const { teacherId } = await requireTeacherAuth();
      return NextResponse.json({ lessons: getTeacherLessons(teacherId) });
    } catch (error) {
      return authErrorResponse(error);
    }
  }

  const studentId = searchParams.get("studentId");
  if (scope === "student" && studentId) {
    try {
      await assertLearnerAccess(studentId);
    } catch (error) {
      return authErrorResponse(error);
    }
    try {
      await ensureStudentEnrollmentLessonsInDb(studentId);
      const lessons = await listStudentLessonsInDb(studentId);
      return NextResponse.json({ lessons });
    } catch (error) {
      console.error("[GET teacher/lessons student]", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "lessons_fetch_failed" },
        { status: 500 }
      );
    }
  }

  try {
    const { teacherId: sessionTeacherId } = await requireTeacherAuth();
    const rawTeacherId = searchParams.get("teacherId");
    const resolvedId = rawTeacherId ? resolveTeacherId(rawTeacherId) : sessionTeacherId;
    const teacherId = resolvedId === sessionTeacherId ? resolvedId : sessionTeacherId;

    return NextResponse.json(hubPayload(teacherId, timeZone));
  } catch (error) {
    return authErrorResponse(error);
  }
}
