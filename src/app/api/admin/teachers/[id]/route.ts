import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import type { Teacher } from "@/types";
import { getAdminTeacherDetail } from "@/lib/admin/teacher-detail-store";
import { updateTeacherStatusInDb } from "@/lib/teachers/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const detail = getAdminTeacherDetail(id);
  if (!detail) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  const { id } = await params;
  let body: { status?: Teacher["status"] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!body.status) {
    return NextResponse.json({ error: "status_required" }, { status: 400 });
  }

  const allowed: Teacher["status"][] = ["active", "on_leave", "terminated", "pending"];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  const updated = await updateTeacherStatusInDb(id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ teacher: updated });
}
