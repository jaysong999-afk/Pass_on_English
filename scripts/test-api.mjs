/**
 * Unauthenticated HTTP smoke tests for public and protected API boundaries.
 * Authenticated role behavior belongs to test-api-auth.mjs and test-api-e2e.mjs.
 */
const BASE = process.argv[2] ?? "http://localhost:3000";
const results = [];

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { response, body };
}

async function test(name, run) {
  const startedAt = Date.now();
  try {
    const note = await run();
    results.push({ name, ok: true });
    console.log(`PASS ${name} (${Date.now() - startedAt}ms)${note ? `\n  ${note}` : ""}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false });
    console.log(`FAIL ${name}: ${message}`);
  }
}

async function expectStatus(path, expected, options) {
  const { response, body } = await request(path, options);
  if (response.status !== expected) {
    throw new Error(`expected ${expected}, got ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

console.log(`Testing unauthenticated APIs at ${BASE}\n`);

await test("GET /api/health is public", async () => {
  const body = await expectStatus("/api/health", 200);
  if (body?.status !== "ok") throw new Error("health body is invalid");
});

for (const [path, field] of [
  ["/api/faq", "items"],
  ["/api/teachers/public", "teachers"],
  ["/api/pricing-plans", "plans"],
  ["/api/pricing-plans?active=true", "plans"],
]) {
  await test(`GET ${path} is public`, async () => {
    const body = await expectStatus(path, 200);
    if (!Array.isArray(body?.[field])) throw new Error(`${field} is missing`);
    return `${field}=${body[field].length}`;
  });
}

const { body: pricingBody } = await request("/api/pricing-plans");
const firstPlanId = pricingBody?.plans?.[0]?.id;
if (firstPlanId) {
  await test("GET /api/pricing-plans/:id is public", async () => {
    const body = await expectStatus(`/api/pricing-plans/${firstPlanId}`, 200);
    if (body?.plan?.id !== firstPlanId) throw new Error("plan detail is missing");
  });
}

for (const [path, options] of [
  ["/api/enrollments"],
  ["/api/chat/rooms?role=student"],
  ["/api/chat/rooms?role=teacher"],
  ["/api/chat/messages"],
  ["/api/admin/teachers"],
  ["/api/admin/finance/transactions"],
  ["/api/admin/lessons"],
  ["/api/admin/faq"],
  ["/api/admin/dashboard-settings"],
  ["/api/teacher/lessons"],
  ["/api/teacher/student-context"],
  ["/api/teacher/salary"],
  ["/api/teacher/availability"],
  ["/api/student/account"],
  ["/api/learning/feedback"],
  ["/api/lessons/reschedule?scope=all"],
  [
    "/api/push/subscribe",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://example.com/push",
        keys: { p256dh: "test", auth: "test" },
      }),
    },
  ],
]) {
  await test(`${options?.method ?? "GET"} ${path} rejects anonymous requests`, async () => {
    await expectStatus(path, 401, options);
  });
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;
console.log(`\nHTTP smoke summary: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exitCode = 1;
