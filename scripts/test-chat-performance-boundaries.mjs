import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const studentChat = read("src/app/[locale]/student/chat/page.tsx");
const teacherChat = read("src/app/teacher/chat/page.tsx");
const bell = read("src/components/shared/ChatNotificationBell.tsx");
const studentShell = read("src/components/shared/StudentAppShell.tsx");
const roomsRoute = read("src/app/api/chat/rooms/route.ts");
const messagesRoute = read("src/app/api/chat/messages/route.ts");
const repository = read("src/lib/chat/repository.ts");
const migration = read("supabase/migrations/041_targeted_chat_inbox.sql");
const privilegeMigration = read("supabase/migrations/042_harden_chat_rpc_privileges.sql");

if (studentChat.includes('/api/student/profile')) {
  throw new Error("student chat still reloads the deprecated profile endpoint");
}
if (!studentChat.includes("useActiveLearner") || !studentChat.includes("fetchChatInbox")) {
  throw new Error("student chat must reuse account context and the deduplicated inbox client");
}
if (!teacherChat.includes("fetchChatInbox") || !bell.includes("fetchChatInbox")) {
  throw new Error("chat list and bell must share the in-flight inbox request");
}
if (
  !studentShell.includes('mediaQuery="(min-width: 768px)"') ||
  !studentShell.includes('mediaQuery="(max-width: 767px)"') ||
  !bell.includes("window.matchMedia")
) {
  throw new Error("hidden responsive chat bells must not fetch or subscribe");
}

for (const [label, source] of [
  ["rooms route", roomsRoute],
  ["messages route", messagesRoute],
]) {
  if (source.includes("ensureChatBootstrapped")) {
    throw new Error(`${label} still initializes the global chat cache`);
  }
}
if (!roomsRoute.includes("getChatInboxInDb")) {
  throw new Error("rooms route is not using targeted inbox aggregation");
}
if (!roomsRoute.includes("auth.profile.role !== role")) {
  throw new Error("rooms route does not reject a forged requested role");
}
if (!messagesRoute.includes("body.senderRole !== auth.profile.role")) {
  throw new Error("message route does not reject a forged sender role");
}
if (!repository.includes('.rpc("get_chat_inbox"') || !repository.includes('.rpc("get_chat_thread_messages"')) {
  throw new Error("chat repository is not using targeted database functions");
}
for (const marker of [
  "idx_chat_messages_room_created_desc",
  "get_chat_inbox",
  "get_chat_thread_messages",
  "on_active_enrollment_ensure_chat_room",
  "on_student_ensure_admin_direct_thread",
  "on_teacher_ensure_admin_direct_thread",
]) {
  if (!migration.includes(marker)) {
    throw new Error(`chat performance migration is missing ${marker}`);
  }
}
if (!migration.includes("SECURITY DEFINER")) {
  throw new Error("cross-profile metadata must be resolved behind checked RPCs");
}
if (
  !migration.includes("REVOKE ALL ON FUNCTION public.get_chat_inbox(uuid) FROM PUBLIC") ||
  !migration.includes("GRANT EXECUTE ON FUNCTION public.get_chat_inbox(uuid) TO authenticated")
) {
  throw new Error("targeted chat RPC privileges must be authenticated-only");
}
if (!migration.includes("AND public.can_access_chat_room(p_room_id)")) {
  throw new Error("thread RPC must authorize access to the requested room");
}
for (const rpc of ["get_chat_inbox", "get_chat_thread_messages"]) {
  if (!privilegeMigration.includes(`REVOKE ALL ON FUNCTION public.${rpc}(uuid) FROM PUBLIC, anon`)) {
    throw new Error(`${rpc} must explicitly revoke Supabase anon-role execution`);
  }
}
if (!privilegeMigration.includes("TO authenticated, service_role")) {
  throw new Error("chat RPC execution must remain available to authenticated server flows");
}

console.log("PASS chat pages reuse account state and deduplicate concurrent inbox requests");
console.log("PASS hidden responsive bells do not fetch or subscribe");
console.log("PASS chat APIs use targeted DB reads without global cache bootstrap");
console.log("PASS requested and sender roles are bound to the authenticated profile");
console.log("PASS enrollment/admin chat lifecycle provisioning is migration-backed");
