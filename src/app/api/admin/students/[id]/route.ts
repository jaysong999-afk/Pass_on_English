import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getAdminStudentDetail } from "@/lib/admin/student-detail-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const detail = getAdminStudentDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
