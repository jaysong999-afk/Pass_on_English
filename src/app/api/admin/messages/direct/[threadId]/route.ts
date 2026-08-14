import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import {
  getAdminDirectMessagesFromCache,
  markAdminDirectThreadReadInDb,
  reloadAdminDirectMessagesInDb,
  sendAdminDirectMessageInDb,
} from "@/lib/admin/messages/repository";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const { threadId } = await params;
    let messages = getAdminDirectMessagesFromCache(threadId);
    if (messages.length === 0) {
      messages = await reloadAdminDirectMessagesInDb(threadId);
    }
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[GET /api/admin/messages/direct/[threadId]]", error);
    const message = error instanceof Error ? error.message : "direct_messages_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const { threadId } = await params;
    const body = (await request.json()) as { body?: string };
    if (!body.body?.trim()) {
      return NextResponse.json({ error: "body_required" }, { status: 400 });
    }
    const message = await sendAdminDirectMessageInDb({
      threadId,
      body: body.body,
    });
    return NextResponse.json({ message });
  } catch (error) {
    console.error("[POST /api/admin/messages/direct/[threadId]]", error);
    const message = error instanceof Error ? error.message : "direct_send_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  try {
    await ensureSchedulesBootstrapped();
    const { threadId } = await params;
    await markAdminDirectThreadReadInDb(threadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PATCH /api/admin/messages/direct/[threadId]]", error);
    const message = error instanceof Error ? error.message : "direct_read_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
