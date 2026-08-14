import { NextResponse } from "next/server";
import { processDueScheduledBroadcastsInDb } from "@/lib/admin/messages/repository";
import { verifyCronSecret } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    const result = await processDueScheduledBroadcastsInDb();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[GET /api/cron/process-scheduled-broadcasts]", error);
    const message =
      error instanceof Error ? error.message : "scheduled_broadcast_cron_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
