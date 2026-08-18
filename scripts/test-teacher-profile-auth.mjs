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
const teacherId = manifest.teacher?.userId;
let passed = 0;

if (!teacherId || !manifest.password) {
  throw new Error("seed-manifest.json is missing teacher profile test data");
}

async function expectStatus(label, path, expectedStatus, token, options) {
  const { response } = await request(path, token, options);
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected HTTP ${expectedStatus}, received ${response.status}`);
  }
  passed += 1;
  console.log(`PASS ${label}`);
}

await expectStatus("profile list rejects anonymous requests", "/api/teachers/profile", 401);
await expectStatus(
  "profile detail rejects anonymous requests",
  `/api/teachers/profile/${teacherId}`,
  401
);

const tokens = {};
for (const role of ["student", "teacher", "admin"]) {
  tokens[role] = await signInWithPassword({
    email: manifest[role].email,
    password: manifest.password,
  });
}

await expectStatus(
  "student cannot list private teacher profiles",
  "/api/teachers/profile",
  403,
  tokens.student
);
await expectStatus(
  "teacher cannot list private teacher profiles",
  "/api/teachers/profile",
  403,
  tokens.teacher
);
await expectStatus(
  "teacher cannot edit through the admin profile endpoint",
  `/api/teachers/profile/${teacherId}`,
  403,
  tokens.teacher,
  { method: "PUT", body: {} }
);
await expectStatus(
  "admin can list private teacher profiles",
  "/api/teachers/profile",
  200,
  tokens.admin
);
await expectStatus(
  "admin can read a teacher profile detail",
  `/api/teachers/profile/${teacherId}`,
  200,
  tokens.admin
);

const validProfile = {
  displayName: "DTO validation only",
  bio: "Rejected before a database update.",
  specialties: ["Friendly"],
  experienceYears: 1,
};
await expectStatus(
  "profile DTO rejects an invalid status before update",
  `/api/teachers/profile/${teacherId}`,
  400,
  tokens.admin,
  { method: "PUT", body: { ...validProfile, status: "owner" } }
);
await expectStatus(
  "profile DTO rejects an invalid hourly rate before update",
  `/api/teachers/profile/${teacherId}`,
  400,
  tokens.admin,
  { method: "PUT", body: { ...validProfile, hourlyRatePhp: -1 } }
);

console.log(`Teacher profile authorization and DTO checks passed: ${passed}`);
