import {
  createApiClient,
  loadEnvLocal,
  loadSeedManifest,
  signInWithPassword,
} from "./test-fixtures/auth-fixtures.mjs";

loadEnvLocal();

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const manifest = loadSeedManifest();
const { request } = createApiClient(baseUrl);
let passed = 0;

async function expectStatus(label, path, expectedStatus, token, options) {
  const { response } = await request(path, token, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected HTTP ${expectedStatus}, received ${response.status}`);
  }
  passed += 1;
  console.log(`PASS ${label}`);
}

for (const [label, path] of [
  ["health endpoint is public", "/api/health"],
  ["FAQ endpoint is public", "/api/faq"],
  ["public teacher endpoint is public", "/api/teachers/public"],
  ["pricing GET endpoint is public", "/api/pricing-plans?active=true"],
]) {
  await expectStatus(label, path, 200);
}

for (const [label, path] of [
  ["student endpoint rejects anonymous requests", "/api/student/account"],
  ["teacher endpoint rejects anonymous requests", "/api/teacher/settings"],
  ["admin endpoint rejects anonymous requests", "/api/admin/dashboard-settings"],
  ["shared chat endpoint rejects anonymous requests", "/api/chat/rooms?role=student"],
  ["teacher profile list rejects anonymous requests", "/api/teachers/profile"],
  [
    "teacher profile detail rejects anonymous requests",
    `/api/teachers/profile/${manifest.teacher.userId}`,
  ],
]) {
  await expectStatus(label, path, 401);
}

const tokens = {};
for (const role of ["student", "teacher", "admin"]) {
  const account = manifest[role];
  if (!account?.email || !manifest.password) {
    throw new Error(`seed-manifest.json is missing ${role} authentication data`);
  }
  tokens[role] = await signInWithPassword({ email: account.email, password: manifest.password });

  const { response, payload } = await request("/api/auth/session", tokens[role]);
  if (response.status !== 200 || payload.profile?.role !== role) {
    throw new Error(`${role} session did not resolve to the expected role`);
  }
  passed += 1;
  console.log(`PASS ${role} session resolves its server-side role`);
}

for (const [label, path, role] of [
  ["student cannot access teacher API", "/api/teacher/settings", "student"],
  ["student cannot access admin API", "/api/admin/dashboard-settings", "student"],
  ["teacher cannot access student API", "/api/student/account", "teacher"],
  ["teacher cannot access admin API", "/api/admin/dashboard-settings", "teacher"],
  ["admin cannot access student-only API", "/api/student/account", "admin"],
  ["admin cannot access teacher-only API", "/api/teacher/settings", "admin"],
  ["student cannot list private teacher profiles", "/api/teachers/profile", "student"],
  ["teacher cannot list private teacher profiles", "/api/teachers/profile", "teacher"],
  [
    "teacher cannot read a private teacher profile detail",
    `/api/teachers/profile/${manifest.teacher.userId}`,
    "teacher",
  ],
]) {
  await expectStatus(label, path, 403, tokens[role]);
}

const validAdminProfile = {
  displayName: "DTO validation only",
  bio: "This request must be rejected before any database update.",
  specialties: ["Friendly"],
  experienceYears: 1,
};

await expectStatus(
  "teacher cannot edit a teacher profile through the admin endpoint",
  `/api/teachers/profile/${manifest.teacher.userId}`,
  403,
  tokens.teacher,
  { method: "PUT", body: validAdminProfile }
);
await expectStatus(
  "admin profile DTO rejects an invalid status before update",
  `/api/teachers/profile/${manifest.teacher.userId}`,
  400,
  tokens.admin,
  { method: "PUT", body: { ...validAdminProfile, status: "owner" } }
);
await expectStatus(
  "admin profile DTO rejects an invalid hourly rate before update",
  `/api/teachers/profile/${manifest.teacher.userId}`,
  400,
  tokens.admin,
  { method: "PUT", body: { ...validAdminProfile, hourlyRatePhp: -1 } }
);

console.log(`Authentication regression checks passed: ${passed}`);
