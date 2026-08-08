import { NextResponse } from "next/server";

export async function POST() {
  // TODO: VAPID web-push send via service role
  return NextResponse.json({ success: true, message: "Push send stub" });
}
