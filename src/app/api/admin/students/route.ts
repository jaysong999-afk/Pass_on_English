import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getAdminStudentListItems } from "@/lib/admin/student-overview-store";

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();

    const { searchParams } = new URL(request.url);
    const tab = searchParams.get("tab") === "past" ? "past" : "active";

    return NextResponse.json({
      students: getAdminStudentListItems(tab),
    });
  } catch (error) {
    console.error("[GET /api/admin/students]", error);
    const message = error instanceof Error ? error.message : "students_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
