import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { listTeacherOptionsInDb } from "@/lib/teachers/repository";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    return NextResponse.json({ teachers: await listTeacherOptionsInDb() });
  } catch (error) {
    console.error("[GET /api/admin/teachers/options]", error);
    return NextResponse.json({ error: "teacher_options_fetch_failed" }, { status: 500 });
  }
}
