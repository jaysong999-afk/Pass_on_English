/**
 * Delete rows created after demo/e2e seed (stable a000000* / b0000001-* ids).
 * Usage: node scripts/cleanup-post-seed.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(ROOT, ".env.local"), "utf8");
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

function isSeedId(id) {
  if (!id) return false;
  return id.startsWith("a00000") || id.startsWith("b0000001-");
}

async function listAll(db, table, columns) {
  const { data, error } = await db.from(table).select(columns);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data ?? [];
}

async function delByIds(db, table, ids) {
  if (ids.length === 0) return 0;
  const { error } = await db.from(table).delete().in("id", ids);
  if (error) throw new Error(`delete ${table}: ${error.message}`);
  return ids.length;
}

async function delIn(db, table, column, ids) {
  if (ids.length === 0) return;
  const { error } = await db.from(table).delete().in(column, ids);
  if (error) throw new Error(`delete ${table}.${column}: ${error.message}`);
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY required");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const [
    students,
    enrollments,
    lessons,
    payments,
    rooms,
    reviews,
    teachers,
    applications,
    profiles,
    logs,
  ] = await Promise.all([
    listAll(db, "students", "id, full_name, english_name, account_holder_id, created_at"),
    listAll(db, "enrollments", "id, student_id, teacher_id, status, preferred_slot_time, created_at"),
    listAll(db, "lessons", "id, student_id, teacher_id, enrollment_id, is_trial, scheduled_at, created_at"),
    listAll(db, "payments", "id, enrollment_id, student_id"),
    listAll(db, "chat_rooms", "id, student_id, teacher_id"),
    listAll(db, "student_registration_reviews", "id, account_email, learner_full_name"),
    listAll(db, "teachers", "id, display_name"),
    listAll(db, "teacher_applications", "id, email, full_name"),
    listAll(db, "profiles", "id, full_name, role, created_at"),
    listAll(db, "admin_review_logs", "id, target_id, target_label, at"),
  ]);

  const extraStudents = students.filter((r) => !isSeedId(r.id));
  const extraEnrollments = enrollments.filter((r) => !isSeedId(r.id));
  const extraLessons = lessons.filter((r) => !isSeedId(r.id));
  const extraPayments = payments.filter((r) => !isSeedId(r.id));
  const extraRooms = rooms.filter((r) => !isSeedId(r.id));
  const extraReviews = reviews.filter((r) => !isSeedId(r.id));
  const extraTeachers = teachers.filter((r) => !isSeedId(r.id));
  const extraApps = applications.filter((r) => !isSeedId(r.id));
  const extraProfiles = profiles.filter((r) => !isSeedId(r.id));
  const extraLogs = logs.filter((r) => !isSeedId(r.id) && !isSeedId(r.target_id));

  const extraStudentIds = extraStudents.map((r) => r.id);
  const extraEnrollmentIds = extraEnrollments.map((r) => r.id);
  const extraLessonIds = extraLessons.map((r) => r.id);
  const extraRoomIds = extraRooms.map((r) => r.id);
  const extraProfileIds = extraProfiles.map((r) => r.id);

  console.log("Post-seed rows to delete:");
  console.log("  students", extraStudents.map((s) => `${s.english_name || s.full_name} ${s.id}`));
  console.log("  enrollments", extraEnrollmentIds.length, extraEnrollments.map((e) => `${e.id} slot=${e.preferred_slot_time} status=${e.status}`));
  console.log("  lessons", extraLessonIds.length, extraLessons.map((l) => `${l.id} trial=${l.is_trial} ${l.scheduled_at}`));
  console.log("  payments", extraPayments.length);
  console.log("  chat_rooms", extraRoomIds.length);
  console.log("  registration_reviews", extraReviews.map((r) => r.account_email || r.learner_full_name));
  console.log("  teachers", extraTeachers.map((t) => t.display_name));
  console.log("  teacher_applications", extraApps.map((a) => a.email || a.full_name));
  console.log("  profiles", extraProfiles.map((p) => `${p.full_name} ${p.role} ${p.id}`));
  console.log("  admin_review_logs", extraLogs.length);

  await delIn(db, "chat_messages", "room_id", extraRoomIds);
  await delIn(db, "lesson_feedbacks", "lesson_id", extraLessonIds);
  await delIn(db, "lesson_reschedule_requests", "lesson_id", extraLessonIds);
  await delByIds(db, "lessons", extraLessonIds);
  await delIn(db, "payments", "enrollment_id", extraEnrollmentIds);
  await delIn(db, "finance_transactions", "enrollment_id", extraEnrollmentIds);
  await delByIds(db, "chat_rooms", extraRoomIds);
  await delByIds(db, "enrollments", extraEnrollmentIds);
  await delIn(db, "teacher_student_context", "student_id", extraStudentIds);
  await delIn(db, "monthly_growth_reports", "student_id", extraStudentIds);
  await delByIds(db, "student_registration_reviews", extraReviews.map((r) => r.id));
  await delIn(db, "notifications", "user_id", extraProfileIds);
  await delIn(db, "push_subscriptions", "user_id", extraProfileIds);
  await delByIds(db, "admin_review_logs", extraLogs.map((r) => r.id));
  await delIn(db, "admin_lesson_operation_logs", "lesson_id", extraLessonIds);

  const extraIdSet = new Set([...extraStudentIds, ...extraProfileIds]);
  const { data: threads, error: threadError } = await db
    .from("admin_direct_threads")
    .select("id, student_id, teacher_id");
  if (!threadError) {
    const extraThreadIds = (threads ?? [])
      .filter((t) => extraIdSet.has(t.student_id) || extraIdSet.has(t.teacher_id))
      .map((t) => t.id);
    await delIn(db, "admin_direct_messages", "thread_id", extraThreadIds);
    await delByIds(db, "admin_direct_threads", extraThreadIds);
  }
  await delByIds(db, "students", extraStudentIds);
  await delByIds(db, "teacher_applications", extraApps.map((r) => r.id));
  await delByIds(db, "teachers", extraTeachers.map((r) => r.id));

  for (const profile of extraProfiles) {
    const { error } = await admin.auth.admin.deleteUser(profile.id);
    if (error && !/not found|does not exist/i.test(error.message)) {
      console.warn(`auth delete ${profile.id}: ${error.message}`);
    }
  }
  await delByIds(db, "profiles", extraProfileIds);

  const leftover = extraProfiles.filter((p) => !extraStudentIds.includes(p.id) && p.role === "student");
  for (const p of leftover) {
    const { error } = await admin.auth.admin.deleteUser(p.id);
    if (error && !/not found|does not exist/i.test(error.message)) {
      console.warn(`auth delete leftover ${p.id}: ${error.message}`);
    }
  }

  console.log("Deleted post-seed application data.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
