import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { getAdminLessonOperationLogs } from "@/lib/admin/admin-lesson-operation-log-store";
import { getAdminLessonOperationLogsInDb } from "@/lib/admin/admin-lesson-operation-log-repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId");
  const weekStart = searchParams.get("weekStart");

  if (!teacherId || !weekStart) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  await getAdminLessonOperationLogsInDb(teacherId, weekStart);
  const logs = getAdminLessonOperationLogs(teacherId, weekStart);
  return NextResponse.json({ logs });
}
