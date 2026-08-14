import { NextResponse } from "next/server";
import { getPublishedFaqItems } from "@/lib/faq-store";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET() {
  await ensurePublicContentBootstrapped();
  return NextResponse.json({ items: getPublishedFaqItems() });
}
