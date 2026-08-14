import { NextResponse } from "next/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import { sendPushToUsersInDb } from "@/lib/push/send-service";
import { isPushConfigured } from "@/lib/push/vapid";
import { verifyCronSecret } from "@/lib/cron/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authError = verifyCronSecret(request);
  if (authError) return authError;

  let body: {
    userIds?: string[];
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
    data?: Record<string, unknown>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const userIds = (body.userIds ?? []).filter(Boolean);
  const title = body.title?.trim();
  const messageBody = body.body?.trim();

  if (!userIds.length || !title || !messageBody) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: "vapid_not_configured", configured: false },
      { status: 503 }
    );
  }

  try {
    const supabase = createPrivilegedClient();
    const result = await sendPushToUsersInDb(supabase, userIds, {
      title,
      body: messageBody,
      url: body.url,
      tag: body.tag,
      data: body.data,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[POST /api/push/send]", error);
    const message = error instanceof Error ? error.message : "push_send_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
