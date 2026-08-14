import type { ChatMessage, ChatRoom, UserRole } from "@/types";
import {
  fetchStudentAvatarUrlInDb,
  fetchStudentDisplayNameInDb,
  fetchProfileAvatarUrlInDb,
} from "@/lib/accounts/repository";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store-sync";
import { getTeacherFromCache } from "@/lib/teachers/teacher-profile-cache";
import { resolveTeacherId } from "@/lib/teachers/resolve-teacher-id";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import {
  ADMIN_SENDER_DISPLAY_NAME,
  resolveAdminProfileIdInDb,
} from "@/lib/admin/resolve-admin-sender";
import { sendNotificationWithOptionalPushInDb } from "@/lib/notifications/repository";
import {
  appendChatMessageToCache,
  getChatMessageMeta,
  getChatMessagesCache,
  getChatRoomCache,
  patchChatRoomInCache,
  setChatCache,
  setChatMessagesForRoom,
} from "@/lib/chat/chat-cache";

export type PortalRole = "student" | "teacher" | "admin";

interface ChatRoomRow {
  id: string;
  enrollment_id: string;
  student_id: string;
  teacher_id: string;
  last_message_at: string | null;
  created_at: string;
}

interface ChatMessageRow {
  id: string;
  room_id: string;
  sender_id: string;
  sender_role: UserRole;
  body: string;
  read_at: string | null;
  created_at: string;
}

interface ChatListContext {
  studentId?: string;
  teacherId?: string;
  viewerRole: PortalRole;
}

export type { ChatListContext };

const ROOM_SELECT =
  "id, enrollment_id, student_id, teacher_id, last_message_at, created_at";

const MESSAGE_SELECT =
  "id, room_id, sender_id, sender_role, body, read_at, created_at";

async function fetchSenderProfile(
  senderId: string,
  senderRole: UserRole
): Promise<{ name: string; avatarUrl?: string }> {
  if (senderRole === "admin") {
    return { name: ADMIN_SENDER_DISPLAY_NAME };
  }

  const supabase = await createClient();
  if (senderRole === "teacher") {
    const teacher = getTeacherFromCache(senderId);
    if (teacher?.displayName) {
      return { name: teacher.displayName, avatarUrl: teacher.avatarUrl };
    }
    const { data } = await supabase
      .from("teachers")
      .select("display_name, profiles(avatar_url)")
      .eq("id", senderId)
      .maybeSingle();
    const profile = Array.isArray(data?.profiles) ? data.profiles[0] : data?.profiles;
    return {
      name: data?.display_name?.trim() ?? "Teacher",
      avatarUrl: profile?.avatar_url?.trim() || undefined,
    };
  }

  if (senderRole === "student") {
    const { data: student } = await supabase
      .from("students")
      .select("english_name, full_name")
      .eq("account_holder_id", senderId)
      .limit(1)
      .maybeSingle();
    const avatarUrl = await fetchProfileAvatarUrlInDb(senderId);
    if (student) {
      return {
        name: student.english_name?.trim() ?? student.full_name?.trim() ?? "Student",
        avatarUrl,
      };
    }
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", senderId)
    .maybeSingle();
  if (profile?.full_name?.trim()) {
    return {
      name: profile.full_name.trim(),
      avatarUrl: profile.avatar_url?.trim() || undefined,
    };
  }

  const { data: student } = await supabase
    .from("students")
    .select("english_name, full_name")
    .eq("account_holder_id", senderId)
    .limit(1)
    .maybeSingle();
  return {
    name: student?.english_name?.trim() ?? student?.full_name?.trim() ?? "Student",
    avatarUrl: profile?.avatar_url?.trim() || undefined,
  };
}

function rowToMessage(
  row: ChatMessageRow,
  sender: { name: string; avatarUrl?: string }
): ChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderName: sender.name,
    senderAvatarUrl: sender.avatarUrl,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  };
}

function countUnread(messages: ChatMessageRow[], viewerRole: PortalRole): number {
  return messages.filter(
    (m) => !m.read_at && m.sender_role !== viewerRole
  ).length;
}

async function buildChatRoomDto(
  row: ChatRoomRow,
  viewerRole: PortalRole,
  messageRows: ChatMessageRow[]
): Promise<ChatRoom> {
  const teacher = getTeacherFromCache(row.teacher_id);
  const studentName = await fetchStudentDisplayNameInDb(row.student_id, "Student");
  const teacherName = teacher?.displayName ?? "Teacher";
  const teacherAvatarUrl = teacher?.avatarUrl;
  const studentAvatarUrl = await fetchStudentAvatarUrlInDb(row.student_id);

  const roomMessages = messageRows.filter((m) => m.room_id === row.id);
  const latest = roomMessages
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  let displayName = studentName;
  if (viewerRole === "student") displayName = teacherName;
  if (viewerRole === "teacher") displayName = studentName;
  if (viewerRole === "admin") displayName = `${studentName} · ${teacherName}`;

  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName,
    studentId: row.student_id,
    studentName,
    displayName,
    avatarUrl:
      viewerRole === "student"
        ? teacherAvatarUrl
        : viewerRole === "teacher"
          ? studentAvatarUrl
          : teacherAvatarUrl ?? studentAvatarUrl,
    teacherAvatarUrl,
    studentAvatarUrl,
    lastMessage: latest?.body ?? "",
    lastMessageAt: row.last_message_at ?? row.created_at,
    unread: countUnread(roomMessages, viewerRole),
  };
}

async function fetchAllMessageRows(): Promise<ChatMessageRow[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`chat_messages_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as ChatMessageRow[];
}

async function fetchRoomRows(): Promise<ChatRoomRow[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase.from("chat_rooms").select(ROOM_SELECT);
  if (error) {
    throw new Error(`chat_rooms_fetch_failed: ${error.message}`);
  }
  return (data ?? []) as ChatRoomRow[];
}

export async function warmChatCache(): Promise<void> {
  const [roomRows, messageRows] = await Promise.all([
    fetchRoomRows(),
    fetchAllMessageRows(),
  ]);

  const messagesByRoom: Record<string, ChatMessage[]> = {};
  const metaByRoom: Record<
    string,
    { id: string; senderRole: UserRole; readAt: string | null }[]
  > = {};

  for (const row of messageRows) {
    const sender = await fetchSenderProfile(row.sender_id, row.sender_role);
    const message = rowToMessage(row, sender);
    messagesByRoom[row.room_id] = [...(messagesByRoom[row.room_id] ?? []), message];
    metaByRoom[row.room_id] = [
      ...(metaByRoom[row.room_id] ?? []),
      { id: row.id, senderRole: row.sender_role, readAt: row.read_at },
    ];
  }

  const rooms: ChatRoom[] = [];
  for (const row of roomRows) {
    rooms.push(await buildChatRoomDto(row, "admin", messageRows));
  }

  setChatCache(rooms, messagesByRoom, metaByRoom);
}

function unreadForRoom(roomId: string, viewerRole: PortalRole): number {
  return getChatMessageMeta(roomId).filter(
    (m) => !m.readAt && m.senderRole !== viewerRole
  ).length;
}

function filterRoomsForContext(context: ChatListContext): ChatRoom[] {
  const rooms = getChatRoomCache();
  if (context.viewerRole === "admin") {
    return rooms.map((r) => ({ ...r, unread: unreadForRoom(r.id, "admin") }));
  }
  if (context.viewerRole === "student" && context.studentId) {
    return rooms
      .filter((r) => r.studentId === context.studentId)
      .map((r) => ({
        ...r,
        displayName: r.teacherName,
        avatarUrl: r.teacherAvatarUrl ?? r.avatarUrl,
        unread: unreadForRoom(r.id, "student"),
      }));
  }
  if (context.viewerRole === "teacher") {
    const teacherId = resolveTeacherId(context.teacherId);
    if (!teacherId) return [];
    return rooms
      .filter((r) => r.teacherId === teacherId)
      .map((r) => ({
        ...r,
        displayName: r.studentName ?? r.displayName,
        avatarUrl: r.studentAvatarUrl ?? r.avatarUrl,
        unread: unreadForRoom(r.id, "teacher"),
      }));
  }
  return [];
}

export function getChatRoomsFromCache(context: ChatListContext): ChatRoom[] {
  return filterRoomsForContext(context);
}

export function getChatRoomFromCache(
  roomId: string,
  context: ChatListContext
): ChatRoom | undefined {
  return filterRoomsForContext(context).find((r) => r.id === roomId);
}

export function getTotalUnreadFromCache(context: ChatListContext): number {
  return filterRoomsForContext(context).reduce((sum, r) => sum + r.unread, 0);
}

export function getChatMessagesFromCache(roomId: string): ChatMessage[] {
  return getChatMessagesCache(roomId).map((m) => ({ ...m }));
}

async function resolveSenderProfileId(input: {
  senderRole: UserRole;
  studentId?: string;
  teacherId?: string;
}): Promise<string> {
  const supabase = await createClient();

  if (input.senderRole === "admin") {
    return resolveAdminProfileIdInDb();
  }

  if (input.senderRole === "teacher") {
    const teacherId = resolveTeacherId(input.teacherId);
    if (!teacherId) throw new Error("teacher_not_found");
    return teacherId;
  }

  if (input.senderRole === "student") {
    if (!input.studentId) throw new Error("student_id_required");
    const { data, error } = await supabase
      .from("students")
      .select("account_holder_id")
      .eq("id", input.studentId)
      .single();
    if (error || !data?.account_holder_id) {
      throw new Error("student_profile_not_found");
    }
    return data.account_holder_id;
  }

  throw new Error("admin_sender_not_resolved");
}

export async function ensureTeacherChatRoomInDb(input: {
  teacherId: string;
  teacherName: string;
  studentId: string;
  displayName: string;
}): Promise<ChatRoom> {
  void input.teacherName;
  void input.displayName;

  const teacherId = resolveTeacherId(input.teacherId);
  if (!teacherId) throw new Error("teacher_not_found");

  const existing = getChatRoomCache().find(
    (r) => r.teacherId === teacherId && r.studentId === input.studentId
  );
  if (existing) {
    return { ...existing, displayName: input.displayName };
  }

  const enrollment =
    getEnrollmentsByStudent(input.studentId).find(
      (e) => e.teacherId === teacherId && e.status === "active"
    ) ??
    getEnrollmentsByStudent(input.studentId).find((e) => e.teacherId === teacherId);

  if (!enrollment) {
    throw new Error("enrollment_not_found_for_chat");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_rooms")
    .insert({
      enrollment_id: enrollment.id,
      student_id: input.studentId,
      teacher_id: teacherId,
    })
    .select(ROOM_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existingRoom } = await supabase
        .from("chat_rooms")
        .select(ROOM_SELECT)
        .eq("enrollment_id", enrollment.id)
        .single();
      if (existingRoom) {
        await warmChatCache();
        const room = getChatRoomFromCache(existingRoom.id, {
          viewerRole: "teacher",
          teacherId,
        });
        if (room) return room;
      }
    }
    throw new Error(`chat_room_create_failed: ${error.message}`);
  }

  const messageRows = await fetchAllMessageRows();
  const room = await buildChatRoomDto(data as ChatRoomRow, "teacher", messageRows);
  patchChatRoomInCache(room);
  return room;
}

export async function sendChatMessageInDb(input: {
  roomId: string;
  body: string;
  senderRole: UserRole;
  studentId?: string;
  teacherId?: string;
  viewerProfileId?: string;
}): Promise<ChatMessage> {
  const senderId = await resolveSenderProfileId({
    senderRole: input.senderRole,
    studentId: input.studentId,
    teacherId: input.teacherId,
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      room_id: input.roomId,
      sender_id: senderId,
      sender_role: input.senderRole,
      body: input.body.trim(),
    })
    .select(MESSAGE_SELECT)
    .single();

  if (error) {
    throw new Error(`chat_message_send_failed: ${error.message}`);
  }

  const sender = await fetchSenderProfile(senderId, input.senderRole);
  const message = rowToMessage(data as ChatMessageRow, sender);
  message.isOwn =
    !!input.viewerProfileId && input.viewerProfileId === senderId;

  appendChatMessageToCache(input.roomId, message, {
    senderRole: input.senderRole,
    readAt: null,
  });

  const room = getChatRoomCache().find((r) => r.id === input.roomId);
  if (room) {
    patchChatRoomInCache({
      ...room,
      lastMessage: message.body,
      lastMessageAt: message.createdAt,
    });
  }

  if (input.senderRole === "admin") {
    void notifyChatRoomParticipantsOfAdminMessage(input.roomId, message.body);
  }

  return message;
}

async function notifyChatRoomParticipantsOfAdminMessage(
  roomId: string,
  body: string
): Promise<void> {
  const supabase = await createClient();
  const { data: room } = await supabase
    .from("chat_rooms")
    .select("student_id, teacher_id")
    .eq("id", roomId)
    .single();
  if (!room) return;

  const { data: student } = await supabase
    .from("students")
    .select("account_holder_id")
    .eq("id", room.student_id)
    .maybeSingle();

  const recipients = [student?.account_holder_id, room.teacher_id].filter(
    (id): id is string => !!id
  );

  const preview = body.trim().slice(0, 500);
  for (const userId of recipients) {
    await sendNotificationWithOptionalPushInDb({
      userId,
      type: "chat_message",
      title: ADMIN_SENDER_DISPLAY_NAME,
      body: preview,
      payload: { roomId, kind: "admin_chat" },
      push: true,
    });
  }
}

export async function markChatRoomReadInDb(
  roomId: string,
  viewerRole: PortalRole
): Promise<void> {
  const supabase = await createClient();
  const { data: unreadRows, error: fetchError } = await supabase
    .from("chat_messages")
    .select("id, sender_role")
    .eq("room_id", roomId)
    .is("read_at", null);

  if (fetchError) {
    throw new Error(`chat_read_fetch_failed: ${fetchError.message}`);
  }

  const ids = (unreadRows ?? [])
    .filter((row) => row.sender_role !== viewerRole)
    .map((row) => row.id);

  if (ids.length === 0) {
    const room = getChatRoomCache().find((r) => r.id === roomId);
    if (room) patchChatRoomInCache({ ...room, unread: 0 });
    return;
  }

  const { error } = await supabase
    .from("chat_messages")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);

  if (error) {
    throw new Error(`chat_read_update_failed: ${error.message}`);
  }

  const meta = getChatMessageMeta(roomId).map((m) =>
    ids.includes(m.id) ? { ...m, readAt: new Date().toISOString() } : m
  );
  setChatMessagesForRoom(roomId, getChatMessagesCache(roomId), meta);

  const room = getChatRoomCache().find((r) => r.id === roomId);
  if (room) patchChatRoomInCache({ ...room, unread: 0 });
}

export async function reloadChatMessagesInDb(roomId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_SELECT)
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`chat_messages_fetch_failed: ${error.message}`);
  }

  const messages: ChatMessage[] = [];
  const meta: { id: string; senderRole: UserRole; readAt: string | null }[] = [];
  for (const row of (data ?? []) as ChatMessageRow[]) {
    const sender = await fetchSenderProfile(row.sender_id, row.sender_role);
    messages.push(rowToMessage(row, sender));
    meta.push({ id: row.id, senderRole: row.sender_role, readAt: row.read_at });
  }

  setChatMessagesForRoom(roomId, messages, meta);
  return messages.map((m) => ({ ...m }));
}
