/**
 * Refresh demo relational data via sign-in (requires migration 007).
 * Run: npx supabase db push  then  node scripts/seed-demo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = resolve(__dirname, "seed-manifest.json");

/** Stable IDs from supabase/migrations/007_demo_seed.sql */
export const DEMO_IDS = {
  teacherUserId: "a0000001-0000-4000-8000-000000000001",
  studentUserId: "a0000002-0000-4000-8000-000000000002",
  learnerId: "a0000003-0000-4000-8000-000000000003",
  adminUserId: "a0000004-0000-4000-8000-000000000004",
  activeEnrollmentId: "a0000010-0000-4000-8000-000000000010",
  pendingEnrollmentId: "a0000011-0000-4000-8000-000000000011",
  completedLessonId: "a0000020-0000-4000-8000-000000000020",
  scheduledLessonId: "a0000021-0000-4000-8000-000000000021",
  chatRoomId: "a0000030-0000-4000-8000-000000000030",
};

const DEMO_PASSWORD = "DemoPass123!";
const DEMO = {
  studentEmail: "demo-student@example.org",
  teacherEmail: "demo-teacher@example.org",
  adminEmail: "demo-admin@example.org",
  teacherName: "Sarah Mitchell",
};

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

async function signIn(url, anonKey, email) {
  const tokenUrl = `${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password: DEMO_PASSWORD }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(
      `signIn ${email} failed: ${json.msg ?? json.error_description ?? json.error ?? res.status}\n→ Run: npx supabase db push`
    );
  }
  return json.access_token;
}

async function resetScheduledLesson(url, anonKey, teacherToken) {
  const db = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${teacherToken}` } },
  });
  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + 1);
  const y = scheduledAt.getFullYear();
  const m = String(scheduledAt.getMonth() + 1).padStart(2, "0");
  const d = String(scheduledAt.getDate()).padStart(2, "0");
  const scheduledAtIso = `${y}-${m}-${d}T10:00:00+09:00`;

  const { data: lessonRows, error: lessonError } = await db.from("lessons").upsert({
    id: DEMO_IDS.scheduledLessonId,
    enrollment_id: DEMO_IDS.activeEnrollmentId,
    teacher_id: DEMO_IDS.teacherUserId,
    student_id: DEMO_IDS.learnerId,
    scheduled_at: scheduledAtIso,
    duration_minutes: 20,
    status: "scheduled",
    is_trial: false,
    student_absent: false,
    completed_at: null,
  }, { onConflict: "id" }).select("id, status");
  if (lessonError) {
    throw new Error(`lesson upsert failed: ${lessonError.message}`);
  }
  if (!lessonRows?.length) {
    throw new Error("lesson upsert returned no rows — check RLS policies");
  }

  const { error: enrollmentError } = await db
    .from("enrollments")
    .update({ status: "pending_payment", payment_status: "reported" })
    .eq("id", DEMO_IDS.pendingEnrollmentId);
  if (enrollmentError) {
    throw new Error(`enrollment reset failed: ${enrollmentError.message}`);
  }

  const { error: activeEnrollmentError } = await db
    .from("enrollments")
    .update({ sessions_completed: 1, sessions_remaining: 1 })
    .eq("id", DEMO_IDS.activeEnrollmentId);
  if (activeEnrollmentError) {
    throw new Error(`active enrollment sync failed: ${activeEnrollmentError.message}`);
  }
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Missing NEXT_PUBLIC_SUPABASE_* in .env.local");

  console.log("Signing in demo users (migration 007)…");
  let studentToken;
  let teacherToken;
  let adminToken;
  try {
    studentToken = await signIn(url, anonKey, DEMO.studentEmail);
    teacherToken = await signIn(url, anonKey, DEMO.teacherEmail);
    adminToken = await signIn(url, anonKey, DEMO.adminEmail);
    console.log("Resetting lesson / pending enrollment for repeatable E2E…");
    await resetScheduledLesson(url, anonKey, teacherToken);
  } catch (error) {
    console.warn(
      "Auth sign-in skipped:",
      error instanceof Error ? error.message : error
    );
    console.warn("Write tests using static manifest IDs will still run.");
  }

  const manifest = {
    seededAt: new Date().toISOString(),
    password: DEMO_PASSWORD,
    authAvailable: Boolean(studentToken && teacherToken && adminToken),
    student: {
      email: DEMO.studentEmail,
      userId: DEMO_IDS.studentUserId,
      learnerId: DEMO_IDS.learnerId,
    },
    teacher: {
      email: DEMO.teacherEmail,
      userId: DEMO_IDS.teacherUserId,
      displayName: DEMO.teacherName,
    },
    admin: {
      email: DEMO.adminEmail,
      userId: DEMO_IDS.adminUserId,
    },
    activeEnrollmentId: DEMO_IDS.activeEnrollmentId,
    pendingEnrollmentId: DEMO_IDS.pendingEnrollmentId,
    completedLessonId: DEMO_IDS.completedLessonId,
    scheduledLessonId: DEMO_IDS.scheduledLessonId,
    chatRoomId: DEMO_IDS.chatRoomId,
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log("\n✓ Demo seed ready");
  console.log(`  Student: ${DEMO.studentEmail} / ${DEMO_PASSWORD}`);
  console.log(`  Teacher: ${DEMO.teacherEmail} / ${DEMO_PASSWORD}`);
  console.log(`  Admin:   ${DEMO.adminEmail} / ${DEMO_PASSWORD}`);
  console.log(`  Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error("Seed failed:", err.message ?? err);
  process.exit(1);
});
