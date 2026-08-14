import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { getDashboardSlogan } from "@/lib/admin/dashboard-settings-store";
import {
  getDashboardSloganInDb,
  setDashboardSloganInDb,
} from "@/lib/admin/dashboard-settings/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  await getDashboardSloganInDb();
  return NextResponse.json({ slogan: getDashboardSlogan() });
}

export async function PATCH(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  try {
    const body = await request.json();
    const slogan = await setDashboardSloganInDb(String(body.slogan ?? ""));
    return NextResponse.json({ slogan });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
