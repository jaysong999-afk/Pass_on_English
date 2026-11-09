import { NextResponse } from "next/server";
import { getPublishedFaqItems } from "@/lib/faq-store-sync";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { isFreeTrialProgramEnabled } from "@/lib/free-trial-policy";
import { applyFreeTrialAvailabilityToFaq } from "@/lib/faq/free-trial-availability";

export async function GET() {
  await ensurePublicContentBootstrapped();
  const items = applyFreeTrialAvailabilityToFaq(
    getPublishedFaqItems(),
    isFreeTrialProgramEnabled()
  );
  return NextResponse.json({ items });
}
