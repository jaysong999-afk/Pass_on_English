import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  getUpcomingLessonsForAdmin,
  findAvailableTeachersAt,
} from "@/lib/admin/lesson-operations-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId") ?? undefined;
  const studentId = searchParams.get("studentId") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const scheduledAt = searchParams.get("scheduledAt");
  const excludeTeacherId = searchParams.get("excludeTeacherId") ?? undefined;
  const ignoreLessonId = searchParams.get("ignoreLessonId") ?? undefined;

  if (scheduledAt) {
    return NextResponse.json({
      teachers: findAvailableTeachersAt(scheduledAt, excludeTeacherId, ignoreLessonId),
    });
  }

  const lessons = getUpcomingLessonsForAdmin({ teacherId, studentId, from, to });
  return NextResponse.json({ lessons });
}
