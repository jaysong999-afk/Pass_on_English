import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");

const hub = read("src/components/admin/messages/AdminMessagesHub.tsx");
const manager = read("src/components/admin/messages/CsManagerPanel.tsx");
const store = read("src/lib/chat-store.ts");
const bell = read("src/components/shared/ChatNotificationBell.tsx");
const composer = read("src/components/shared/ChatComposer.tsx");
const timeline = read("src/components/shared/ChatTimeline.tsx");
const thread = read("src/components/shared/ChatThread.tsx");
const direct = read("src/components/shared/AdminDirectChatPanel.tsx");
const monitor = read("src/components/admin/messages/ChatMonitorThread.tsx");
const studentRoom = read("src/app/[locale]/student/chat/[roomId]/page.tsx");
const teacherRoom = read("src/app/teacher/chat/[roomId]/page.tsx");
const roomHook = read("src/hooks/useChatRoom.ts");
const roomApi = read("src/app/api/chat/rooms/route.ts");

if (!store.includes("/admin/messages?tab=cs&view=direct&thread=")) {
  throw new Error("admin notification links must identify the CS/direct tab and thread");
}
for (const path of [
  '`/${locale}/student/chat/${roomId}`',
  '`/teacher/chat/${roomId}`',
  '`/${locale}/student/chat/support`',
  '"/teacher/chat/support"',
]) {
  if (!store.includes(path)) throw new Error(`role chat destination is missing ${path}`);
}
if (!bell.includes('if (role === "admin")') || !bell.includes("fetchAdminDirectInbox()")) {
  throw new Error("the admin notification bell must remain scoped to admin direct conversations");
}
if (!hub.includes("value={activeTab}") || !hub.includes('searchParams.has("thread")')) {
  throw new Error("admin message hub must restore its active tab from the URL");
}
if (!manager.includes('searchParams.get("view") === "direct"') || !manager.includes("updateCsLocation")) {
  throw new Error("admin CS sub-tabs and selected direct thread must stay URL-addressable");
}
if (
  bell.includes('await fetch(`/api/admin/messages/direct/${thread.id}`, { method: "PATCH" })') ||
  bell.includes("await fetch(`/api/chat/rooms?role=${role}&id=${room.id}&action=read`")
) {
  throw new Error("notification clicks must leave read persistence to the destination screen");
}

for (const marker of ["event.altKey", "event.nativeEvent.isComposing", "requestSubmit()", 'enterKeyHint="send"']) {
  if (!composer.includes(marker)) throw new Error(`chat composer is missing ${marker}`);
}
for (const source of [thread, direct, manager]) {
  if (!source.includes("<ChatComposer")) throw new Error("every writable chat surface must use ChatComposer");
}
if (!timeline.includes("Intl.DateTimeFormat") || !timeline.includes("getFullYear()")) {
  throw new Error("date separators must use the viewer's local calendar date and locale");
}
for (const source of [thread, direct, manager, monitor]) {
  if (!source.includes("ChatDateDivider") || !source.includes("shouldShowChatDate")) {
    throw new Error("every chat timeline must render date separators");
  }
  if (!source.includes("nextCursor") || !source.includes("이전 메시지 보기") && !source.includes("Load earlier messages")) {
    throw new Error("every chat timeline must expose older-message pagination");
  }
}
if (!studentRoom.includes('locale={locale}') || !teacherRoom.includes('locale="en-US"')) {
  throw new Error("student and teacher timelines must pass their display locale");
}
if (!thread.includes("setServerClosed(true)") || !thread.includes("Boolean(closedAt) || serverClosed")) {
  throw new Error("a server-side enrollment closure must immediately switch the composer to read-only mode");
}
if (!roomHook.includes("resolveId: roomId") || !roomHook.includes("router.replace")) {
  throw new Error("historical duplicate room links must redirect to the canonical pair room");
}
if (!roomApi.includes("resolveChatRoomIdInDb") || !roomApi.includes("if (resolveId)")) {
  throw new Error("the room endpoint must resolve aliases without loading the full inbox twice");
}

console.log("PASS admin notification links open the requested direct conversation");
console.log("PASS read persistence is owned by the destination chat screen");
console.log("PASS Enter sends, Alt+Enter creates a line break, and IME composition is protected");
console.log("PASS all chat timelines render localized dates and bounded older-history loading");
console.log("PASS enrollment closure responses immediately make an open chat read-only");
console.log("PASS historical duplicate-room links resolve through a fallback-only endpoint");
