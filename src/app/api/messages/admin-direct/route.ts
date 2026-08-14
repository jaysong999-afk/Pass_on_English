import { NextResponse } from "next/server";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { ensureAccountSession } from "@/lib/account-store";
import { requireTeacherAuth } from "@/lib/auth/session";
import {
  getAdminDirectInboxForProfileInDb,
  markAdminDirectThreadReadForRecipientInDb,
  sendAdminDirectReplyFromRecipientInDb,
} from "@/lib/admin/messages/repository";

async function resolveProfileId(
  role: "student" | "teacher"
): Promise<string | null> {
  if (role === "teacher") {
    try {
      const { userId } = await requireTeacherAuth();
      return userId;
    } catch {
      return null;
    }
  }

  const session = await ensureAccountSession();
  if (!session) return null;
  return session.account.id;
}

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();

  const { searchParams } = new URL(request.url);
  const role = searchParams.get("role");
  if (role !== "student" && role !== "teacher") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const profileId = await resolveProfileId(role);
  if (!profileId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const inbox = await getAdminDirectInboxForProfileInDb(profileId);
  return NextResponse.json(inbox);
}

export async function POST(request: Request) {
  await ensureSchedulesBootstrapped();

  const body = (await request.json()) as {
    role?: "student" | "teacher";
    threadId?: string;
    body?: string;
  };

  if (!body.threadId || !body.body?.trim() || !body.role) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (body.role !== "student" && body.role !== "teacher") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const profileId = await resolveProfileId(body.role);
  if (!profileId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const message = await sendAdminDirectReplyFromRecipientInDb({
      threadId: body.threadId,
      profileId,
      body: body.body,
    });
    return NextResponse.json({ message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "send_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  await ensureSchedulesBootstrapped();

  const body = (await request.json()) as {
    role?: "student" | "teacher";
    threadId?: string;
  };

  if (!body.threadId || !body.role) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (body.role !== "student" && body.role !== "teacher") {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }

  const profileId = await resolveProfileId(body.role);
  if (!profileId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    await markAdminDirectThreadReadForRecipientInDb(body.threadId, profileId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "read_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
