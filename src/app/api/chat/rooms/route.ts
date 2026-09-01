import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getAdminDirectThreadForProfileInDb } from "@/lib/admin/messages/repository";
import {
  getChatInboxInDb,
  markChatRoomReadInDb,
  type PortalRole,
} from "@/lib/chat/repository";

const ROLES: PortalRole[] = ["student", "teacher", "admin"];

function parseRole(value: string | null): PortalRole | null {
  if (value && ROLES.includes(value as PortalRole)) return value as PortalRole;
  return null;
}

async function requireRequestedRole(role: PortalRole) {
  const auth = await getAuthContext();
  if (!auth) {
    return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  if (auth.profile.role !== role) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { auth };
}

async function loadInbox(role: PortalRole, profileId: string, studentId?: string) {
  const rooms = await getChatInboxInDb(role === "student" ? studentId : undefined);
  const adminSupport =
    role === "student" || role === "teacher"
      ? await getAdminDirectThreadForProfileInDb(profileId)
      : null;
  const totalUnread =
    rooms.reduce((sum, room) => sum + room.unread, 0) + (adminSupport?.unread ?? 0);
  return { rooms, totalUnread, adminSupport };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = parseRole(searchParams.get("role"));
    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    const authResult = await requireRequestedRole(role);
    if ("error" in authResult) return authResult.error;

    const studentId = role === "student" ? searchParams.get("studentId") ?? undefined : undefined;
    const inbox = await loadInbox(role, authResult.auth.userId, studentId);

    // Teacher deep links retain the historical { room } response contract, but
    // room creation now belongs to the enrollment lifecycle DB trigger.
    const requestedStudentId = role === "teacher" ? searchParams.get("studentId") : null;
    if (requestedStudentId) {
      const room = inbox.rooms.find((item) => item.studentId === requestedStudentId);
      if (!room) {
        return NextResponse.json({ error: "chat_room_not_found" }, { status: 404 });
      }
      return NextResponse.json({ room });
    }

    return NextResponse.json(inbox);
  } catch (error) {
    console.error("[GET /api/chat/rooms]", error);
    const message = error instanceof Error ? error.message : "chat_rooms_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = parseRole(searchParams.get("role"));
    const id = searchParams.get("id");
    const action = searchParams.get("action");
    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    const authResult = await requireRequestedRole(role);
    if ("error" in authResult) return authResult.error;

    const studentId = role === "student" ? searchParams.get("studentId") ?? undefined : undefined;
    const inbox = await loadInbox(role, authResult.auth.userId, studentId);

    if (action === "readAll") {
      await Promise.all(
        inbox.rooms
          .filter((room) => room.unread > 0)
          .map((room) => markChatRoomReadInDb(room.id, role))
      );
      const refreshed = await loadInbox(role, authResult.auth.userId, studentId);
      return NextResponse.json({ totalUnread: refreshed.totalUnread });
    }

    if (id && action === "read") {
      if (!inbox.rooms.some((room) => room.id === id)) {
        return NextResponse.json({ error: "chat_room_not_found" }, { status: 404 });
      }
      await markChatRoomReadInDb(id, role);
      const refreshed = await loadInbox(role, authResult.auth.userId, studentId);
      return NextResponse.json({ totalUnread: refreshed.totalUnread });
    }

    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/chat/rooms]", error);
    const message = error instanceof Error ? error.message : "chat_rooms_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
