import { NextResponse } from "next/server";
import { trackNotificationClickInDb } from "@/lib/notifications/repository";
import {
  resolveNotificationUserId,
  type NotificationPortalRole,
} from "@/lib/notifications/resolve-user-id";

function parseRole(value: string | null): NotificationPortalRole {
  return value === "teacher" ? "teacher" : "student";
}

export async function POST(
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
    const result = await trackNotificationClickInDb(id, userId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("[POST /api/notifications/[id]/click]", error);
    const message = error instanceof Error ? error.message : "notification_click_failed";
    const status = message === "notification_not_found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
