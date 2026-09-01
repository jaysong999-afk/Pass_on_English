import { NextResponse } from "next/server";
import type { UserRole } from "@/types";
import { assertTeacherIsActive, getAuthContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  reloadChatMessagesInDb,
  sendChatMessageInDb,
} from "@/lib/chat/repository";

const ROLES: UserRole[] = ["student", "teacher", "admin"];

async function resolveOwnedStudentId(userId: string, requestedId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from("students")
    .select("id")
    .eq("account_holder_id", userId)
    .eq("is_active", true);

  query = requestedId
    ? query.eq("id", requestedId)
    : query.order("created_at", { ascending: true }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`student_lookup_failed: ${error.message}`);
  }
  return data?.id as string | undefined;
}

export async function GET(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");
    if (!roomId) {
      return NextResponse.json({ error: "roomId required" }, { status: 400 });
    }

    const messages = await reloadChatMessagesInDb(roomId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("[GET /api/chat/messages]", error);
    const message = error instanceof Error ? error.message : "chat_messages_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      roomId?: string;
      body?: string;
      senderRole?: UserRole;
      studentId?: string;
    };

    if (!body.roomId || !body.body?.trim() || !body.senderRole) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    if (!ROLES.includes(body.senderRole)) {
      return NextResponse.json({ error: "invalid_sender_role" }, { status: 400 });
    }
    if (body.senderRole !== auth.profile.role) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    let studentId: string | undefined;
    if (body.senderRole === "student") {
      studentId = await resolveOwnedStudentId(auth.userId, body.studentId);
      if (!studentId) {
        return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
      }
    }
    if (body.senderRole === "teacher") {
      await assertTeacherIsActive(auth.userId);
    }

    const message = await sendChatMessageInDb({
      roomId: body.roomId,
      body: body.body,
      senderRole: body.senderRole,
      studentId,
      teacherId: body.senderRole === "teacher" ? auth.userId : undefined,
      viewerProfileId: auth.userId,
    });
    return NextResponse.json({ message });
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
