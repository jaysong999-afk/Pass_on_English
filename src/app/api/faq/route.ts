import { NextResponse } from "next/server";
import { getPublishedFaqItems } from "@/lib/faq-store";

export async function GET() {
  return NextResponse.json({ items: getPublishedFaqItems() });
}
