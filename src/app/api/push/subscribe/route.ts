import { NextResponse } from "next/server";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { upsertPushSubscriptionInDb } from "@/lib/push/repository";
import {
  resolveNotificationUserId,
  type NotificationPortalRole,
} from "@/lib/notifications/resolve-user-id";

function parseRole(value: string | null): NotificationPortalRole {
  return value === "teacher" ? "teacher" : "student";
}

export async function POST(request: Request) {
  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    role?: NotificationPortalRole;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const endpoint = body.endpoint?.trim();
  const p256dh = body.keys?.p256dh?.trim();
  const auth = body.keys?.auth?.trim();
  const role = body.role ?? parseRole(new URL(request.url).searchParams.get("role"));

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "missing_subscription_fields" }, { status: 400 });
  }

  await ensureSchedulesBootstrapped();
  const userId = await resolveNotificationUserId(role);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await upsertPushSubscriptionInDb(userId, {
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ success: true, endpoint });
  } catch (error) {
    console.error("[push/subscribe POST]", error);
    return NextResponse.json({ error: "subscribe_failed" }, { status: 500 });
  }
}
