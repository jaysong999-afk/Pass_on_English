import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  // TODO: persist to push_subscriptions table via Supabase
  return NextResponse.json({
    success: true,
    message: "Push subscription registered (stub)",
    endpoint: body.endpoint,
  });
}
