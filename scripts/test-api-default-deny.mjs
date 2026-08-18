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

async function expectStatus(label, path, expectedStatus, token) {
  const { response } = await request(path, token);
  if (response.status !== expectedStatus) {
    throw new Error(`${label}: expected HTTP ${expectedStatus}, received ${response.status}`);
  }
  passed += 1;
  console.log(`PASS ${label}`);
}

await expectStatus("exact health route remains public", "/api/health", 200);

for (const [label, path] of [
  ["unclassified API rejects anonymous requests", "/api/__unclassified-policy-check"],
  ["health subpath is not implicitly public", "/api/health/private"],
  ["unknown auth subpath is not implicitly public", "/api/auth/unknown"],
  ["unknown cron subpath is not implicitly public", "/api/cron/unknown"],
  ["teacher application reads require authentication", "/api/teacher/applications"],
  ["teacher availability requires authentication", "/api/teacher/availability"],
]) {
  await expectStatus(label, path, 401);
}

for (const role of ["student", "teacher", "admin"]) {
  const token = await signInWithPassword({
    email: manifest[role].email,
    password: manifest.password,
  });
  await expectStatus(
    `${role} is denied when an API has no explicit policy`,
    "/api/__unclassified-policy-check",
    403,
    token
  );
}

console.log(`Default-deny API policy checks passed: ${passed}`);
