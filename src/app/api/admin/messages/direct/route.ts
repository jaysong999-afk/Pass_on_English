import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import {
  ensureAdminDirectThreadInDb,
  getAdminDirectInboxSummaryFromCache,
} from "@/lib/admin/messages/repository";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const { threads, totalUnread } = getAdminDirectInboxSummaryFromCache();
    return NextResponse.json({ threads, totalUnread });
  } catch (error) {
    console.error("[GET /api/admin/messages/direct]", error);
    const message = error instanceof Error ? error.message : "direct_threads_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const body = (await request.json()) as {
      targetType?: "student" | "teacher";
      targetId?: string;
    };
    if (!body.targetType || !body.targetId) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const thread = await ensureAdminDirectThreadInDb({
      targetType: body.targetType,
      targetId: body.targetId,
    });
    return NextResponse.json({ thread });
  } catch (error) {
    console.error("[POST /api/admin/messages/direct]", error);
    const message = error instanceof Error ? error.message : "direct_thread_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
