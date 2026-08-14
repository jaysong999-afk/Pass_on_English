import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { resolveBroadcastRecipientProfileIds } from "@/lib/admin/messages/repository";
import type {
  BroadcastAudience,
  BroadcastEnrollmentFilter,
} from "@/lib/admin/messages/types";

function parseAudience(value: string | null): BroadcastAudience {
  const allowed: BroadcastAudience[] = [
    "all",
    "students_all",
    "students_kr",
    "students_cn",
    "teachers",
  ];
  if (value && allowed.includes(value as BroadcastAudience)) {
    return value as BroadcastAudience;
  }
  return "students_all";
}

function parseFilters(values: string[]): BroadcastEnrollmentFilter[] {
  const allowed: BroadcastEnrollmentFilter[] = [
    "active",
    "expiring_soon",
    "pending_payment",
    "pending_registration",
    "completed",
  ];
  return values.filter((v): v is BroadcastEnrollmentFilter =>
    allowed.includes(v as BroadcastEnrollmentFilter)
  );
}

export async function GET(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const { searchParams } = new URL(request.url);
    const audience = parseAudience(searchParams.get("audience"));
    const filters = parseFilters(searchParams.getAll("filter"));
    const profileIds = await resolveBroadcastRecipientProfileIds({ audience, filters });
    return NextResponse.json({ count: profileIds.length });
  } catch (error) {
    console.error("[GET /api/admin/messages/broadcast/preview]", error);
    const message = error instanceof Error ? error.message : "broadcast_preview_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
