import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import {
  getSystemNotificationRulesFromCache,
  updateSystemNotificationRulesInDb,
} from "@/lib/admin/messages/repository";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    return NextResponse.json({ rules: getSystemNotificationRulesFromCache() });
  } catch (error) {
    console.error("[GET /api/admin/messages/notification-rules]", error);
    const message = error instanceof Error ? error.message : "rules_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const body = (await request.json()) as {
      rules?: { id: string; enabled: boolean }[];
    };
    if (!body.rules?.length) {
      return NextResponse.json({ error: "rules_required" }, { status: 400 });
    }
    const rules = await updateSystemNotificationRulesInDb(body.rules);
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("[PATCH /api/admin/messages/notification-rules]", error);
    const message = error instanceof Error ? error.message : "rules_update_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
