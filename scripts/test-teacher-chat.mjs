import {
  createApiClient,
  loadEnvLocal,
  signInWithPassword,
} from "./test-fixtures/auth-fixtures.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";

loadEnvLocal();
const { requestJson: api } = createApiClient(BASE);
const token = await signInWithPassword({
  email: "e2e-teacher-james@example.org",
  password: "DemoPass123!",
});
const inbox = await api("/api/chat/rooms?role=teacher", token);
const studentRoom = inbox.rooms?.find((room) => room.displayName === "Yerin Jung");
if (!studentRoom) throw new Error(`active student room missing: ${JSON.stringify(inbox.rooms)}`);
if (!inbox.adminSupport?.id) throw new Error("admin support thread missing");

const studentBody = `teacher student chat verification ${Date.now()}`;
const studentMessage = await api("/api/chat/messages", token, {
  method: "POST",
  body: {
    roomId: studentRoom.id,
    body: studentBody,
    senderRole: "teacher",
    teacherId: studentRoom.teacherId,
    viewerProfileId: studentRoom.teacherId,
  },
});
if (studentMessage.message?.body !== studentBody) throw new Error("student message was not stored");

const support = await api("/api/messages/admin-direct?role=teacher", token);
if (!support.thread?.id) throw new Error("teacher support thread did not open");
const adminBody = `teacher admin chat verification ${Date.now()}`;
const adminMessage = await api("/api/messages/admin-direct", token, {
  method: "POST",
  body: { role: "teacher", threadId: support.thread.id, body: adminBody },
});
if (adminMessage.message?.body !== adminBody) throw new Error("admin message was not stored");

console.log("✓ teacher chat contacts loaded");
console.log(`  student=${studentRoom.displayName} room=${studentRoom.id}`);
console.log(`  adminThread=${support.thread.id}`);
console.log("✓ messages sent to active student and administrator");
