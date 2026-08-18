/**
 * Renewal window unit tests + optional live API checks.
 * Run: node scripts/test-renewal-window.mjs [baseUrl]
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://localhost:3000";
const PASSWORD = "DemoPass123!";
const HOLD_HOURS = 15;
const STUDENT_HOURS = 12;

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

function addHours(from, hours) {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

function e2eId(n) {
  return `b0000001-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function applyWindowFromLastEnd(lastEnd, now) {
  const studentDeadline = addHours(lastEnd, STUDENT_HOURS);
  const holdDeadline = addHours(lastEnd, HOLD_HOURS);
  if (now <= studentDeadline) {
    return { status: "open", canStudentApply: true, canStudentReport: true, canAdminActivate: true };
  }
  if (now <= holdDeadline) {
    return { status: "student_closed", canStudentApply: false, canStudentReport: false, canAdminActivate: true };
  }
  return { status: "expired", canStudentApply: false, canStudentReport: false, canAdminActivate: false };
}

function autoHoldOpen(lastEnd, now) {
  return now >= lastEnd && now <= addHours(lastEnd, HOLD_HOURS);
}

async function test(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Date.now() - start, ...detail });
    console.log(`✓ ${name} (${Date.now() - start}ms)`);
    if (detail?.note) console.log(`  ${detail.note}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, ms: Date.now() - start, error: message });
    console.log(`✗ ${name}: ${message}`);
  }
}

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
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
  return { status: res.status, json };
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
    throw new Error(`signIn ${email}: ${json.msg ?? json.error ?? res.status}`);
  }
  return json.access_token;
}

function serviceDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) throw new Error("service role env missing");
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  loadEnvLocal();
  console.log(`Renewal window tests (API base ${BASE})\n`);

  const lastEnd = new Date("2026-08-13T10:20:00+09:00");

  await test("last lesson +1h: student apply/pay and admin activate", async () => {
    const w = applyWindowFromLastEnd(lastEnd, addHours(lastEnd, 1));
    if (w.status !== "open") throw new Error(`status ${w.status}`);
    if (!w.canStudentApply || !w.canStudentReport || !w.canAdminActivate) {
      throw new Error("expected full student+admin window");
    }
    return { note: "1h after last lesson" };
  });

  await test("last lesson +13h: student closed, admin can still activate", async () => {
    const w = applyWindowFromLastEnd(lastEnd, addHours(lastEnd, 13));
    if (w.status !== "student_closed") throw new Error(`status ${w.status}`);
    if (w.canStudentApply || w.canStudentReport) throw new Error("student should be closed");
    if (!w.canAdminActivate) throw new Error("admin buffer should still be open");
    return { note: "12h student / 15h hold" };
  });

  await test("last lesson +16h: hold expired and cancelled", async () => {
    const w = applyWindowFromLastEnd(lastEnd, addHours(lastEnd, 16));
    if (w.status !== "expired") throw new Error(`status ${w.status}`);
    if (w.canStudentApply || w.canAdminActivate) throw new Error("window should be expired");
    return { note: "15h hold released" };
  });

  await test("before last lesson: student can apply; auto occupancy hold waits", async () => {
    const before = new Date(lastEnd.getTime() - 60 * 1000);
    const w = applyWindowFromLastEnd(lastEnd, before);
    if (w.status !== "open" || !w.canStudentApply) {
      throw new Error(`student apply should be open before last lesson, got ${w.status}`);
    }
    if (autoHoldOpen(lastEnd, before)) {
      throw new Error("auto occupancy hold must wait until the last class ends");
    }
    return { note: "apply window starts after lessons exist; slot auto-hold starts at last lesson end" };
  });

  let serverUp = false;
  try {
    const health = await fetch(`${BASE}/api/health`);
    serverUp = health.ok;
  } catch {
    serverUp = false;
  }

  if (!serverUp) {
    console.log("\nSkipping live API checks (dev server not reachable).");
    summarize();
    return;
  }

  let adminToken;
  let renewToken;
  let teacherToken;
  try {
    adminToken = await signIn("demo-admin@example.org", PASSWORD);
    renewToken = await signIn("e2e-student-renew@example.org", PASSWORD);
    teacherToken = await signIn("e2e-teacher-james@example.org", PASSWORD);
  } catch (error) {
    console.log(`\nSkipping live API checks (${error instanceof Error ? error.message : error}).`);
    summarize();
    return;
  }

  await test("GET /api/admin/reviews shows 한지호 auto renewal as 입금 대기 while student window open", async () => {
    const complete = await api(`/api/teacher/lessons/${e2eId(1120)}`, {
      method: "PATCH",
      token: teacherToken,
      body: { action: "mark_student_absent" },
    });
    if (complete.status !== 200) {
      throw new Error(`complete ${complete.status}: ${JSON.stringify(complete.json)}`);
    }
    const { status, json } = await api("/api/admin/reviews", { token: adminToken });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    const items = json.paymentEnrollments ?? [];
    const jiho = items.find(
      (e) =>
        e.renewedFromEnrollmentId &&
        (e.studentName?.includes("지호") || e.studentName?.includes("Jiho"))
    );
    if (!jiho) {
      throw new Error(
        `한지호 renewal missing. queue=${items.map((e) => `${e.studentName}:${e.renewedFromEnrollmentId ?? "-"}`).join("; ")}`
      );
    }
    if (jiho.renewalUnapplied) {
      throw new Error("expected 입금 대기 while student payment window is open");
    }
    if (jiho.paymentStatus !== "pending") {
      throw new Error("expected pending payment renewal offer");
    }
    return {
      note: `id=${jiho.id} badge=입금 대기 hold=${jiho.paymentDeadlineAt}`,
    };
  });

  await test("student renewal confirm clears 재수강 미신청 badge", async () => {
    const session = await api("/api/student/account", { token: renewToken });
    const learnerId = session.json?.activeLearner?.id;
    if (!learnerId) throw new Error("missing 한지호 learner");
    const listed = await api(`/api/enrollments?studentId=${learnerId}`, { token: renewToken });
    const original = (listed.json.enrollments ?? []).find(
      (e) => e.status === "completed" && e.preferredSlotTime === "10:00"
    );
    if (!original?.id) throw new Error("missing completed weekday5 enrollment");

    const confirm = await api("/api/enrollments/confirm", {
      method: "POST",
      token: renewToken,
      body: { renewFromEnrollmentId: original.id, learnerId, locale: "ko" },
    });
    if (confirm.status !== 201 && confirm.status !== 200) {
      throw new Error(`confirm ${confirm.status}: ${JSON.stringify(confirm.json)}`);
    }
    const holdId = confirm.json?.enrollment?.id;
    if (!holdId) throw new Error("missing renewal hold id");

    const reviews = await api("/api/admin/reviews", { token: adminToken });
    const item = (reviews.json.paymentEnrollments ?? []).find((e) => e.id === holdId);
    if (!item) throw new Error("renewal hold missing from admin queue");
    if (item.renewalUnapplied) {
      throw new Error(`expected 입금 대기, got renewalUnapplied (confirmedAt=${item.confirmedAt})`);
    }
    if (item.paymentStatus !== "pending") {
      throw new Error(`expected pending payment, got ${item.paymentStatus}`);
    }
    return { note: `hold=${holdId} badge=입금 대기` };
  });

  await test("한지호 enrollments show pending renewal hold without clicking 재수강", async () => {
    const session = await api("/api/student/account", { token: renewToken });
    const learnerId = session.json?.activeLearner?.id;
    if (!learnerId) throw new Error("missing 한지호 learner");
    const { status, json } = await api(`/api/enrollments?studentId=${learnerId}`, {
      token: renewToken,
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    const hold = (json.enrollments ?? []).find(
      (e) => e.status === "pending_payment" && e.renewedFromEnrollmentId
    );
    if (!hold) throw new Error("expected auto-created pending renewal hold");
    const completed = (json.enrollments ?? []).find((e) => e.id === hold.renewedFromEnrollmentId);
    if (!completed) throw new Error("completed parent enrollment missing");
    if (completed.endDate >= hold.startDate) {
      throw new Error(
        `renewal periods overlap: completed=${completed.startDate}..${completed.endDate}, ` +
          `hold=${hold.startDate}..${hold.endDate}`
      );
    }
    const teacherLessons = await serviceDb()
      .from("lessons")
      .select("scheduled_at, duration_minutes, teacher_id, status")
      .eq("enrollment_id", completed.id)
      .order("scheduled_at", { ascending: true });
    if (teacherLessons.error) throw teacherLessons.error;
    if ((teacherLessons.data ?? []).length !== completed.sessionsTotal) {
      throw new Error(
        `teacher schedule mismatch: expected ${completed.sessionsTotal}, got ${teacherLessons.data?.length ?? 0}`
      );
    }
    if ((teacherLessons.data ?? []).some((lesson) => lesson.teacher_id !== completed.teacherId)) {
      throw new Error("teacher schedule points to a different teacher");
    }
    const holdStart = new Date(new Date(hold.paymentDeadlineAt).getTime() - HOLD_HOURS * 3600 * 1000);
    const lastLesson = teacherLessons.data.at(-1);
    const expectedHoldStart = new Date(
      new Date(lastLesson.scheduled_at).getTime() + lastLesson.duration_minutes * 60 * 1000
    );
    if (Math.abs(holdStart.getTime() - expectedHoldStart.getTime()) > 1000) {
      throw new Error(
        `hold must start at last lesson end: expected=${expectedHoldStart.toISOString()} ` +
          `actual=${holdStart.toISOString()}`
      );
    }
    return {
      note:
        `completed=${completed.startDate}..${completed.endDate} -> ` +
        `hold=${hold.startDate}..${hold.endDate}; teacherLessons=${teacherLessons.data.length}`,
    };
  });

  await test("한지호 completed course hides 재수강 while renewal is pending approval", async () => {
    const session = await api("/api/student/account", { token: renewToken });
    const learnerId = session.json?.activeLearner?.id;
    if (!learnerId) throw new Error("missing 한지호 learner");
    const { status, json } = await api(`/api/enrollments?studentId=${learnerId}`, {
      token: renewToken,
    });
    if (status !== 200) throw new Error(`status ${status}: ${JSON.stringify(json)}`);
    const completed = (json.enrollments ?? []).find(
      (e) => e.status === "completed" && e.preferredSlotTime === "10:00"
    );
    if (!completed?.id) throw new Error("missing completed weekday5 enrollment");
    if (completed.canStudentRenew) {
      throw new Error(
        `expected no canStudentRenew while renewal is pending approval, got ${JSON.stringify(completed)}`
      );
    }
    return { note: `completed=${completed.id.slice(0, 8)} canStudentRenew=false` };
  });

  const db = serviceDb();
  const IDS = {
    james: "b0000001-0000-4000-8000-000000000001",
    lFresh: "b0000001-0000-4000-8000-0000000000c9",
    fresh: "b0000001-0000-4000-8000-000000000065",
  };

  const { data: plan } = await db
    .from("pricing_plans")
    .select("id, price_krw, sessions_count, plan_type")
    .eq("plan_type", "weekday5_20min")
    .maybeSingle();
  if (!plan?.id) {
    console.log("Skipping isolated DB/API cases (no pricing plan).");
    summarize();
    return;
  }

  async function cleanup(ids) {
    const enrollmentIds = [ids.offer, ids.enrollment].filter(Boolean);
    if (enrollmentIds.length) {
      await db.from("finance_transactions").delete().in("enrollment_id", enrollmentIds);
      await db.from("payments").delete().in("enrollment_id", enrollmentIds);
      await db.from("lessons").delete().in("enrollment_id", enrollmentIds);
    }
    if (ids.lesson) await db.from("lessons").delete().eq("id", ids.lesson);
    if (ids.offer) await db.from("enrollments").delete().eq("id", ids.offer);
    if (ids.enrollment) await db.from("enrollments").delete().eq("id", ids.enrollment);
  }

  const leftover = await db
    .from("enrollments")
    .select("id")
    .eq("student_id", IDS.lFresh)
    .eq("status", "pending_payment");
  for (const row of leftover.data ?? []) {
    await cleanup({ offer: row.id });
  }

  await test("student can renew before the last lesson and admin extends the schedule", async () => {
    const enrollmentId = randomUUID();
    const lessonId = randomUUID();
    const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
      new Date(Date.now() + 3 * 86400000)
    );
    const futureAt = `${dateKey}T11:20:00+09:00`;
    const insertEn = await db.from("enrollments").insert({
      id: enrollmentId,
      student_id: IDS.lFresh,
      teacher_id: IDS.james,
      plan_id: plan.id,
      status: "active",
      payment_status: "confirmed",
      currency: "KRW",
      total_amount: plan.price_krw,
      sessions_total: 4,
      sessions_completed: 0,
      sessions_remaining: 4,
      curriculum: "Early renewal test",
      preferred_slot_time: "11:20",
      preferred_slot_day: "Mon",
    });
    if (insertEn.error) throw new Error(`enrollment insert: ${insertEn.error.message}`);
    const insertLesson = await db.from("lessons").insert({
      id: lessonId,
      enrollment_id: enrollmentId,
      teacher_id: IDS.james,
      student_id: IDS.lFresh,
      scheduled_at: futureAt,
      duration_minutes: 20,
      status: "scheduled",
      is_trial: false,
    });
    if (insertLesson.error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw new Error(`lesson insert: ${insertLesson.error.message}`);
    }

    let holdId;
    try {
      const freshToken = await signIn("e2e-student-fresh@example.org", PASSWORD);
      const listed = await api(`/api/enrollments?studentId=${IDS.lFresh}`, { token: freshToken });
      const originalRow = (listed.json.enrollments ?? []).find((e) => e.id === enrollmentId);
      if (!originalRow?.canStudentRenew) {
        throw new Error(
          `expected canStudentRenew before last lesson, got ${JSON.stringify(originalRow)}`
        );
      }
      const confirm = await api("/api/enrollments/confirm", {
        method: "POST",
        token: freshToken,
        body: { renewFromEnrollmentId: enrollmentId, learnerId: IDS.lFresh, locale: "ko" },
      });
      if (confirm.status !== 201 && confirm.status !== 200) {
        throw new Error(`confirm ${confirm.status}: ${JSON.stringify(confirm.json)}`);
      }
      holdId = confirm.json?.enrollment?.id;
      if (!holdId) throw new Error("missing renewal hold id");
      if (confirm.json.enrollment.renewedFromEnrollmentId !== enrollmentId) {
        throw new Error(
          `confirm returned unrelated hold ${holdId} from ${confirm.json.enrollment.renewedFromEnrollmentId}`
        );
      }
      const deadline = new Date(confirm.json.enrollment.paymentDeadlineAt).getTime();
      const expectedHoldEnd = new Date(futureAt).getTime() + 20 * 60 * 1000 + HOLD_HOURS * 3600000;
      if (Math.abs(deadline - expectedHoldEnd) > 2 * 60 * 1000) {
        throw new Error(
          `early renewal deadline should be last-lesson-end+15h, got ${confirm.json.enrollment.paymentDeadlineAt}`
        );
      }

      const listedAfterConfirm = await api(`/api/enrollments?studentId=${IDS.lFresh}`, {
        token: freshToken,
      });
      const originalAfterConfirm = (listedAfterConfirm.json.enrollments ?? []).find(
        (e) => e.id === enrollmentId
      );
      if (originalAfterConfirm?.canStudentRenew) {
        throw new Error(
          `active course should hide canStudentRenew while renewal is pending approval, got ${JSON.stringify(originalAfterConfirm)}`
        );
      }

      const activate = await api("/api/admin/reviews", {
        method: "PATCH",
        token: adminToken,
        body: {
          category: "payment_activation",
          action: "activate",
          targetId: holdId,
        },
      });
      if (activate.status !== 200) {
        throw new Error(`activate ${activate.status}: ${JSON.stringify(activate.json)}`);
      }

      const { data: original } = await db
        .from("enrollments")
        .select("status, sessions_total, sessions_remaining, started_at, ended_at, teacher_id")
        .eq("id", enrollmentId)
        .maybeSingle();
      const { data: holdRow } = await db
        .from("enrollments")
        .select("status, cancel_reason, sessions_total, sessions_remaining, renewed_from_enrollment_id, started_at, ended_at, teacher_id")
        .eq("id", holdId)
        .maybeSingle();
      const added = plan.sessions_count ?? 20;
      if (original?.status !== "active") {
        throw new Error(`original should stay active, got ${JSON.stringify({ original, holdRow })}`);
      }
      if ((original?.sessions_total ?? 0) !== 4) {
        throw new Error(`original sessions should stay unchanged: ${JSON.stringify({ original, holdRow })}`);
      }
      if (holdRow?.status !== "active") {
        throw new Error(`renewal should activate as its own enrollment: ${JSON.stringify({ original, holdRow })}`);
      }
      if (holdRow?.cancel_reason === "merged_into_original") {
        throw new Error("renewal should not merge into original");
      }
      if ((holdRow?.sessions_total ?? 0) !== added) {
        throw new Error(`renewal enrollment should have ${added} sessions: ${JSON.stringify({ original, holdRow })}`);
      }
      if (!holdRow?.started_at || futureAt >= holdRow.started_at) {
        throw new Error(
          `renewal contract overlaps the parent's last lesson: ${JSON.stringify({ futureAt, original, holdRow })}`
        );
      }
      if (holdRow.teacher_id !== original.teacher_id) {
        throw new Error(`renewal teacher changed unexpectedly: ${JSON.stringify({ original, holdRow })}`);
      }

      const { data: renewalLessons, count: renewalFutureCount } = await db
        .from("lessons")
        .select("id, scheduled_at, teacher_id", { count: "exact" })
        .eq("enrollment_id", holdId)
        .eq("status", "scheduled")
        .order("scheduled_at", { ascending: true });
      if ((renewalFutureCount ?? 0) < 2) {
        throw new Error(`expected renewal scheduled lessons, got ${renewalFutureCount}`);
      }
      if ((renewalLessons ?? []).some((lesson) => lesson.teacher_id !== holdRow.teacher_id)) {
        throw new Error("renewal lessons are connected to a different teacher");
      }
      if (renewalLessons?.[0]?.scheduled_at < holdRow.started_at) {
        throw new Error(`teacher schedule starts before renewal contract: ${JSON.stringify({ holdRow, first: renewalLessons[0] })}`);
      }

      const listedAfterActivate = await api(`/api/enrollments?studentId=${IDS.lFresh}`, {
        token: freshToken,
      });
      const originalListed = (listedAfterActivate.json.enrollments ?? []).find(
        (e) => e.id === enrollmentId
      );
      const renewalListed = (listedAfterActivate.json.enrollments ?? []).find((e) => e.id === holdId);
      if (originalListed?.canStudentRenew) {
        throw new Error(
          `original should hide canStudentRenew once renewal is active, got ${JSON.stringify(originalListed)}`
        );
      }
      if (!renewalListed?.canStudentRenew) {
        throw new Error(
          `renewal active course should allow next early renewal, got ${JSON.stringify(renewalListed)}`
        );
      }

      await cleanup({ enrollment: enrollmentId, lesson: lessonId, offer: holdId });
      return {
        note: `original ${original.sessions_remaining}/${original.sessions_total}, renewal ${holdRow.sessions_remaining}/${holdRow.sessions_total}`,
      };
    } catch (error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId, offer: holdId });
      throw error;
    }
  });

  await test("admin can activate renewal without student 재수강/입금 신고 (within 15h)", async () => {
    const enrollmentId = randomUUID();
    const lessonId = randomUUID();
    const lastStart = new Date(Date.now() - 90 * 60 * 1000);
    const insertEn = await db.from("enrollments").insert({
      id: enrollmentId,
      student_id: IDS.lFresh,
      teacher_id: IDS.james,
      plan_id: plan.id,
      status: "completed",
      payment_status: "confirmed",
      currency: "KRW",
      total_amount: plan.price_krw,
      sessions_total: plan.sessions_count ?? 8,
      sessions_completed: plan.sessions_count ?? 8,
      sessions_remaining: 0,
      curriculum: "Renewal window test",
      preferred_slot_time: "11:20",
      preferred_slot_day: "Mon",
    });
    if (insertEn.error) throw new Error(`enrollment insert: ${insertEn.error.message}`);
    const insertLesson = await db.from("lessons").insert({
      id: lessonId,
      enrollment_id: enrollmentId,
      teacher_id: IDS.james,
      student_id: IDS.lFresh,
      scheduled_at: lastStart.toISOString(),
      duration_minutes: 20,
      status: "scheduled",
      is_trial: false,
      completed_at: null,
    });
    if (insertLesson.error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw new Error(`lesson insert: ${insertLesson.error.message}`);
    }

    try {
      const complete = await api(`/api/teacher/lessons/${lessonId}`, {
        method: "PATCH",
        token: teacherToken,
        body: { action: "mark_student_absent" },
      });
      if (complete.status !== 200) {
        throw new Error(`complete ${complete.status}: ${JSON.stringify(complete.json)}`);
      }
      const reviews = await api("/api/admin/reviews", { token: adminToken });
      if (reviews.status !== 200) {
        throw new Error(`reviews ${reviews.status}: ${JSON.stringify(reviews.json)}`);
      }
      const offer = (reviews.json.paymentEnrollments ?? []).find(
        (e) => e.renewedFromEnrollmentId === enrollmentId
      );
      if (!offer) throw new Error("auto renewal offer not in admin payment queue");
      if (offer.depositorName) throw new Error("offer should have no student payment report");

      const activate = await api("/api/admin/reviews", {
        method: "PATCH",
        token: adminToken,
        body: {
          category: "payment_activation",
          action: "activate",
          targetId: offer.id,
        },
      });
      if (activate.status !== 200) {
        throw new Error(`activate ${activate.status}: ${JSON.stringify(activate.json)}`);
      }
      const { data: confirmed } = await db
        .from("enrollments")
        .select("status, payment_status")
        .eq("id", offer.id)
        .maybeSingle();
      if (confirmed?.status !== "active" || confirmed?.payment_status !== "confirmed") {
        throw new Error(`expected active/confirmed, got ${JSON.stringify(confirmed)}`);
      }
      await cleanup({
        enrollment: enrollmentId,
        lesson: lessonId,
        offer: offer.id,
      });
      return { note: `activated ${offer.id} without student click` };
    } catch (error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw error;
    }
  });

  await test("student cannot report after 12h; admin can activate until 15h", async () => {
    const enrollmentId = randomUUID();
    const lessonId = randomUUID();
    const lastStart = new Date(Date.now() - (13 * 60 + 20) * 60 * 1000);
    const insertEn = await db.from("enrollments").insert({
      id: enrollmentId,
      student_id: IDS.lFresh,
      teacher_id: IDS.james,
      plan_id: plan.id,
      status: "completed",
      payment_status: "confirmed",
      currency: "KRW",
      total_amount: plan.price_krw,
      sessions_total: plan.sessions_count ?? 8,
      sessions_completed: plan.sessions_count ?? 8,
      sessions_remaining: 0,
      curriculum: "Renewal 13h window test",
      preferred_slot_time: "11:20",
      preferred_slot_day: "Tue",
    });
    if (insertEn.error) throw new Error(`enrollment insert: ${insertEn.error.message}`);
    const insertLesson = await db.from("lessons").insert({
      id: lessonId,
      enrollment_id: enrollmentId,
      teacher_id: IDS.james,
      student_id: IDS.lFresh,
      scheduled_at: lastStart.toISOString(),
      duration_minutes: 20,
      status: "scheduled",
      is_trial: false,
      completed_at: null,
    });
    if (insertLesson.error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw new Error(`lesson insert: ${insertLesson.error.message}`);
    }

    let freshToken;
    try {
      freshToken = await signIn("e2e-student-fresh@example.org", PASSWORD);
      const complete = await api(`/api/teacher/lessons/${lessonId}`, {
        method: "PATCH",
        token: teacherToken,
        body: { action: "mark_student_absent" },
      });
      if (complete.status !== 200) {
        throw new Error(`complete ${complete.status}: ${JSON.stringify(complete.json)}`);
      }
      const reviews = await api("/api/admin/reviews", { token: adminToken });
      const offer = (reviews.json.paymentEnrollments ?? []).find(
        (e) => e.renewedFromEnrollmentId === enrollmentId
      );
      if (!offer) throw new Error("13h offer missing from admin queue");

      const report = await api("/api/enrollments", {
        method: "POST",
        token: freshToken,
        body: { enrollmentId: offer.id, depositorName: "박서연", learnerId: IDS.lFresh },
      });
      if (report.status !== 409 || report.json?.error !== "payment_deadline_passed") {
        throw new Error(`expected 409 payment_deadline_passed, got ${report.status} ${JSON.stringify(report.json)}`);
      }

      const activate = await api("/api/admin/reviews", {
        method: "PATCH",
        token: adminToken,
        body: {
          category: "payment_activation",
          action: "activate",
          targetId: offer.id,
        },
      });
      if (activate.status !== 200) {
        throw new Error(`admin activate ${activate.status}: ${JSON.stringify(activate.json)}`);
      }
      await cleanup({ enrollment: enrollmentId, lesson: lessonId, offer: offer.id });
      return { note: "12h student blocked, 15h admin activate ok" };
    } catch (error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw error;
    }
  });

  await test("after 15h the hold is gone and student cannot apply", async () => {
    const enrollmentId = randomUUID();
    const lessonId = randomUUID();
    const lastStart = new Date(Date.now() - (16 * 60 + 20) * 60 * 1000);
    const insertEn = await db.from("enrollments").insert({
      id: enrollmentId,
      student_id: IDS.lFresh,
      teacher_id: IDS.james,
      plan_id: plan.id,
      status: "completed",
      payment_status: "confirmed",
      currency: "KRW",
      total_amount: plan.price_krw,
      sessions_total: plan.sessions_count ?? 8,
      sessions_completed: plan.sessions_count ?? 8,
      sessions_remaining: 0,
      curriculum: "Renewal 16h window test",
      preferred_slot_time: "11:20",
      preferred_slot_day: "Wed",
    });
    if (insertEn.error) throw new Error(`enrollment insert: ${insertEn.error.message}`);
    const insertLesson = await db.from("lessons").insert({
      id: lessonId,
      enrollment_id: enrollmentId,
      teacher_id: IDS.james,
      student_id: IDS.lFresh,
      scheduled_at: lastStart.toISOString(),
      duration_minutes: 20,
      status: "completed",
      is_trial: false,
      completed_at: new Date(lastStart.getTime() + 20 * 60 * 1000).toISOString(),
    });
    if (insertLesson.error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw new Error(`lesson insert: ${insertLesson.error.message}`);
    }

    try {
      const freshToken = await signIn("e2e-student-fresh@example.org", PASSWORD);
      const reviews = await api("/api/admin/reviews", { token: adminToken });
      const offer = (reviews.json.paymentEnrollments ?? []).find(
        (e) => e.renewedFromEnrollmentId === enrollmentId
      );
      if (offer) throw new Error("16h offer should not stay in admin queue");

      const confirm = await api("/api/enrollments/confirm", {
        method: "POST",
        token: freshToken,
        body: { renewFromEnrollmentId: enrollmentId, learnerId: IDS.lFresh, locale: "ko" },
      });
      if (confirm.status !== 409) {
        throw new Error(`expected 409, got ${confirm.status} ${JSON.stringify(confirm.json)}`);
      }
      if (confirm.json?.error !== "renewal_window_closed") {
        throw new Error(`expected renewal_window_closed, got ${JSON.stringify(confirm.json)}`);
      }
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      return { note: `confirm error=${confirm.json?.error}` };
    } catch (error) {
      await cleanup({ enrollment: enrollmentId, lesson: lessonId });
      throw error;
    }
  });

  summarize();
}

function summarize() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
