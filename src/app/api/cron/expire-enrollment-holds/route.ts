import { NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/cron/auth";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { ensureRenewalOffersInDb, expireEnrollmentHoldsInDb } from "@/lib/enrollments/repository";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  try {
    await ensureSchedulesBootstrapped();
    const opened = await ensureRenewalOffersInDb();
    const expired = await expireEnrollmentHoldsInDb();
    return NextResponse.json({ success: true, opened, expired });
  } catch (error) {
    console.error("[GET /api/cron/expire-enrollment-holds]", error);
    const message = error instanceof Error ? error.message : "expire_holds_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  return GET(request);
}
