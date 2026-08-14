import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import {
  getPushCampaignsFromCache,
  getPushCampaignTotalsFromCache,
} from "@/lib/admin/messages/repository";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    return NextResponse.json({
      campaigns: getPushCampaignsFromCache(),
      totals: getPushCampaignTotalsFromCache(),
    });
  } catch (error) {
    console.error("[GET /api/admin/messages/campaigns]", error);
    const message = error instanceof Error ? error.message : "campaigns_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
