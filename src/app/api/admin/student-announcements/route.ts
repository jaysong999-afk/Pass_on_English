import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  createStudentAnnouncementInDb,
  listAdminStudentAnnouncementsInDb,
} from "@/lib/announcements/repository";
import type {
  StudentAnnouncementPriority,
  StudentAnnouncementStatus,
  UpsertStudentAnnouncementInput,
} from "@/lib/announcements/types";
import {
  STUDENT_ANNOUNCEMENT_PRIORITIES,
  STUDENT_ANNOUNCEMENT_STATUSES,
  validateStudentAnnouncementInput,
} from "@/lib/announcements/validation";

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(params.get("pageSize")) || 20));
  const statusParam = params.get("status") as StudentAnnouncementStatus | null;
  const priorityParam = params.get("priority") as StudentAnnouncementPriority | null;

  try {
    const result = await listAdminStudentAnnouncementsInDb({
      page,
      pageSize,
      status:
        statusParam && STUDENT_ANNOUNCEMENT_STATUSES.includes(statusParam)
          ? statusParam
          : undefined,
      priority:
        priorityParam && STUDENT_ANNOUNCEMENT_PRIORITIES.includes(priorityParam)
          ? priorityParam
          : undefined,
    });
    return NextResponse.json({ ...result, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[GET /api/admin/student-announcements]", error);
    return NextResponse.json({ error: "announcements_fetch_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    const body = (await request.json()) as UpsertStudentAnnouncementInput;
    const validationError = validateStudentAnnouncementInput(body);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    const item = await createStudentAnnouncementInDb(body);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/admin/student-announcements]", error);
    return NextResponse.json({ error: "announcement_create_failed" }, { status: 500 });
  }
}
