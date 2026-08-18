import {
  createApiClient,
  loadEnvLocal,
  signInWithPassword,
} from "./test-fixtures/auth-fixtures.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const PASSWORD = "DemoPass123!";

loadEnvLocal();
const { requestJson: api } = createApiClient(BASE);
const token = await signInWithPassword({
  email: "e2e-student-guardian@example.org",
  password: PASSWORD,
});
const account = await api("/api/student/account", token);
const learner = account.learners?.find((item) => item.englishName === "Haeun Kim");
const learnerId = learner?.id;
if (!learnerId) throw new Error("enrolled guardian learner missing");
const enrollments = await api(
  `/api/enrollments?studentId=${encodeURIComponent(learnerId)}`,
  token
);

const inbox = await api(
  `/api/chat/rooms?role=student&studentId=${encodeURIComponent(learnerId)}`,
  token
);
const teacherRoom = inbox.rooms?.find((room) => room.displayName === "Emily Chen");
if (!teacherRoom) {
  throw new Error(
    `active teacher room missing: learner=${learner?.englishName} ` +
      `enrollments=${JSON.stringify(enrollments.enrollments)} rooms=${JSON.stringify(inbox.rooms)}`
  );
}
if (!inbox.adminSupport?.id) throw new Error("admin support thread missing");

const teacherBody = `student teacher chat verification ${Date.now()}`;
const teacherMessage = await api("/api/chat/messages", token, {
  method: "POST",
  body: {
    roomId: teacherRoom.id,
    body: teacherBody,
    senderRole: "student",
    studentId: learnerId,
    viewerProfileId: account.account.id,
  },
});
if (teacherMessage.message?.body !== teacherBody) throw new Error("teacher message was not stored");

const support = await api("/api/messages/admin-direct?role=student", token);
if (!support.thread?.id) throw new Error("support thread did not open");
const adminBody = `student admin chat verification ${Date.now()}`;
const adminMessage = await api("/api/messages/admin-direct", token, {
  method: "POST",
  body: { role: "student", threadId: support.thread.id, body: adminBody },
});
if (adminMessage.message?.body !== adminBody) throw new Error("admin message was not stored");

console.log("✓ student chat contacts loaded");
console.log(`  learner=${learner.englishName} teacher=${teacherRoom.displayName}`);
console.log(`  teacherRoom=${teacherRoom.id} adminThread=${support.thread.id}`);
console.log("✓ messages sent to active teacher and administrator");
