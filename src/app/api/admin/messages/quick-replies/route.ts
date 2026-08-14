import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { QUICK_REPLY_TEMPLATES } from "@/lib/admin/messages/constants";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  return NextResponse.json({ templates: QUICK_REPLY_TEMPLATES });
}
