/**
 * Direct Supabase RLS integration tests (JWT + anon key).
 * Prerequisites: migration 017 applied, demo users seeded.
 * Run: npm run test:rls
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
    if (detail?.note) console.log(`  ${detail.note}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ name, ok: false, ms: Date.now() - start, error: message });
    console.log(`✗ ${name}: ${message}`);
  }
}

async function signIn(url, anonKey, email, password) {
  const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(json.msg ?? json.error_description ?? json.error ?? res.status);
  }
  return json.access_token;
}

function clientForToken(url, anonKey, token) {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_* in .env.local");
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(__dirname, "seed-manifest.json"), "utf8"));
  } catch {
    throw new Error("seed-manifest.json missing — run: npm run seed:demo");
  }

  console.log("RLS integration tests (direct Supabase client)\n");

  const anon = createClient(url, anonKey);

  await test("anon can reach Supabase (pricing_plans)", async () => {
    const { data, error } = await anon.from("pricing_plans").select("id").limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("expected pricing plans");
    return { note: "connected" };
  });

  const password = manifest.password;
  let studentToken;
  let teacherToken;
  let adminToken;
  const signInErrors = [];

  for (const [label, email, setter] of [
    ["student", manifest.student.email, (t) => (studentToken = t)],
    ["teacher", manifest.teacher.email, (t) => (teacherToken = t)],
    ["admin", manifest.admin?.email, (t) => (adminToken = t)],
  ]) {
    if (!email) continue;
    try {
      const token = await signIn(url, anonKey, email, password);
      setter(token);
    } catch (error) {
      signInErrors.push(`${label}: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (!studentToken || !teacherToken) {
    throw new Error(`Auth sign-in failed — ${signInErrors.join("; ")}`);
  }
  if (signInErrors.length) {
    console.warn(`Warning: optional sign-in skipped — ${signInErrors.join("; ")}`);
  }
  const studentDb = clientForToken(url, anonKey, studentToken);
  const teacherDb = clientForToken(url, anonKey, teacherToken);
  const adminDb = clientForToken(url, anonKey, adminToken);

  await test("anon can read pricing_plans", async () => {
    const { data, error } = await anon.from("pricing_plans").select("id").limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("expected pricing plans");
    return { note: `plans=${data.length}` };
  });

  await test("anon can read active teachers", async () => {
    const { data, error } = await anon.from("teachers").select("id, status").eq("status", "active").limit(1);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("expected active teacher");
    return { note: `teacher=${data[0].id}` };
  });

  await test("anon reads only public teacher profile fields", async () => {
    const { data: publicProfile, error: publicError } = await anon
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", manifest.teacher.userId)
      .maybeSingle();
    if (publicError) throw new Error(publicError.message);
    if (!publicProfile) throw new Error("active teacher public profile is unavailable");

    const { error: privateError } = await anon
      .from("profiles")
      .select("phone")
      .eq("id", manifest.teacher.userId)
      .maybeSingle();
    if (!privateError) throw new Error("anon can select a private profile column");
    return { note: "phone blocked" };
  });

  await test("anon can read teacher availability (public)", async () => {
    const { data, error } = await anon
      .from("teachers_weekly_availability")
      .select("teacher_id")
      .eq("teacher_id", manifest.teacher.userId)
      .limit(1);
    if (error) throw new Error(error.message);
    return { note: `rows=${data?.length ?? 0}` };
  });

  await test("anon cannot read students", async () => {
    const { data, error } = await anon.from("students").select("id").limit(1);
    if (error) throw new Error(`unexpected error: ${error.message}`);
    if (data?.length) throw new Error("anon should not read students");
    return { note: "blocked" };
  });

  await test("student reads own learner profile", async () => {
    const { data, error } = await studentDb
      .from("students")
      .select("id, english_name")
      .eq("id", manifest.student.learnerId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("student cannot read own learner");
    return { note: data.english_name };
  });

  await test("student cannot promote own profile role", async () => {
    const { error: updateError } = await studentDb
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", manifest.student.userId);
    if (!updateError) throw new Error("student role update unexpectedly succeeded");

    const { data, error } = await studentDb
      .from("profiles")
      .select("role")
      .eq("id", manifest.student.userId)
      .single();
    if (error) throw new Error(error.message);
    if (data.role !== "student") throw new Error(`student role changed to ${data.role}`);
    return { note: "role remains student" };
  });

  await test("student cannot read admin_broadcasts", async () => {
    const { data, error } = await studentDb.from("admin_broadcasts").select("id").limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) throw new Error("student should not read admin_broadcasts");
    return { note: "blocked" };
  });

  await test("student reads own notifications only", async () => {
    const { data, error } = await studentDb.from("notifications").select("user_id").limit(20);
    if (error) throw new Error(error.message);
    if (data?.some((row) => row.user_id !== manifest.student.userId)) {
      throw new Error("student saw another user's notifications");
    }
    return { note: `rows=${data?.length ?? 0}` };
  });

  await test("teacher reads own availability rows", async () => {
    const { data, error } = await teacherDb
      .from("teachers_weekly_availability")
      .select("teacher_id")
      .eq("teacher_id", manifest.teacher.userId)
      .limit(5);
    if (error) throw new Error(error.message);
    return { note: `rows=${data?.length ?? 0}` };
  });

  await test("teacher cannot read or change own hourly rate directly", async () => {
    const { error: readError } = await teacherDb
      .from("teachers")
      .select("hourly_rate_php")
      .eq("id", manifest.teacher.userId)
      .single();
    if (!readError) throw new Error("teacher hourly-rate column read unexpectedly succeeded");

    const { error: updateError } = await teacherDb
      .from("teachers")
      .update({ hourly_rate_php: 999 })
      .eq("id", manifest.teacher.userId);
    if (!updateError) throw new Error("teacher hourly-rate update unexpectedly succeeded");
    return { note: "hourly_rate_php blocked" };
  });

  await test("teacher can upsert own push subscription", async () => {
    const endpoint = `https://rls.test/push/teacher-${Date.now()}`;
    const { error } = await teacherDb.from("push_subscriptions").upsert(
      {
        user_id: manifest.teacher.userId,
        endpoint,
        p256dh: "test-p256dh",
        auth: "test-auth",
      },
      { onConflict: "endpoint" }
    );
    if (error) throw new Error(error.message);
    return { note: endpoint };
  });

  await test("teacher cannot read finance_transactions", async () => {
    const { data, error } = await teacherDb.from("finance_transactions").select("id").limit(1);
    if (error) throw new Error(error.message);
    if (data?.length) throw new Error("teacher should not read finance_transactions");
    return { note: "blocked" };
  });

  await test("teacher applicant reads own application (RLS 022)", async () => {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return { note: "skip — SUPABASE_SERVICE_ROLE_KEY not set" };
    }

    const adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const testEmail = `rls-teacher-app-${Date.now()}@example.org`;
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: testEmail,
      password,
      email_confirm: true,
      user_metadata: { role: "teacher", full_name: "RLS Applicant Teacher" },
    });
    if (createError) throw new Error(createError.message);
    const userId = created.user?.id;
    if (!userId) throw new Error("missing created user id");

    const { data: application, error: appError } = await adminClient
      .from("teacher_applications")
      .insert({
        full_name: "RLS Applicant Teacher",
        date_of_birth: "1992-03-01",
        phone: "+63 900 111 2222",
        bank_account: "9999999999",
        facebook_messenger_id: "rls.test/messenger",
        address: "RLS Test City",
        email: testEmail,
        status: "pending",
      })
      .select("id, email")
      .single();
    if (appError) throw new Error(appError.message);

    const applicantToken = await signIn(url, anonKey, testEmail, password);
    const applicantDb = clientForToken(url, anonKey, applicantToken);

    const { data: ownRows, error: ownError } = await applicantDb
      .from("teacher_applications")
      .select("id, email")
      .eq("id", application.id);
    if (ownError) throw new Error(ownError.message);
    if (!ownRows?.length || ownRows[0].email !== testEmail) {
      throw new Error("applicant cannot read own application");
    }

    const { data: otherRows, error: otherError } = await applicantDb
      .from("teacher_applications")
      .select("id")
      .neq("email", testEmail)
      .limit(5);
    if (otherError) throw new Error(otherError.message);
    if (otherRows?.length) {
      throw new Error("applicant read another user's application");
    }

    await adminClient.from("teacher_applications").delete().eq("id", application.id);
    await adminClient.auth.admin.deleteUser(userId);

    return { note: `application=${application.id}` };
  });

  await test("admin reads students list", async () => {
    if (!adminToken) {
      return { note: "skip — admin not signed in (apply migration 016_demo_admin_seed.sql)" };
    }
    const { data, error } = await adminDb.from("students").select("id").limit(5);
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("admin should read students");
    return { note: `students=${data.length}` };
  });

  await test("admin reads admin_broadcasts", async () => {
    if (!adminToken) {
      return { note: "skip — admin not signed in" };
    }
    const { data, error } = await adminDb.from("admin_broadcasts").select("id").limit(1);
    if (error) throw new Error(error.message);
    return { note: `rows=${data?.length ?? 0}` };
  });

  await test("admin reads finance_transactions", async () => {
    if (!adminToken) {
      return { note: "skip — admin not signed in" };
    }
    const { data, error } = await adminDb.from("finance_transactions").select("id").limit(1);
    if (error) throw new Error(error.message);
    return { note: `rows=${data?.length ?? 0}` };
  });

  await test("student RPC reserve_teacher_availability_slots keeps hours", async () => {
    const { data: before } = await anon
      .from("teachers_weekly_availability")
      .select("day, start_time")
      .eq("teacher_id", manifest.teacher.userId)
      .eq("day", "Mon")
      .eq("start_time", "06:00:00")
      .maybeSingle();

    if (!before) {
      return { note: "skip — no Mon 06:00 slot to reserve" };
    }

    const { error } = await studentDb.rpc("reserve_teacher_availability_slots", {
      p_teacher_id: manifest.teacher.userId,
      p_slots: [{ day: "Mon", start_time: "06:00:00" }],
    });
    if (error) throw new Error(error.message);

    const { data: after } = await anon
      .from("teachers_weekly_availability")
      .select("day")
      .eq("teacher_id", manifest.teacher.userId)
      .eq("day", "Mon")
      .eq("start_time", "06:00:00")
      .maybeSingle();

    if (!after) throw new Error("availability slot was deleted by reserve");

    return { note: "Mon 06:00 still present after reserve" };
  });

  await test("production RLS policies present", async () => {
    if (!adminToken) {
      const { error } = await studentDb.rpc("current_user_role");
      if (error?.message?.includes("Could not find the function")) {
        throw new Error("migration 017 not applied — run: npm run apply:rls");
      }
      const { data } = await studentDb.rpc("current_user_role");
      if (data !== "student") throw new Error(`expected student role, got ${data}`);
      return { note: "current_user_role=student" };
    }
    const { data, error } = await adminDb.rpc("current_user_role");
    if (error?.message?.includes("Could not find the function")) {
      throw new Error("migration 017 not applied — run: npm run apply:rls");
    }
    if (error) throw new Error(error.message);
    if (data !== "admin") throw new Error(`expected admin role, got ${data}`);
    return { note: "current_user_role=admin" };
  });

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n--- RLS Summary: ${passed} passed, ${failed} failed ---`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
