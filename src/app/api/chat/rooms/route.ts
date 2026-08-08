import { NextResponse } from "next/server";
import {
  ensureTeacherChatRoom,
  getChatRooms,
  getTotalUnread,
  markAllChatRead,
  markChatRoomRead,
  type PortalRole,
} from "@/lib/chat-store";

const ROLES: PortalRole[] = ["student", "teacher", "admin"];

function parseRole(value: string | null): PortalRole | null {
  if (value && ROLES.includes(value as PortalRole)) return value as PortalRole;
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get("role"));
  if (!role) {
    return NextResponse.json({ error: "role required" }, { status: 400 });
  }

  const studentId = searchParams.get("studentId");
  const teacherId = searchParams.get("teacherId");
  const displayName = searchParams.get("displayName");

  if (role === "teacher" && studentId && teacherId) {
    const room = ensureTeacherChatRoom({
      teacherId,
      teacherName: searchParams.get("teacherName") ?? "Teacher",
      studentId,
      displayName: displayName ?? "Student",
    });
    return NextResponse.json({ room });
  }

  return NextResponse.json({
    rooms: getChatRooms(role),
    totalUnread: getTotalUnread(role),
  });
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const role = parseRole(searchParams.get("role"));
  const id = searchParams.get("id");
  const action = searchParams.get("action");

  if (!role) {
    return NextResponse.json({ error: "role required" }, { status: 400 });
  }

  if (action === "readAll") {
    markAllChatRead(role);
    return NextResponse.json({ totalUnread: 0 });
  }

  if (id && action === "read") {
    markChatRoomRead(role, id);
    return NextResponse.json({ totalUnread: getTotalUnread(role) });
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
