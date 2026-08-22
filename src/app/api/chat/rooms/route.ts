import { NextResponse } from "next/server";
import { requireTeacherAuth } from "@/lib/auth/session";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { ensureAccountSession } from "@/lib/account-store";
import { getAccountSessionCache } from "@/lib/account-session-cache";
import {
  ensureAdminDirectThreadInDb,
  getAdminDirectInboxForProfileInDb,
} from "@/lib/admin/messages/repository";
import {
  ensureStudentTeacherChatRoomsInDb,
  ensureTeacherStudentChatRoomsInDb,
  ensureTeacherChatRoomInDb,
  getChatRoomsFromCache,
  getTotalUnreadFromCache,
  markChatRoomReadInDb,
  type PortalRole,
} from "@/lib/chat/repository";

const ROLES: PortalRole[] = ["student", "teacher", "admin"];

function parseRole(value: string | null): PortalRole | null {
  if (value && ROLES.includes(value as PortalRole)) return value as PortalRole;
  return null;
}

async function resolveStudentId(searchParams: URLSearchParams): Promise<string | undefined> {
  const session = await ensureAccountSession();
  if (!session) return undefined;
  const fromQuery = searchParams.get("studentId");
  if (fromQuery && session.learners.some((learner) => learner.id === fromQuery)) {
    return fromQuery;
  }
  return session.activeLearnerId ?? undefined;
}

async function resolveInboxProfileId(
  role: PortalRole,
  teacherId?: string
): Promise<string | undefined> {
  if (role === "teacher") {
    return teacherId;
  }
  if (role === "student") {
    await ensureAccountSession();
    return getAccountSessionCache()?.account.id;
  }
  return undefined;
}

async function resolveTeacherIdForRole(): Promise<string | undefined> {
  try {
    const { teacherId } = await requireTeacherAuth();
    return teacherId;
  } catch {
    return undefined;
  }
}

export async function GET(request: Request) {
  try {
    await ensureSchedulesBootstrapped();

    const { searchParams } = new URL(request.url);
    const role = parseRole(searchParams.get("role"));
    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    const studentId =
      role === "student" ? await resolveStudentId(searchParams) : undefined;
    const teacherId =
      role === "teacher" ? await resolveTeacherIdForRole() : undefined;

    if (role === "teacher" && !teacherId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const displayName = searchParams.get("displayName");

    if (role === "teacher" && searchParams.get("studentId") && teacherId) {
      try {
        const room = await ensureTeacherChatRoomInDb({
          teacherId,
          teacherName: searchParams.get("teacherName") ?? "Teacher",
          studentId: searchParams.get("studentId")!,
          displayName: displayName ?? "Student",
        });
        return NextResponse.json({ room });
      } catch (error) {
        const message = error instanceof Error ? error.message : "chat_room_failed";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const context = {
      viewerRole: role,
      studentId,
      teacherId: role === "teacher" ? teacherId : undefined,
    };

    if (role === "student" && studentId) {
      await ensureStudentTeacherChatRoomsInDb(studentId);
    }
    if (role === "teacher" && teacherId) {
      await ensureTeacherStudentChatRoomsInDb(teacherId);
    }

    const rooms = getChatRoomsFromCache(context);
    let totalUnread = getTotalUnreadFromCache(context);
    let adminSupport = null;

    const profileId = await resolveInboxProfileId(role, teacherId);
    if (profileId && (role === "student" || role === "teacher")) {
      if (role === "student" && studentId) {
        await ensureAdminDirectThreadInDb({
          targetType: "student",
          targetId: studentId,
        });
      }
      if (role === "teacher" && teacherId) {
        await ensureAdminDirectThreadInDb({
          targetType: "teacher",
          targetId: teacherId,
        });
      }
      const inbox = await getAdminDirectInboxForProfileInDb(profileId);
      adminSupport = inbox.thread;
      if (inbox.thread?.unread) {
        totalUnread += inbox.thread.unread;
      }
    }

    return NextResponse.json({
      rooms,
      totalUnread,
      adminSupport,
    });
  } catch (error) {
    console.error("[GET /api/chat/rooms]", error);
    const message = error instanceof Error ? error.message : "chat_rooms_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureSchedulesBootstrapped();

    const { searchParams } = new URL(request.url);
    const role = parseRole(searchParams.get("role"));
    const id = searchParams.get("id");
    const action = searchParams.get("action");

    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    const studentId =
      role === "student" ? await resolveStudentId(searchParams) : undefined;
    const teacherId =
      role === "teacher" ? await resolveTeacherIdForRole() : undefined;

    if (role === "teacher" && !teacherId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const context = {
      viewerRole: role,
      studentId,
      teacherId: role === "teacher" ? teacherId : undefined,
    };

    if (action === "readAll") {
      const rooms = getChatRoomsFromCache(context);
      for (const room of rooms) {
        if (room.unread > 0) {
          await markChatRoomReadInDb(room.id, role);
        }
      }
      return NextResponse.json({ totalUnread: 0 });
    }

    if (id && action === "read") {
      await markChatRoomReadInDb(id, role);
      return NextResponse.json({ totalUnread: getTotalUnreadFromCache(context) });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/chat/rooms]", error);
    const message = error instanceof Error ? error.message : "chat_rooms_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
