import type { ChatRoom } from "@/types";

export type PortalRole = "student" | "teacher" | "admin";

const SEED: Record<PortalRole, ChatRoom[]> = {
  student: [
    {
      id: "room-1",
      teacherName: "Sarah Mitchell",
      displayName: "Sarah Mitchell",
      lastMessage: "See you at tomorrow's lesson!",
      lastMessageAt: "2026-07-29T09:30:00",
      unread: 1,
    },
    {
      id: "room-2",
      teacherName: "James Rivera",
      displayName: "James Rivera",
      lastMessage: "Please complete the homework I sent.",
      lastMessageAt: "2026-07-28T18:00:00",
      unread: 0,
    },
  ],
  teacher: [
    {
      id: "room-1",
      teacherId: "teacher-1",
      teacherName: "Sarah Mitchell",
      studentId: "student-1",
      studentName: "Minjun Kim",
      displayName: "Minjun Kim",
      lastMessage: "Thank you! I'm looking forward to our first lesson.",
      lastMessageAt: "2026-07-29T08:15:00",
      unread: 2,
    },
    {
      id: "room-t2",
      teacherId: "teacher-1",
      teacherName: "Sarah Mitchell",
      studentId: "student-3",
      studentName: "Seoyeon Lee",
      displayName: "Seoyeon Lee",
      lastMessage: "Can we reschedule Friday's class?",
      lastMessageAt: "2026-07-28T16:00:00",
      unread: 0,
    },
    {
      id: "room-t3",
      teacherId: "teacher-1",
      teacherName: "Sarah Mitchell",
      studentId: "student-2",
      studentName: "Xiaoming Wang",
      displayName: "Xiaoming Wang",
      lastMessage: "",
      lastMessageAt: "2026-07-29T12:00:00",
      unread: 0,
    },
  ],
  admin: [
    {
      id: "room-a1",
      studentId: "student-1",
      studentName: "Minjun Kim",
      teacherName: "—",
      displayName: "Minjun Kim (학생)",
      lastMessage: "입금 확인 부탁드립니다.",
      lastMessageAt: "2026-07-31T11:20:00",
      unread: 1,
    },
    {
      id: "room-a2",
      teacherName: "Sarah Mitchell",
      displayName: "Sarah Mitchell (강사)",
      lastMessage: "July payroll report submitted.",
      lastMessageAt: "2026-07-30T09:00:00",
      unread: 0,
    },
  ],
};

const rooms: Record<PortalRole, ChatRoom[]> = {
  student: structuredClone(SEED.student),
  teacher: structuredClone(SEED.teacher),
  admin: structuredClone(SEED.admin),
};

export function getChatRooms(role: PortalRole) {
  return rooms[role].map((r) => ({ ...r }));
}

export function getChatRoom(role: PortalRole, id: string) {
  const room = rooms[role].find((r) => r.id === id);
  return room ? { ...room } : undefined;
}

export function getTotalUnread(role: PortalRole) {
  return rooms[role].reduce((sum, r) => sum + r.unread, 0);
}

export function markChatRoomRead(role: PortalRole, roomId: string) {
  const room = rooms[role].find((r) => r.id === roomId);
  if (room) room.unread = 0;
}

export function markAllChatRead(role: PortalRole) {
  rooms[role].forEach((r) => {
    r.unread = 0;
  });
}

export function getChatHref(role: PortalRole, roomId: string, locale = "ko") {
  switch (role) {
    case "student":
      return `/${locale}/student/chat/${roomId}`;
    case "teacher":
      return `/teacher/chat/${roomId}`;
    case "admin":
      return `/admin/chat/${roomId}`;
  }
}

export function getChatListHref(role: PortalRole, locale = "ko") {
  switch (role) {
    case "student":
      return `/${locale}/student/chat`;
    case "teacher":
      return "/teacher/chat";
    case "admin":
      return "/admin/messages";
  }
}

export function getTeacherChatRoomForStudent(
  teacherId: string,
  studentId: string
): ChatRoom | undefined {
  const room = rooms.teacher.find(
    (r) => r.teacherId === teacherId && r.studentId === studentId
  );
  return room ? { ...room } : undefined;
}

/** Find or create a teacher↔student chat room (demo in-memory store). */
export function ensureTeacherChatRoom(input: {
  teacherId: string;
  teacherName: string;
  studentId: string;
  displayName: string;
}): ChatRoom {
  const existing = getTeacherChatRoomForStudent(input.teacherId, input.studentId);
  if (existing) return existing;

  const room: ChatRoom = {
    id: `room-ts-${input.studentId}`,
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    studentId: input.studentId,
    studentName: input.displayName,
    displayName: input.displayName,
    lastMessage: "",
    lastMessageAt: new Date().toISOString(),
    unread: 0,
  };
  rooms.teacher.push(room);
  return { ...room };
}

export function getTeacherStudentChatHref(input: {
  teacherId: string;
  teacherName: string;
  studentId: string;
  displayName: string;
}): string {
  const room = ensureTeacherChatRoom(input);
  return getChatHref("teacher", room.id);
}
