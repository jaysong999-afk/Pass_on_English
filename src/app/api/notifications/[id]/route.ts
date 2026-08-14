import { NextResponse } from "next/server";
import { getNotificationByIdInDb } from "@/lib/notifications/repository";
import {
  resolveNotificationUserId,
  type NotificationPortalRole,
} from "@/lib/notifications/resolve-user-id";

function parseRole(value: string | null): NotificationPortalRole {
  return value === "teacher" ? "teacher" : "student";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get("role"));

  const userId = await resolveNotificationUserId(role);
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "missing_id" }, { status: 400 });
  }

  try {
    const notification = await getNotificationByIdInDb(userId, id);
    if (!notification) {
      return NextResponse.json({ error: "notification_not_found" }, { status: 404 });
    }
    return NextResponse.json({ notification });
  } catch (error) {
    console.error("[GET /api/notifications/[id]]", error);
    const message = error instanceof Error ? error.message : "notification_fetch_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
