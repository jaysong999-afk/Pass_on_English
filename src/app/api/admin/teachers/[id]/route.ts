import { NextResponse } from "next/server";
import type { Teacher } from "@/types";
import { getAdminTeacherDetail } from "@/lib/admin/teacher-detail-store";
import { updateTeacherStatus } from "@/lib/teacher-profile-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const updated = updateTeacherStatus(id, body.status);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ teacher: updated });
}
