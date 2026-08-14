import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import {
  getAdminTeacherListItems,
  getAdminTeacherSummaryCounts,
} from "@/lib/admin/teacher-overview-store";
import { getPendingTeacherApplications } from "@/lib/admin/teacher-detail-store";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  return NextResponse.json({
    summary: getAdminTeacherSummaryCounts(),
    teachers: getAdminTeacherListItems(),
    pendingApplications: getPendingTeacherApplications(),
  });
}
