import { NextResponse } from "next/server";
import {
  listNotificationsForUserInDb,
  markNotificationsReadInDb,
} from "@/lib/notifications/repository";
import {
  resolveNotificationUserId,
  type NotificationPortalRole,
} from "@/lib/notifications/resolve-user-id";

function parseRole(value: string | null): NotificationPortalRole {
  return value === "teacher" ? "teacher" : "student";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get("role"));

  const userId = await resolveNotificationUserId(role);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const notifications = await listNotificationsForUserInDb(userId);
    const unread = notifications.filter((n) => !n.readAt).length;
    return NextResponse.json({ notifications, unread });
  } catch (error) {
    console.error("[GET /api/notifications]", error);
    const message = error instanceof Error ? error.message : "notifications_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get("role"));

  const userId = await resolveNotificationUserId(role);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { ids?: string[]; all?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const updated = await markNotificationsReadInDb(userId, {
      ids: body.ids,
      all: body.all,
    });
    return NextResponse.json({ success: true, updated });
  } catch (error) {
    console.error("[PATCH /api/notifications]", error);
    const message = error instanceof Error ? error.message : "notifications_mark_read_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
