import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { getAdminDashboardStats } from "@/lib/admin/dashboard-stats-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  return NextResponse.json({ stats: getAdminDashboardStats() });
}
