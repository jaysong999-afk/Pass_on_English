import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { updateStudentAnnouncementInDb } from "@/lib/announcements/repository";
import type { UpsertStudentAnnouncementInput } from "@/lib/announcements/types";
import { validateStudentAnnouncementInput } from "@/lib/announcements/validation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    const body = (await request.json()) as UpsertStudentAnnouncementInput;
    const validationError = validateStudentAnnouncementInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { id } = await params;
    const item = await updateStudentAnnouncementInDb(id, body);
    if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ item });
  } catch (error) {
    console.error("[PATCH /api/admin/student-announcements/[id]]", error);
    return NextResponse.json({ error: "announcement_update_failed" }, { status: 500 });
  }
}
