import { NextResponse } from "next/server";
import { getTeacherById } from "@/lib/teacher-profile-store-sync";
import { updateTeacherProfileInDb } from "@/lib/teachers/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { requireRole } from "@/lib/auth/session";
import { isAuthError } from "@/lib/auth/errors";
import { parseAdminTeacherProfileDto } from "@/lib/teachers/profile-dto";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
    await ensureSchedulesBootstrapped();
    const { id } = await params;
    const teacher = getTeacherById(id);
    if (!teacher) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ teacher });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[teachers/profile/:id GET]", err);
    return NextResponse.json({ error: "profile_fetch_failed" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole("admin");
    const parsed = parseAdminTeacherProfileDto(await request.json());
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    await ensureSchedulesBootstrapped();
    const { id } = await params;
    const teacher = await updateTeacherProfileInDb(id, parsed.data);
    if (!teacher) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ teacher });
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.code }, { status: err.status });
    }
    console.error("[teachers/profile/:id PUT]", err);
    return NextResponse.json({ error: "profile_save_failed" }, { status: 500 });
  }
}
