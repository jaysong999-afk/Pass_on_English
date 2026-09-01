import {
  createApiClient,
  loadEnvLocal,
  loadSeedManifest,
  signInWithPassword,
} from "./test-fixtures/auth-fixtures.mjs";

loadEnvLocal();
const baseUrl = process.argv[2] ?? "http://localhost:3000";
const manifest = loadSeedManifest();
const { request, requestJson } = createApiClient(baseUrl);

const studentToken = await signInWithPassword({
  email: manifest.student.email,
  password: manifest.password,
});
const studentAccount = await requestJson("/api/student/account", studentToken);
const studentId =
  studentAccount.activeLearnerId ?? studentAccount.learners?.[0]?.id;
if (!studentId) throw new Error("student read test has no learner");

const studentInbox = await requestJson(
  `/api/chat/rooms?role=student&studentId=${encodeURIComponent(studentId)}`,
  studentToken
);
if (!Array.isArray(studentInbox.rooms)) {
  throw new Error("student targeted inbox did not return a rooms array");
}
if (studentInbox.rooms[0]?.id) {
  const thread = await requestJson(
    `/api/chat/messages?roomId=${encodeURIComponent(studentInbox.rooms[0].id)}`,
    studentToken
  );
  if (!Array.isArray(thread.messages)) {
    throw new Error("student targeted thread did not return a messages array");
  }
}

const forgedStudentRole = await request(
  "/api/chat/rooms?role=teacher",
  studentToken
);
if (forgedStudentRole.response.status !== 403) {
  throw new Error(`forged student role expected 403, got ${forgedStudentRole.response.status}`);
}

const teacherToken = await signInWithPassword({
  email: manifest.teacher.email,
  password: manifest.password,
});
const teacherInbox = await requestJson("/api/chat/rooms?role=teacher", teacherToken);
if (!Array.isArray(teacherInbox.rooms)) {
  throw new Error("teacher targeted inbox did not return a rooms array");
}
if (teacherInbox.rooms[0]?.id) {
  const thread = await requestJson(
    `/api/chat/messages?roomId=${encodeURIComponent(teacherInbox.rooms[0].id)}`,
    teacherToken
  );
  if (!Array.isArray(thread.messages)) {
    throw new Error("teacher targeted thread did not return a messages array");
  }
}

console.log("PASS student and teacher targeted chat RPC reads");
console.log("PASS forged chat role remains forbidden");
