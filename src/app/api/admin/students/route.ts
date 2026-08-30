import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureAdminStudentsBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getAdminStudentListItems } from "@/lib/admin/student-overview-store";

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureAdminStudentsBootstrapped();

    const { searchParams } = new URL(request.url);
    const requestedTab = searchParams.get("tab");
    if (!requestedTab) {
      return NextResponse.json({
        activeStudents: getAdminStudentListItems("active"),
        pastStudents: getAdminStudentListItems("past"),
      });
    }
    const tab = requestedTab === "past" ? "past" : "active";

    return NextResponse.json({
      students: getAdminStudentListItems(tab),
    });
  } catch (error) {
    console.error("[GET /api/admin/students]", error);
    const message = error instanceof Error ? error.message : "students_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
