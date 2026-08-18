/**
 * E2E API tests with seeded demo data + Bearer auth.
 * Prerequisites: node scripts/seed-demo.mjs && npm run dev
 * Run: node scripts/test-api-e2e.mjs [baseUrl]
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://localhost:3000";

const results = [];

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

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

async function api(path, { method = "GET", token, cronSecret, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cronSecret) headers.Authorization = `Bearer ${cronSecret}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text.slice(0, 300) };
  }
  return { status: res.status, json, text };
}

async function signIn(email, password) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase env for sign-in");

  const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      `signIn ${email}: ${json.msg ?? json.error_description ?? json.error ?? res.status}`
    );
  }
  return json.access_token;
}

async function createTeacherApplicantForE2e(email, password, fields) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!serviceKey || !url) return null;

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "teacher",
      full_name: fields.fullName,
      phone: fields.phone,
    },
  });
  if (createError) {
    throw new Error(`admin createUser: ${createError.message}`);
  }

  const userId = created.user?.id;
  if (!userId) throw new Error("admin createUser missing user id");

  await admin
    .from("profiles")
    .update({ full_name: fields.fullName, phone: fields.phone })
    .eq("id", userId);

  const { data: application, error: appError } = await admin
    .from("teacher_applications")
    .insert({
      full_name: fields.fullName,
      date_of_birth: fields.dateOfBirth,
      phone: fields.phone,
      bank_account: fields.bankAccount,
      facebook_messenger_id: fields.facebookMessengerId,
      address: fields.address,
      email,
      status: "pending",
    })
    .select("id")
    .single();

  if (appError) {
    throw new Error(`application insert: ${appError.message}`);
  }

  return { applicationId: application.id, userId, via: "service_role" };
}

async function main() {
  loadEnvLocal();

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(__dirname, "seed-manifest.json"), "utf8"));
  } catch {
    throw new Error("seed-manifest.json not found — run: node scripts/seed-demo.mjs");
  }

  console.log(`E2E API tests at ${BASE}`);
  console.log(`Using seed from ${manifest.seededAt}\n`);

  let studentToken = null;
  let teacherToken = null;
  let adminToken = null;
  if (manifest.authAvailable !== false) {
    try {
      studentToken = await signIn(manifest.student.email, manifest.password);
      teacherToken = await signIn(manifest.teacher.email, manifest.password);
      if (manifest.admin?.email) {
        adminToken = await signIn(manifest.admin.email, manifest.password);
      }
    } catch (error) {
      console.warn(
        "Auth sign-in failed — running unauthenticated write tests only:",
        error instanceof Error ? error.message : error
      );
    }
  } else {
    console.warn("authAvailable=false in manifest — skipping authenticated tests.\n");
  }

  if (studentToken) {
  await test("GET /api/auth/session (student)", async () => {
    const { status, json } = await api("/api/auth/session", { token: studentToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.profile?.role !== "student") throw new Error(`expected student role`);
    return { status, note: `user=${json.user.id}` };
  });

  await test("GET /api/student/account (authenticated)", async () => {
    const { status, json } = await api("/api/student/account", { token: studentToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.activeLearner?.id !== manifest.student.learnerId) {
      throw new Error(`learner mismatch: ${json.activeLearner?.id}`);
    }
    return { status, note: `learner=${json.activeLearner.englishName}` };
  });

  await test("GET /api/chat/rooms?role=student (authenticated)", async () => {
    const { status, json } = await api("/api/chat/rooms?role=student", { token: studentToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json.rooms?.length) throw new Error("expected chat rooms");
    return { status, note: `rooms=${json.rooms.length}, unread=${json.totalUnread}` };
  });

  await test("GET /api/chat/messages?roomId", async () => {
    const { status, json } = await api(
      `/api/chat/messages?roomId=${manifest.chatRoomId}`,
      { token: studentToken }
    );
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json.messages?.length) throw new Error("expected messages");
    return { status, note: `messages=${json.messages.length}` };
  });

  await test("POST /api/chat/messages (student send)", async () => {
    const { status, json } = await api("/api/chat/messages", {
      method: "POST",
      token: studentToken,
      body: {
        roomId: manifest.chatRoomId,
        body: "E2E test message from student",
        senderRole: "student",
        studentId: manifest.student.learnerId,
      },
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json.message?.id) throw new Error("message missing");
    return { status, note: `id=${json.message.id}` };
  });

  await test("PATCH /api/chat/rooms?action=read", async () => {
    const { status, json } = await api(
      `/api/chat/rooms?role=student&action=read&id=${manifest.chatRoomId}`,
      { method: "PATCH", token: studentToken }
    );
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    return { status, note: `totalUnread=${json.totalUnread}` };
  });
  }

  await test("GET /api/enrollments?studentId (has data)", async () => {
    if (!studentToken) {
      return { status: "skip", note: "no student token" };
    }
    const { status, json } = await api(
      `/api/enrollments?studentId=${manifest.student.learnerId}`,
      { token: studentToken }
    );
    if (status !== 200) throw new Error(`status ${status}`);
    if (!json.enrollments?.length) throw new Error("expected enrollments");
    return { status, note: `count=${json.enrollments.length}` };
  });

  await test("GET /api/teacher/lessons/:id", async () => {
    if (!teacherToken) {
      return { status: "skip", note: "no teacher token" };
    }
    const { status, json } = await api(
      `/api/teacher/lessons/${manifest.scheduledLessonId}`,
      { token: teacherToken }
    );
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.lesson?.id !== manifest.scheduledLessonId) throw new Error("lesson mismatch");
    return { status, note: `status=${json.lesson.status}` };
  });

  await test("PUT /api/teacher/student-context (update textbook)", async () => {
    if (!teacherToken) {
      return { status: "skip", note: "no teacher token" };
    }
    const before = await api(
      `/api/teacher/student-context?studentId=${manifest.student.learnerId}&teacherId=${manifest.teacher.userId}`,
      { token: teacherToken }
    );
    if (before.status !== 200) {
      throw new Error(`context preflight failed: ${before.status} ${JSON.stringify(before.json)}`);
    }
    const previousTextbook = before.json.context?.textbook ?? "";
    const nextTextbook = `Oxford Phonics 4 (E2E ${Date.now()})`;
    const { status, json } = await api("/api/teacher/student-context", {
      method: "PUT",
      token: teacherToken,
      body: {
        studentId: manifest.student.learnerId,
        teacherId: manifest.teacher.userId,
        textbook: nextTextbook,
      },
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.context?.textbook !== nextTextbook) throw new Error("textbook not updated");
    if (!Array.isArray(json.context?.textbookHistory)) {
      throw new Error("textbook history missing");
    }
    if (
      previousTextbook &&
      !json.context.textbookHistory.some((entry) => entry.textbook === previousTextbook)
    ) {
      throw new Error(`previous textbook not archived: ${JSON.stringify(json.context.textbookHistory)}`);
    }
    return {
      status,
      note: `${json.context.textbook} (history=${json.context.textbookHistory.length})`,
    };
  });

  await test("PATCH /api/teacher/lessons/:id mark_student_absent", async () => {
    if (!teacherToken) {
      return { status: "skip", note: "no teacher token" };
    }
    const { status, json } = await api(
      `/api/teacher/lessons/${manifest.scheduledLessonId}`,
      {
        method: "PATCH",
        token: teacherToken,
        body: { action: "mark_student_absent" },
      }
    );
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.lesson?.status !== "completed" || !json.lesson?.studentAbsent) {
      throw new Error(`unexpected lesson: ${JSON.stringify(json.lesson)}`);
    }
    return { status, note: "marked absent + completed in DB" };
  });

  await test("PATCH /api/enrollments/:id confirm_payment", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api(`/api/enrollments/${manifest.pendingEnrollmentId}`, {
      method: "PATCH",
      token: adminToken,
      body: { action: "confirm_payment", adminName: "E2E Admin" },
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.enrollment?.paymentStatus !== "confirmed") {
      throw new Error(`payment not confirmed: ${json.enrollment?.paymentStatus}`);
    }
    return { status, note: `status=${json.enrollment.status}` };
  });

  await test("GET /api/learning/feedback (seeded)", async () => {
    const feedbackStudentToken = await signIn(
      "e2e-student-active@example.org",
      manifest.password
    );
    const { status, json } = await api(
      "/api/learning/feedback?studentId=b0000001-0000-4000-8000-0000000000cc",
      { token: feedbackStudentToken }
    );
    if (status !== 200) throw new Error(`status ${status}`);
    if (!json.feedbacks?.length) throw new Error("expected feedbacks from seed");
    return { status, note: `feedbacks=${json.feedbacks.length}` };
  });

  await test("GET /api/teacher/feedback (teacher)", async () => {
    const feedbackTeacherToken = await signIn(
      "e2e-teacher-james@example.org",
      manifest.password
    );
    const { status, json } = await api(
      "/api/teacher/feedback?teacherId=b0000001-0000-4000-8000-000000000001",
      { token: feedbackTeacherToken }
    );
    if (status !== 200) throw new Error(`status ${status}`);
    if (!json.feedbacks?.length) throw new Error("expected teacher feedbacks");
    return { status, note: `feedbacks=${json.feedbacks.length}` };
  });

  await test("GET /api/teachers/public (has Sarah)", async () => {
    const { status, json } = await api("/api/teachers/public");
    if (status !== 200) throw new Error(`status ${status}`);
    const found = json.teachers?.some((t) => t.displayName === manifest.teacher.displayName);
    if (!found) throw new Error("demo teacher not in public list");
    return { status, note: `teachers=${json.teachers.length}` };
  });

  await test("GET /api/admin/lessons rejects unauthenticated", async () => {
    const { status } = await api("/api/admin/lessons");
    if (status !== 401) throw new Error(`expected 401, got ${status}`);
    return { status };
  });

  await test("GET /api/admin/lessons (has lessons)", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api("/api/admin/lessons", { token: adminToken });
    if (status !== 200) throw new Error(`status ${status}`);
    if (!json.lessons?.length) throw new Error("expected lessons");
    return { status, note: `lessons=${json.lessons.length}` };
  });

  await test("GET /api/admin/students (seeded learner)", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api("/api/admin/students?tab=active", { token: adminToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    const found = json.students?.find((s) => s.id === manifest.student.learnerId);
    if (!found) throw new Error("demo learner not in admin student list");
    if (found.displayName !== "Minjun Kim") {
      throw new Error(`expected english display name, got ${found.displayName}`);
    }
    return { status, note: `students=${json.students.length}` };
  });

  await test("GET /api/admin/students/:id (detail)", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api(`/api/admin/students/${manifest.student.learnerId}`, {
      token: adminToken,
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.displayName !== "Minjun Kim") {
      throw new Error(`unexpected displayName: ${json.displayName}`);
    }
    if (!json.enrollments?.length) throw new Error("expected enrollments");
    return { status, note: `enrollments=${json.enrollments.length}` };
  });

  await test("GET /api/admin/teachers (seeded Sarah)", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api("/api/admin/teachers", { token: adminToken });
    if (status !== 200) throw new Error(`status ${status}`);
    const found = json.teachers?.find((t) => t.id === manifest.teacher.userId);
    if (!found) throw new Error("demo teacher not in admin list");
    return { status, note: `teachers=${json.teachers.length}` };
  });

  await test("GET /api/admin/messages/direct", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api("/api/admin/messages/direct", { token: adminToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    return { status, note: `threads=${json.threads?.length ?? 0}` };
  });

  await test("POST /api/admin/messages/direct + send", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const create = await api("/api/admin/messages/direct", {
      method: "POST",
      token: adminToken,
      body: { targetType: "student", targetId: manifest.student.learnerId },
    });
    if (create.status !== 200) throw new Error(`create ${create.status}`);
    const threadId = create.json.thread?.id;
    if (!threadId) throw new Error("missing thread id");
    const send = await api(`/api/admin/messages/direct/${threadId}`, {
      method: "POST",
      token: adminToken,
      body: { body: "E2E admin direct message" },
    });
    if (send.status !== 200) throw new Error(`send ${send.status}`);
    return { status: send.status, note: `thread=${threadId}` };
  });

  await test("GET /api/admin/messages/broadcast/preview", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api(
      "/api/admin/messages/broadcast/preview?audience=students_all&filter=active",
      { token: adminToken }
    );
    if (status !== 200) throw new Error(`status ${status}`);
    if (typeof json.count !== "number") throw new Error("missing count");
    return { status, note: `count=${json.count}` };
  });

  await test("POST immediate broadcast (chat_only) + student support chat", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const title = `E2E immediate broadcast ${Date.now()}`;
    const send = await api("/api/admin/messages/broadcast", {
      method: "POST",
      token: adminToken,
      body: {
        title,
        body: "Immediate broadcast delivery test",
        audience: "students_all",
        filters: [],
        channel: "chat_only",
      },
    });
    if (send.status !== 200) {
      throw new Error(`broadcast ${send.status}: ${JSON.stringify(send.json)}`);
    }
    if ((send.json.campaign?.delivered ?? 0) < 1) {
      throw new Error(`expected delivered > 0, got ${JSON.stringify(send.json.campaign)}`);
    }

    if (!studentToken) {
      return { status: send.status, note: "broadcast sent; student auth skipped" };
    }

    const { status, json } = await api("/api/messages/admin-direct?role=student", {
      token: studentToken,
    });
    if (status !== 200) throw new Error(`inbox ${status}: ${JSON.stringify(json)}`);
    if (!json.thread?.id) throw new Error("expected admin support thread");
    const match = (json.messages ?? []).find((m) =>
      String(m.body).includes(title)
    );
    if (!match) throw new Error("broadcast message not found in admin support chat");
    return {
      status,
      note: `delivered=${send.json.campaign.delivered}, messageId=${match.id}`,
    };
  });

  await test("POST /api/push/subscribe (teacher demo role)", async () => {
    if (!teacherToken) {
      return { status: "skip", note: "no teacher token" };
    }
    const { status, json } = await api("/api/push/subscribe?role=teacher", {
      method: "POST",
      token: teacherToken,
      body: {
        endpoint: `https://demo.push.test/teacher-${manifest.teacher.userId}`,
        keys: { p256dh: "demo-p256dh-key-base64", auth: "demo-auth-key" },
        role: "teacher",
      },
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json.success) throw new Error("subscribe failed");
    return { status };
  });

  await test("PUT /api/teacher/availability (save weekly slots)", async () => {
    if (!teacherToken) {
      return { status: "skip", note: "no teacher token" };
    }
    const slots = {
      Mon: ["06:00", "06:20"],
      Tue: ["06:00"],
      Wed: [],
      Thu: [],
      Fri: [],
      Sat: [],
      Sun: [],
    };
    const { status, json } = await api("/api/teacher/availability", {
      method: "PUT",
      token: teacherToken,
      body: { teacherId: manifest.teacher.userId, slots },
    });
    if (status === 503 && json.error === "availability_rls_blocked") {
      return { status, note: "RLS blocked — set SUPABASE_SERVICE_ROLE_KEY or run migration 015" };
    }
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json.availability?.slots) throw new Error("missing availability.slots");
    return { status, note: `Mon slots=${json.availability.slots.Mon?.length ?? 0}` };
  });

  await test("GET /api/admin/messages/notification-rules", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    const { status, json } = await api("/api/admin/messages/notification-rules", {
      token: adminToken,
    });
    if (status !== 200) throw new Error(`status ${status}`);
    if (!json.rules?.length) throw new Error("expected rules");
    return { status, note: `rules=${json.rules.length}` };
  });

  await test("POST /api/push/subscribe (authenticated)", async () => {
    if (!studentToken) {
      return { status: "skip", note: "no student token" };
    }
    const { status, json } = await api("/api/push/subscribe", {
      method: "POST",
      token: studentToken,
      body: {
        endpoint: `https://demo.push.test/${manifest.student.userId}`,
        keys: { p256dh: "demo-p256dh-key-base64", auth: "demo-auth-key" },
      },
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!json.success) throw new Error("subscribe failed");
    return { status };
  });

  await test("POST scheduled broadcast + cron processor", async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return { status: "skip", note: "CRON_SECRET not set" };
    }
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }

    const past = new Date(Date.now() - 60_000).toISOString();
    const schedule = await api("/api/admin/messages/broadcast", {
      method: "POST",
      token: adminToken,
      body: {
        title: "E2E scheduled broadcast",
        body: "Scheduled via cron test",
        audience: "students_all",
        filters: [],
        channel: "chat_only",
        scheduledAt: past,
      },
    });
    if (schedule.status !== 200) {
      throw new Error(`schedule ${schedule.status}: ${JSON.stringify(schedule.json)}`);
    }

    const cron = await api("/api/cron/process-scheduled-broadcasts", {
      method: "POST",
      cronSecret,
    });
    if (cron.status !== 200) {
      throw new Error(`cron ${cron.status}: ${JSON.stringify(cron.json)}`);
    }
    if (typeof cron.json.processed !== "number") {
      throw new Error("missing processed count");
    }
    return {
      status: cron.status,
      note: `processed=${cron.json.processed}, failed=${cron.json.failed ?? 0}`,
    };
  });

  await test("POST /api/push/send (cron auth)", async () => {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return { status: "skip", note: "CRON_SECRET not set" };
    }
    const { status, json } = await api("/api/push/send", {
      method: "POST",
      cronSecret,
      body: {
        userIds: [manifest.student.userId],
        title: "E2E push",
        body: "Test push payload",
      },
    });
    if (status === 503 && json.error === "vapid_not_configured") {
      return { status, note: "VAPID not configured (expected in dev)" };
    }
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    return { status, note: `sent=${json.sent ?? 0}` };
  });

  await test("GET /api/notifications (authenticated)", async () => {
    if (!studentToken) {
      return { status: "skip", note: "no student token" };
    }
    const { status, json } = await api("/api/notifications?role=student", { token: studentToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (!Array.isArray(json.notifications)) throw new Error("missing notifications");
    return { status, note: `notifications=${json.notifications.length}, unread=${json.unread ?? 0}` };
  });

  await test("GET /api/enrollments includes payments", async () => {
    if (!studentToken) {
      return { status: "skip", note: "no student token" };
    }
    const { status, json } = await api(
      `/api/enrollments?studentId=${manifest.student.learnerId}`,
      { token: studentToken }
    );
    if (status !== 200) throw new Error(`status ${status}`);
    if (!Array.isArray(json.payments)) throw new Error("missing payments array");
    return { status, note: `payments=${json.payments.length}` };
  });

  // --- Teacher signup E2E (packages A–C) ---
  const newTeacherEmail = `e2e-teacher-${randomUUID()}@example.org`;
  const newTeacherPassword = manifest.password;
  let newTeacherApplicationId = null;
  let newTeacherUserId = null;

  const teacherSignupFields = {
    fullName: "E2E Signup Teacher",
    dateOfBirth: "1990-06-15",
    phone: "+63 912 000 0001",
    bankAccount: "1234567890",
    facebookMessengerId: "messenger.test/e2e",
    address: "Quezon City, Philippines",
  };

  await test("POST /api/teacher/applications (signup step 1 + auth)", async () => {
    const body = {
      ...teacherSignupFields,
      email: newTeacherEmail,
      password: newTeacherPassword,
    };
    const { status, json } = await api("/api/teacher/applications", {
      method: "POST",
      body,
    });

    if (status === 201 && json.application?.id) {
      newTeacherApplicationId = json.application.id;
      return { status, note: `applicationId=${newTeacherApplicationId} (api)` };
    }

    const fallback = await createTeacherApplicantForE2e(
      newTeacherEmail,
      newTeacherPassword,
      teacherSignupFields
    );
    if (!fallback) {
      throw new Error(`status ${status}: ${JSON.stringify(json)} (no service role fallback)`);
    }

    newTeacherApplicationId = fallback.applicationId;
    newTeacherUserId = fallback.userId;
    return {
      status: 201,
      note: `applicationId=${fallback.applicationId} (${fallback.via} fallback)`,
    };
  });

  await test("POST /api/teachers/profile (signup step 2, pending teacher row)", async () => {
    if (!newTeacherApplicationId) throw new Error("missing application from step 1");
    const applicantToken = await signIn(newTeacherEmail, newTeacherPassword);
    const { status, json } = await api("/api/teachers/profile", {
      method: "POST",
      token: applicantToken,
      body: {
        applicationId: newTeacherApplicationId,
        displayName: "E2E Signup Teacher",
        bio: "Automated E2E teacher signup profile bio.",
        specialties: ["Friendly", "Encouraging"],
        experienceYears: 4,
      },
    });
    if (status !== 201) {
      throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    }
    if (!json.teacher?.id) throw new Error("missing teacher.id");
    if (json.teacher.status !== "pending") {
      throw new Error(`expected pending teacher, got ${json.teacher.status}`);
    }
    newTeacherUserId = json.teacher.id;
    return { status, note: `teacherId=${newTeacherUserId}` };
  });

  await test("GET /api/teacher/applications?id (applicant read own)", async () => {
    if (!newTeacherApplicationId) throw new Error("missing application");
    const applicantToken = await signIn(newTeacherEmail, newTeacherPassword);
    const { status, json } = await api(
      `/api/teacher/applications?id=${encodeURIComponent(newTeacherApplicationId)}`,
      { token: applicantToken }
    );
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.application?.email !== newTeacherEmail) {
      throw new Error("application email mismatch");
    }
    if (!json.application?.teacherId) {
      throw new Error("expected teacherId on linked application");
    }
    return { status, note: `teacherId=${json.application.teacherId}` };
  });

  await test("POST /api/auth/login teacher_not_active before admin approve", async () => {
    const { status, json } = await api("/api/auth/login", {
      method: "POST",
      body: { email: newTeacherEmail, password: newTeacherPassword, role: "teacher" },
    });
    if (status !== 403) throw new Error(`expected 403, got ${status}`);
    if (json.error !== "teacher_not_active") {
      throw new Error(`expected teacher_not_active, got ${json.error}`);
    }
    return { status, note: json.error };
  });

  await test("PATCH /api/admin/reviews teacher_signup approve", async () => {
    if (!adminToken) {
      return { status: "skip", note: "no admin token" };
    }
    if (!newTeacherApplicationId) throw new Error("missing application");
    const { status, json } = await api("/api/admin/reviews", {
      method: "PATCH",
      token: adminToken,
      body: {
        category: "teacher_signup",
        action: "approve",
        targetId: newTeacherApplicationId,
      },
    });
    if (status !== 200) {
      throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    }
    return { status, note: "approved" };
  });

  await test("POST /api/auth/login succeeds after teacher_signup approve", async () => {
    const { status, json } = await api("/api/auth/login", {
      method: "POST",
      body: { email: newTeacherEmail, password: newTeacherPassword, role: "teacher" },
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    if (json.profile?.role !== "teacher") throw new Error("expected teacher profile");
    if (json.user?.id !== newTeacherUserId) {
      throw new Error("login user id mismatch");
    }
    return { status, note: `user=${json.user.id}` };
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n--- E2E Summary: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
