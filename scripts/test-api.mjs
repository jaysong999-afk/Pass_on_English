/**
 * Smoke tests for major API endpoints.
 * Run: node scripts/test-api.mjs [baseUrl]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://localhost:3000";

const results = [];

async function test(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - start, ...detail });
    console.log(`✓ ${name} (${Date.now() - start}ms)`);
    if (detail.note) console.log(`  ${detail.note}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, ms: Date.now() - start, error: message });
    console.log(`✗ ${name}: ${message}`);
  }
}

async function get(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, json, text };
}

async function main() {
  console.log(`Testing APIs at ${BASE}\n`);

  await test("GET /api/health", async () => {
    const { status, json } = await get("/api/health");
    if (status !== 200) throw new Error(`status ${status}`);
    if (json?.status !== "ok") throw new Error(`unexpected body: ${JSON.stringify(json)}`);
    return { status };
  });

  await test("GET /api/faq", async () => {
    const { status, json } = await get("/api/faq");
    if (status !== 200) throw new Error(`status ${status}`);
    if (!Array.isArray(json?.items)) throw new Error("items missing");
    return { status, note: `items=${json.items.length}` };
  });

  await test("GET /api/teachers/public", async () => {
    const { status, json } = await get("/api/teachers/public");
    if (status !== 200) throw new Error(`status ${status}`);
    if (!Array.isArray(json?.teachers)) throw new Error("teachers missing");
    return { status, note: `teachers=${json.teachers.length}` };
  });

  await test("GET /api/pricing-plans", async () => {
    const { status, json } = await get("/api/pricing-plans");
    if (status !== 200) throw new Error(`status ${status}`);
    if (!Array.isArray(json?.plans)) throw new Error("plans missing");
    return { status, note: `plans=${json.plans.length}` };
  });

  await test("GET /api/pricing-plans?active=true", async () => {
    const { status, json } = await get("/api/pricing-plans?active=true");
    if (status !== 200) throw new Error(`status ${status}`);
    if (!Array.isArray(json?.plans)) throw new Error("plans missing");
    return { status, note: `active plans=${json.plans.length}` };
  });

  await test("GET /api/enrollments", async () => {
    const { status, json } = await get("/api/enrollments");
    if (status !== 200) throw new Error(`status ${status}`);
    if (!Array.isArray(json?.enrollments)) throw new Error("enrollments missing");
    return { status, note: `enrollments=${json.enrollments.length}` };
  });

  await test("POST /api/enrollments (no auth → 401)", async () => {
    const { status } = await get("/api/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planId: "x", teacherId: "y", teacherName: "T" }),
    });
    if (status !== 401) throw new Error(`expected 401, got ${status}`);
    return { status };
  });

  await test("GET /api/chat/rooms?role=student (no session)", async () => {
    const { status, json } = await get("/api/chat/rooms?role=student");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.rooms)) throw new Error("rooms missing");
    if (typeof json.totalUnread !== "number") throw new Error("totalUnread missing");
    return { status, note: `rooms=${json.rooms.length}, unread=${json.totalUnread}` };
  });

  await test("GET /api/chat/rooms?role=teacher", async () => {
    const { status, json } = await get("/api/chat/rooms?role=teacher");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.rooms)) throw new Error("rooms missing");
    return { status, note: `rooms=${json.rooms.length}` };
  });

  await test("GET /api/chat/rooms (missing role → 400)", async () => {
    const { status } = await get("/api/chat/rooms");
    if (status !== 400) throw new Error(`expected 400, got ${status}`);
    return { status };
  });

  await test("GET /api/admin/teachers", async () => {
    const { status, json } = await get("/api/admin/teachers");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json?.summary || !Array.isArray(json?.teachers)) throw new Error("shape invalid");
    return {
      status,
      note: `teachers=${json.teachers.length}, pending=${json.pendingApplications?.length ?? "?"}`,
    };
  });

  await test("GET /api/admin/finance/transactions", async () => {
    const { status, json } = await get("/api/admin/finance/transactions");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.transactions)) throw new Error("transactions missing");
    return { status, note: `transactions=${json.transactions.length}` };
  });

  await test("GET /api/admin/lessons", async () => {
    const { status, json } = await get("/api/admin/lessons");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.lessons)) throw new Error("lessons missing");
    return { status, note: `lessons=${json.lessons.length}` };
  });

  await test("GET /api/teacher/lessons", async () => {
    const { status, json } = await get("/api/teacher/lessons?scope=all");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.lessons)) throw new Error("lessons missing");
    return { status, note: `lessons=${json.lessons.length}` };
  });

  await test("GET /api/teacher/lessons (dashboard shape)", async () => {
    const { status, json } = await get("/api/teacher/lessons");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!("todayLessons" in json) || !("actionRequired" in json)) {
      throw new Error("dashboard shape missing");
    }
    return {
      status,
      note: `today=${json.todayLessons.length}, action=${json.actionRequired.length}`,
    };
  });

  await test("GET /api/student/account (no auth → 401)", async () => {
    const { status } = await get("/api/student/account");
    if (status !== 401) throw new Error(`expected 401, got ${status}`);
    return { status };
  });

  await test("POST /api/push/subscribe (no auth → 401)", async () => {
    const { status } = await get("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: "https://example.com/push",
        keys: { p256dh: "abc", auth: "def" },
      }),
    });
    if (status !== 401) throw new Error(`expected 401, got ${status}`);
    return { status };
  });

  await test("GET /api/teacher/student-context (missing params → 400)", async () => {
    const { status } = await get("/api/teacher/student-context");
    if (status !== 400) throw new Error(`expected 400, got ${status}`);
    return { status };
  });

  await test("PUT /api/teacher/student-context (unknown IDs → 404)", async () => {
    const { status, json } = await get("/api/teacher/student-context", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        studentId: "00000000-0000-4000-8000-000000000099",
        teacherId: "00000000-0000-4000-8000-000000000098",
        textbook: "Test Book",
      }),
    });
    if (status !== 404 && status !== 200) {
      throw new Error(`unexpected status ${status}: ${JSON.stringify(json)}`);
    }
    return { status, note: json?.error ?? "saved" };
  });

  await test("GET /api/chat/messages (missing roomId → 400)", async () => {
    const { status } = await get("/api/chat/messages");
    if (status !== 400) throw new Error(`expected 400, got ${status}`);
    return { status };
  });

  await test("GET /api/learning/feedback (with studentId)", async () => {
    const { status, json } = await get(
      "/api/learning/feedback?studentId=00000000-0000-4000-8000-000000000099"
    );
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.feedbacks)) throw new Error("feedbacks missing");
    return { status, note: `feedbacks=${json.feedbacks.length}` };
  });

  await test("GET /api/learning/feedback (missing studentId → 400)", async () => {
    const { status } = await get("/api/learning/feedback");
    if (status !== 400) throw new Error(`expected 400, got ${status}`);
    return { status };
  });

  await test("GET /api/admin/faq", async () => {
    const { status, json } = await get("/api/admin/faq");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.items)) throw new Error("items missing");
    return { status, note: `items=${json.items.length}` };
  });

  await test("GET /api/teacher/salary", async () => {
    const { status, json } = await get("/api/teacher/salary");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json?.statement && !json?.statements) throw new Error("salary shape missing");
    return { status };
  });

  await test("GET /api/teacher/availability", async () => {
    const { status, json } = await get("/api/teacher/availability");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json?.availability?.slots) throw new Error("availability missing");
    return { status };
  });

  await test("GET /api/admin/dashboard-settings", async () => {
    const { status, json } = await get("/api/admin/dashboard-settings");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (typeof json?.slogan !== "string") throw new Error("slogan missing");
    return { status };
  });

  await test("GET /api/lessons/reschedule?scope=all", async () => {
    const { status, json } = await get("/api/lessons/reschedule?scope=all");
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json?.requests)) throw new Error("requests missing");
    return { status, note: `requests=${json.requests.length}` };
  });

  // Dynamic tests — use seed manifest when present
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(__dirname, "seed-manifest.json"), "utf8"));
  } catch {
    manifest = null;
  }

  const teacherLessonsUrl = manifest?.teacher?.userId
    ? `/api/teacher/lessons?scope=all&teacherId=${manifest.teacher.userId}`
    : "/api/teacher/lessons?scope=all";

  const { json: lessonsJson } = await get(teacherLessonsUrl);
  const firstLesson = lessonsJson?.lessons?.[0];

  if (firstLesson?.id) {
    await test(`GET /api/teacher/lessons/${firstLesson.id}`, async () => {
      const { status, json } = await get(`/api/teacher/lessons/${firstLesson.id}`);
      if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
      if (!json?.lesson?.id) throw new Error("lesson missing");
      return { status, note: `lesson=${json.lesson.id}` };
    });

    if (firstLesson.studentId && firstLesson.teacherId) {
      await test("GET /api/teacher/student-context (with IDs)", async () => {
        const q = new URLSearchParams({
          studentId: firstLesson.studentId,
          teacherId: firstLesson.teacherId,
        });
        const { status, json } = await get(`/api/teacher/student-context?${q}`);
        if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
        if (!json?.context) throw new Error("context missing");
        return { status, note: `textbook=${json.context.textbook || "(empty)"}` };
      });
    }
  } else {
    console.log("⊘ Skipped lesson detail tests (no lessons in DB)");
  }

  const { json: plansJson } = await get("/api/pricing-plans");
  const firstPlan = plansJson?.plans?.[0];
  if (firstPlan?.id) {
    await test(`GET /api/pricing-plans/${firstPlan.id}`, async () => {
      const { status, json } = await get(`/api/pricing-plans/${firstPlan.id}`);
      if (status !== 200) throw new Error(`status ${status}`);
      if (!json?.plan?.id) throw new Error("plan missing");
      return { status };
    });
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n--- Summary: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
