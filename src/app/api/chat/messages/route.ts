import { NextResponse } from "next/server";
import type { UserRole } from "@/types";
import { requireTeacherAuth } from "@/lib/auth/session";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { ensureAccountSession } from "@/lib/account-store";
import { getAccountSessionCache } from "@/lib/account-session-cache";
import {
  reloadChatMessagesInDb,
  sendChatMessageInDb,
} from "@/lib/chat/repository";

const ROLES: UserRole[] = ["student", "teacher", "admin"];

async function resolveStudentIdFromBody(bodyStudentId?: string): Promise<string | undefined> {
  if (bodyStudentId) return bodyStudentId;
  await ensureAccountSession();
  return getAccountSessionCache()?.activeLearnerId ?? undefined;
}

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();

  const { searchParams } = new URL(request.url);
  const roomId = searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const messages = await reloadChatMessagesInDb(roomId);
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  await ensureSchedulesBootstrapped();

  const body = (await request.json()) as {
    roomId?: string;
    body?: string;
    senderRole?: UserRole;
    studentId?: string;
    teacherId?: string;
    viewerProfileId?: string;
  };

  if (!body.roomId || !body.body?.trim() || !body.senderRole) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  if (!ROLES.includes(body.senderRole)) {
    return NextResponse.json({ error: "invalid_sender_role" }, { status: 400 });
  }

  const studentId =
    body.senderRole === "student"
      ? await resolveStudentIdFromBody(body.studentId)
      : undefined;

  let teacherId = body.teacherId;
  if (body.senderRole === "teacher") {
    try {
      const teacherAuth = await requireTeacherAuth();
      teacherId = teacherAuth.teacherId;
    } catch {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const message = await sendChatMessageInDb({
      roomId: body.roomId,
      body: body.body,
      senderRole: body.senderRole,
      studentId: body.senderRole === "student" ? studentId : undefined,
      teacherId: body.senderRole === "teacher" ? teacherId : body.teacherId,
      viewerProfileId: body.viewerProfileId,
    });
    return NextResponse.json({ message });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "send_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
