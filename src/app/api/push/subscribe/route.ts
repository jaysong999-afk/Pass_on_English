import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { createRequestDbClient } from "@/lib/supabase/db-client";
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

  const endpoint = typeof body?.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body?.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const auth = typeof body?.keys?.auth === "string" ? body.keys.auth.trim() : "";
  const role = body?.role ?? parseRole(new URL(request.url).searchParams.get("role"));

  if (!endpoint.startsWith("https://") || !p256dh || !auth || endpoint.length > 4096) {
    return NextResponse.json({ error: "missing_subscription_fields" }, { status: 400 });
  }

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

export async function DELETE(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  const db = await createRequestDbClient();
  const { error } = await db.from("push_subscriptions").delete().eq("user_id", auth.userId).eq("endpoint", body.endpoint);
  return error ? NextResponse.json({ error: "unsubscribe_failed" }, { status: 500 }) : NextResponse.json({ success: true });
}
