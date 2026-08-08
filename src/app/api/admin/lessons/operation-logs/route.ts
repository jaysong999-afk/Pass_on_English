import { NextResponse } from "next/server";
import { getAdminLessonOperationLogs } from "@/lib/admin/admin-lesson-operation-log-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId");
  const weekStart = searchParams.get("weekStart");

  if (!teacherId || !weekStart) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  const logs = getAdminLessonOperationLogs(teacherId, weekStart);
  return NextResponse.json({ logs });
}
