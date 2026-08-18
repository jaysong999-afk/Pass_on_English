/**
 * Apply supabase/seeds/e2e_rich_seed.sql to the connected Supabase project.
 *
 *   npm run seed:e2e
 *
 * Prefers DATABASE_URL / SUPABASE_DB_URL (runs the SQL file).
 * Falls back to SUPABASE_SERVICE_ROLE_KEY (Auth Admin + table inserts).
 */
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const MIGRATION = resolve(ROOT, "supabase/seeds/e2e_rich_seed.sql");
const MANIFEST = resolve(__dirname, "e2e-seed-manifest.json");
const PASSWORD = "DemoPass123!";

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

function e2eId(n) {
  return `b0000001-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function assertGrid(hhmm) {
  const minute = Number(String(hhmm).slice(3, 5));
  if (![0, 20, 40].includes(minute)) {
    throw new Error(`off 20-min grid: ${hhmm}`);
  }
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}

function kstToday(from = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(from);
}

function addDays(dateKey, n) {
  const d = new Date(`${dateKey}T12:00:00+09:00`);
  d.setTime(d.getTime() + n * 86400000);
  return kstToday(d);
}

function dayOf(dateKey) {
  const wd = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${dateKey}T12:00:00+09:00`));
  return { Sun: "Sun", Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat" }[wd];
}

function matchDates(origin, days, count, step) {
  const out = [];
  for (let g = 0; g <= 420 && out.length < count; g++) {
    const dt = addDays(origin, step * g);
    const day = dayOf(dt);
    if (days.includes(day)) out.push({ n: out.length + 1, dt, day });
  }
  if (step < 0) {
    out.sort((a, b) => a.dt.localeCompare(b.dt));
    out.forEach((row, i) => {
      row.n = i + 1;
    });
  }
  return out;
}

function gridSlots(fromHHmm, toHHmm) {
  const [fh, fm] = fromHHmm.split(":").map(Number);
  const [th, tm] = toHHmm.split(":").map(Number);
  const slots = [];
  for (let m = fh * 60 + fm; m <= th * 60 + tm; m += 20) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    slots.push(assertGrid(`${hh}:${mm}`));
  }
  return slots;
}

function lastPastWeekdayDateKey(now, endHHmm, weekdays) {
  for (let g = 0; g <= 14; g++) {
    const dt = addDays(kstToday(now), -g);
    if (!weekdays.includes(dayOf(dt))) continue;
    const end = new Date(`${dt}T${assertGrid(endHHmm).slice(0, 5)}:00+09:00`);
    if (end.getTime() <= now.getTime()) return dt;
  }
  throw new Error("no past weekday slot for renewal last lesson");
}

function kstIso(dateKey, hhmm) {
  const time = assertGrid(hhmm).slice(0, 5);
  return `${dateKey}T${time}:00+09:00`;
}

function snapKstToGridIso(from) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(from);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const dateKey = `${get("year")}-${get("month")}-${get("day")}`;
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));
  const snapped = Math.floor(minute / 20) * 20;
  const hh = String(hour).padStart(2, "0");
  const mm = String(snapped).padStart(2, "0");
  return kstIso(dateKey, `${hh}:${mm}`);
}

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function applyWithPg(sql) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    return { ok: false, reason: "pg package not installed" };
  }
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    return { ok: false, reason: "DATABASE_URL or SUPABASE_DB_URL not set" };
  }
  const client = new pg.default.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(sql);
    return { ok: true, method: "pg" };
  } finally {
    await client.end();
  }
}

const IDS = {
  sarah: "a0000001-0000-4000-8000-000000000001",
  admin: "a0000004-0000-4000-8000-000000000004",
  james: e2eId(1),
  emily: e2eId(2),
  carlos: e2eId(3),
  fresh: e2eId(101),
  hold: e2eId(102),
  pay: e2eId(103),
  active: e2eId(104),
  renew: e2eId(105),
  cn: e2eId(106),
  guardian: e2eId(107),
  lFresh: e2eId(201),
  lHold: e2eId(202),
  lPay: e2eId(203),
  lActive: e2eId(204),
  lRenew: e2eId(205),
  lCn: e2eId(206),
  lSib1: e2eId(207),
  lSib2: e2eId(208),
  lPending: e2eId(209),
  enHold: e2eId(301),
  enPay: e2eId(302),
  enActive: e2eId(303),
  enRenew: e2eId(304),
  enCn: e2eId(305),
  enSib1: e2eId(306),
  appJames: e2eId(601),
  appEmily: e2eId(602),
  appCarlos: e2eId(603),
};

const AUTH_USERS = [
  { id: IDS.james, email: "e2e-teacher-james@example.org", role: "teacher", fullName: "James Rivera" },
  { id: IDS.emily, email: "e2e-teacher-emily@example.org", role: "teacher", fullName: "Emily Chen" },
  { id: IDS.carlos, email: "e2e-teacher-carlos@example.org", role: "teacher", fullName: "Carlos Mendoza" },
  { id: IDS.fresh, email: "e2e-student-fresh@example.org", role: "student", fullName: "박서연", country: "KR", accountType: "self" },
  { id: IDS.hold, email: "e2e-student-hold@example.org", role: "student", fullName: "이도윤", country: "KR", accountType: "guardian" },
  { id: IDS.pay, email: "e2e-student-pay@example.org", role: "student", fullName: "최하준", country: "KR", accountType: "self" },
  { id: IDS.active, email: "e2e-student-active@example.org", role: "student", fullName: "정예린", country: "KR", accountType: "self" },
  { id: IDS.renew, email: "e2e-student-renew@example.org", role: "student", fullName: "한지호", country: "KR", accountType: "self" },
  { id: IDS.cn, email: "e2e-student-cn@example.org", role: "student", fullName: "王小明", country: "CN", accountType: "guardian" },
  { id: IDS.guardian, email: "e2e-student-guardian@example.org", role: "student", fullName: "김수진", country: "KR", accountType: "guardian" },
];

async function wipeE2e(db, admin) {
  const teacherIds = [IDS.james, IDS.emily, IDS.carlos];
  const studentIds = [IDS.lFresh, IDS.lHold, IDS.lPay, IDS.lActive, IDS.lRenew, IDS.lCn, IDS.lSib1, IDS.lSib2, IDS.lPending];
  const enrollmentIds = [IDS.enHold, IDS.enPay, IDS.enActive, IDS.enRenew, IDS.enCn, IDS.enSib1];
  const roomIds = [e2eId(401), e2eId(402), e2eId(403), e2eId(404)];
  const authIds = AUTH_USERS.map((u) => u.id);

  const { data: extraEns } = await db.from("enrollments").select("id").in("student_id", studentIds);
  const extraEnrollmentIds = [...new Set([
    ...enrollmentIds,
    ...(extraEns ?? []).map((row) => row.id),
  ])];

  await db.from("chat_messages").delete().in("room_id", roomIds);
  await db.from("lesson_feedbacks").delete().in("teacher_id", teacherIds);
  await db.from("lesson_reschedule_requests").delete().in("teacher_id", teacherIds);
  await db.from("lessons").delete().in("teacher_id", teacherIds);
  await db.from("lessons").delete().in("student_id", studentIds);
  await db.from("payments").delete().in("enrollment_id", extraEnrollmentIds);
  await db.from("payments").delete().in("student_id", studentIds);
  await db.from("chat_rooms").delete().in("id", roomIds);
  await db.from("finance_transactions").delete().in("enrollment_id", extraEnrollmentIds);
  await db.from("enrollments").delete().in("id", extraEnrollmentIds);
  await db.from("enrollments").delete().in("student_id", studentIds);
  await db.from("teacher_student_context").delete().in("teacher_id", teacherIds);
  await db.from("monthly_growth_reports").delete().in("teacher_id", teacherIds);
  await db.from("student_registration_reviews").delete().in("id", studentIds);
  await db.from("teachers_weekly_availability").delete().in("teacher_id", teacherIds);
  await db.from("notifications").delete().in("user_id", authIds);
  await db.from("admin_review_logs").delete().like("target_id", "b0000001-%");
  await db.from("students").delete().in("id", studentIds);
  await db.from("teachers").delete().in("id", teacherIds);
  await db.from("teacher_applications").delete().in("id", [IDS.appJames, IDS.appEmily, IDS.appCarlos]);

  for (const user of AUTH_USERS) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error && !/not found|does not exist/i.test(error.message)) {
      throw new Error(`deleteUser ${user.email}: ${error.message}`);
    }
  }
}

async function upsertAuth(admin, user) {
  const metadata = {
    role: user.role,
    full_name: user.fullName,
    ...(user.country ? { country: user.country } : {}),
    ...(user.accountType ? { account_type: user.accountType } : {}),
  };
  const { data: existing } = await admin.auth.admin.getUserById(user.id);
  if (existing?.user) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error) throw new Error(`updateUser ${user.email}: ${error.message}`);
    return;
  }
  const { error } = await admin.auth.admin.createUser({
    id: user.id,
    email: user.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error) throw new Error(`createUser ${user.email}: ${error.message}`);
}

async function applyWithServiceRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    return { ok: false, reason: "NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing" };
  }

  const db = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Applying E2E seed via service role…");
  await wipeE2e(db, db);

  for (const user of AUTH_USERS) {
    await upsertAuth(db, user);
  }

  const today = kstToday();
  const monthKey = today.slice(0, 7);

  const { data: plans, error: planError } = await db
    .from("pricing_plans")
    .select("id, plan_type, sessions_count, price_krw, price_cny");
  if (planError) throw new Error(`pricing_plans: ${planError.message}`);
  const byType = Object.fromEntries((plans ?? []).map((p) => [p.plan_type, p]));
  for (const key of ["weekday5_20min", "mwf_20min", "tuth_20min", "weekend_20min"]) {
    if (!byType[key]) throw new Error(`missing pricing plan ${key}`);
  }

  must(
    await db.from("profiles").upsert([
      { id: IDS.james, role: "teacher", full_name: "James Rivera", phone: "+63-917-100-2001", locale: "ko" },
      { id: IDS.emily, role: "teacher", full_name: "Emily Chen", phone: "+63-917-100-2002", locale: "ko" },
      { id: IDS.carlos, role: "teacher", full_name: "Carlos Mendoza", phone: "+63-917-100-2003", locale: "ko" },
      { id: IDS.fresh, role: "student", full_name: "박서연", phone: "010-2001-0001", account_type: "self", locale: "ko" },
      { id: IDS.hold, role: "student", full_name: "이도윤", phone: "010-2001-0002", account_type: "guardian", locale: "ko" },
      { id: IDS.pay, role: "student", full_name: "최하준", phone: "010-2001-0003", account_type: "self", locale: "ko" },
      { id: IDS.active, role: "student", full_name: "정예린", phone: "010-2001-0004", account_type: "self", locale: "ko" },
      { id: IDS.renew, role: "student", full_name: "한지호", phone: "010-2001-0005", account_type: "self", locale: "ko" },
      { id: IDS.cn, role: "student", full_name: "王小明", phone: "138-0000-2006", account_type: "guardian", locale: "zh-CN" },
      { id: IDS.guardian, role: "student", full_name: "김수진", phone: "010-2001-0007", account_type: "guardian", locale: "ko" },
    ]),
    "profiles"
  );

  must(
    await db.from("teacher_applications").insert([
      { id: IDS.appJames, full_name: "James Rivera", date_of_birth: "1992-04-11", phone: "+63-917-100-2001", bank_account: "BDO 001-2345-678", facebook_messenger_id: "james.rivera", address: "Manila", email: "e2e-teacher-james@example.org", status: "approved", reviewed_by: IDS.admin },
      { id: IDS.appEmily, full_name: "Emily Chen", date_of_birth: "1994-09-02", phone: "+63-917-100-2002", bank_account: "BPI 009-8765-432", facebook_messenger_id: "emily.chen", address: "Cebu", email: "e2e-teacher-emily@example.org", status: "approved", reviewed_by: IDS.admin },
      { id: IDS.appCarlos, full_name: "Carlos Mendoza", date_of_birth: "1990-12-18", phone: "+63-917-100-2003", bank_account: "", facebook_messenger_id: "carlos.mendoza", address: "Quezon City", email: "e2e-teacher-carlos@example.org", status: "pending" },
    ]),
    "teacher_applications"
  );

  must(
    await db.from("teachers").insert([
      { id: IDS.james, display_name: "James Rivera", bio: "E2E teacher — weekday afternoons. Conversation + exam prep.", specialties: ["Conversation", "Exam Prep", "Encouraging"], experience_years: 6, status: "active", hourly_rate_php: 160, timezone: "Asia/Manila", application_id: IDS.appJames },
      { id: IDS.emily, display_name: "Emily Chen", bio: "E2E teacher — weekends and weekday evenings. Kids + phonics.", specialties: ["Phonics", "Kids", "Friendly"], experience_years: 5, status: "active", hourly_rate_php: 155, timezone: "Asia/Manila", application_id: IDS.appEmily },
      { id: IDS.carlos, display_name: "Carlos Mendoza", bio: "E2E pending teacher — awaiting admin approval.", specialties: ["Business English"], experience_years: 4, status: "pending", hourly_rate_php: 140, timezone: "Asia/Manila", application_id: IDS.appCarlos },
    ]),
    "teachers"
  );
  await db.from("teachers").update({ video_platforms: ["ZOOM", "VOOV"] }).eq("id", IDS.james);
  await db.from("teachers").update({ video_platforms: ["VOOV"] }).eq("id", IDS.emily);

  await db.from("teacher_applications").update({ teacher_id: IDS.james }).eq("id", IDS.appJames);
  await db.from("teacher_applications").update({ teacher_id: IDS.emily }).eq("id", IDS.appEmily);
  await db.from("teacher_applications").update({ teacher_id: IDS.carlos }).eq("id", IDS.appCarlos);

  must(
    await db.from("students").insert([
      { id: IDS.lFresh, account_holder_id: IDS.fresh, full_name: "박서연", english_name: "Seoyeon Park", date_of_birth: "2008-05-21", country: "KR", english_level: "A2", purposes: ["daily_conversation"], trial_used: false, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lHold, account_holder_id: IDS.hold, full_name: "이도윤", english_name: "Doyun Lee", date_of_birth: "2014-11-03", country: "KR", english_level: "A1", purposes: ["phonics", "daily_conversation"], trial_used: false, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lPay, account_holder_id: IDS.pay, full_name: "최하준", english_name: "Hajun Choi", date_of_birth: "2006-02-14", country: "KR", english_level: "B1", purposes: ["exam_prep"], trial_used: false, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lActive, account_holder_id: IDS.active, full_name: "정예린", english_name: "Yerin Jung", date_of_birth: "2012-07-08", country: "KR", english_level: "A2", purposes: ["school_english", "phonics"], trial_used: true, reschedule_count_month: 1, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lRenew, account_holder_id: IDS.renew, full_name: "한지호", english_name: "Jiho Han", date_of_birth: "2009-01-19", country: "KR", english_level: "B1", purposes: ["daily_conversation", "exam_prep"], trial_used: true, reschedule_count_month: 2, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lCn, account_holder_id: IDS.cn, full_name: "王小明", english_name: "Xiaoming Wang", date_of_birth: "2013-08-26", country: "CN", english_level: "A1", purposes: ["phonics"], trial_used: true, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lSib1, account_holder_id: IDS.guardian, full_name: "김하은", english_name: "Haeun Kim", date_of_birth: "2016-03-02", country: "KR", english_level: "A1", purposes: ["phonics"], trial_used: true, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lSib2, account_holder_id: IDS.guardian, full_name: "김하준", english_name: "Hajun Kim", date_of_birth: "2018-09-15", country: "KR", english_level: "Pre-A1", purposes: ["phonics"], trial_used: false, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
      { id: IDS.lPending, account_holder_id: IDS.guardian, full_name: "김하린", english_name: "Harin Kim", date_of_birth: "2020-04-30", country: "KR", english_level: "Pre-A1", purposes: ["daily_conversation"], trial_used: false, reschedule_count_month: 0, reschedule_month_key: monthKey, is_active: true },
    ]),
    "students"
  );
  await db.from("students").update({ video_platforms: ["VOOV"] }).eq("id", IDS.lCn);
  await db.from("students").update({ gender: "female" }).in("id", [IDS.lFresh, IDS.lActive, IDS.lSib1, IDS.lPending]);
  await db.from("students").update({ gender: "male" }).in("id", [IDS.lHold, IDS.lPay, IDS.lRenew, IDS.lCn, IDS.lSib2]);

  await db.from("profiles").update({ active_student_id: IDS.lFresh }).eq("id", IDS.fresh);
  await db.from("profiles").update({ active_student_id: IDS.lHold }).eq("id", IDS.hold);
  await db.from("profiles").update({ active_student_id: IDS.lPay }).eq("id", IDS.pay);
  await db.from("profiles").update({ active_student_id: IDS.lActive }).eq("id", IDS.active);
  await db.from("profiles").update({ active_student_id: IDS.lRenew }).eq("id", IDS.renew);
  await db.from("profiles").update({ active_student_id: IDS.lCn }).eq("id", IDS.cn);
  await db.from("profiles").update({ active_student_id: IDS.lSib1 }).eq("id", IDS.guardian);

  must(
    await db.from("student_registration_reviews").insert([
      { id: IDS.lFresh, account_holder_name: "박서연", account_email: "e2e-student-fresh@example.org", account_phone: "010-2001-0001", account_type: "self", country: "KR", learner_full_name: "박서연", learner_english_name: "Seoyeon Park", learner_date_of_birth: "2008-05-21", english_level: "A2", purposes: ["daily_conversation"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lHold, account_holder_name: "이도윤", account_email: "e2e-student-hold@example.org", account_phone: "010-2001-0002", account_type: "guardian", country: "KR", learner_full_name: "이도윤", learner_english_name: "Doyun Lee", learner_date_of_birth: "2014-11-03", english_level: "A1", purposes: ["phonics", "daily_conversation"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lPay, account_holder_name: "최하준", account_email: "e2e-student-pay@example.org", account_phone: "010-2001-0003", account_type: "self", country: "KR", learner_full_name: "최하준", learner_english_name: "Hajun Choi", learner_date_of_birth: "2006-02-14", english_level: "B1", purposes: ["exam_prep"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lActive, account_holder_name: "정예린", account_email: "e2e-student-active@example.org", account_phone: "010-2001-0004", account_type: "self", country: "KR", learner_full_name: "정예린", learner_english_name: "Yerin Jung", learner_date_of_birth: "2012-07-08", english_level: "A2", purposes: ["school_english", "phonics"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lRenew, account_holder_name: "한지호", account_email: "e2e-student-renew@example.org", account_phone: "010-2001-0005", account_type: "self", country: "KR", learner_full_name: "한지호", learner_english_name: "Jiho Han", learner_date_of_birth: "2009-01-19", english_level: "B1", purposes: ["daily_conversation", "exam_prep"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lCn, account_holder_name: "王小明", account_email: "e2e-student-cn@example.org", account_phone: "138-0000-2006", account_type: "guardian", country: "CN", learner_full_name: "王小明", learner_english_name: "Xiaoming Wang", learner_date_of_birth: "2013-08-26", english_level: "A1", purposes: ["phonics"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lSib1, account_holder_name: "김수진", account_email: "e2e-student-guardian@example.org", account_phone: "010-2001-0007", account_type: "guardian", country: "KR", learner_full_name: "김하은", learner_english_name: "Haeun Kim", learner_date_of_birth: "2016-03-02", english_level: "A1", purposes: ["phonics"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lSib2, account_holder_name: "김수진", account_email: "e2e-student-guardian@example.org", account_phone: "010-2001-0007", account_type: "guardian", country: "KR", learner_full_name: "김하준", learner_english_name: "Hajun Kim", learner_date_of_birth: "2018-09-15", english_level: "Pre-A1", purposes: ["phonics"], status: "confirmed", reviewed_by: IDS.admin },
      { id: IDS.lPending, account_holder_name: "김수진", account_email: "e2e-student-guardian@example.org", account_phone: "010-2001-0007", account_type: "guardian", country: "KR", learner_full_name: "김하린", learner_english_name: "Harin Kim", learner_date_of_birth: "2020-04-30", english_level: "Pre-A1", purposes: ["daily_conversation"], status: "pending" },
    ]),
    "registration_reviews"
  );

  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const sarahSlots = wd.flatMap((day) =>
    gridSlots("08:00", "11:40").map((start_time) => ({ teacher_id: IDS.sarah, day, start_time }))
  );
  must(
    await db.from("teachers_weekly_availability").upsert(sarahSlots, {
      onConflict: "teacher_id,day,start_time",
      ignoreDuplicates: true,
    }),
    "sarah availability"
  );

  const jamesSlots = [
    ...wd.flatMap((day) => gridSlots("10:00", "11:40").map((start_time) => ({ teacher_id: IDS.james, day, start_time }))),
    ...wd.flatMap((day) => gridSlots("13:00", "17:40").map((start_time) => ({ teacher_id: IDS.james, day, start_time }))),
  ];
  const emilySlots = [
    ...["Sat", "Sun"].flatMap((day) => gridSlots("09:00", "11:40").map((start_time) => ({ teacher_id: IDS.emily, day, start_time }))),
    ...wd.flatMap((day) => gridSlots("19:00", "20:40").map((start_time) => ({ teacher_id: IDS.emily, day, start_time }))),
  ];
  must(await db.from("teachers_weekly_availability").insert([...jamesSlots, ...emilySlots]), "availability");

  const now = new Date();
  const holdDeadline = new Date(now.getTime() + 14 * 3600 * 1000);
  const payDeadline = new Date(now.getTime() + 12 * 3600 * 1000);
  const renewLastDate = lastPastWeekdayDateKey(now, "10:20", wd);
  const pastWd5 = matchDates(renewLastDate, wd, 20, -1);
  const renewFirstDate = pastWd5[0].dt;
  const renewLastEndIso = kstIso(renewLastDate, "10:20");

  must(
    await db.from("enrollments").insert([
      { id: IDS.enHold, student_id: IDS.lHold, teacher_id: IDS.james, plan_id: byType.weekday5_20min.id, status: "pending_payment", payment_status: "pending", currency: "KRW", total_amount: byType.weekday5_20min.price_krw, sessions_total: 20, sessions_completed: 0, sessions_remaining: 20, curriculum: "Phonics starters", preferred_slot_time: "13:00", preferred_slot_day: "Mon", session_adjustments: [], confirmed_at: new Date(now.getTime() - 3600 * 1000).toISOString(), payment_deadline_at: holdDeadline.toISOString() },
      { id: IDS.enPay, student_id: IDS.lPay, teacher_id: IDS.james, plan_id: byType.tuth_20min.id, status: "pending_payment", payment_status: "reported", currency: "KRW", total_amount: byType.tuth_20min.price_krw, sessions_total: 8, sessions_completed: 0, sessions_remaining: 8, curriculum: "Exam prep Tue/Thu", preferred_slot_time: "15:00", preferred_slot_day: "Tue", session_adjustments: [], confirmed_at: new Date(now.getTime() - 3 * 3600 * 1000).toISOString(), payment_deadline_at: payDeadline.toISOString() },
      { id: IDS.enActive, student_id: IDS.lActive, teacher_id: IDS.james, plan_id: byType.mwf_20min.id, status: "active", payment_status: "confirmed", currency: "KRW", total_amount: byType.mwf_20min.price_krw, sessions_total: 12, sessions_completed: 3, sessions_remaining: 9, curriculum: "Oxford Discover 2", preferred_slot_time: "14:00", preferred_slot_day: "Mon", session_adjustments: [], started_at: kstIso(addDays(today, -21), "00:00"), ended_at: kstIso(addDays(today, 28), "23:40") },
      { id: IDS.enRenew, student_id: IDS.lRenew, teacher_id: IDS.james, plan_id: byType.weekday5_20min.id, status: "completed", payment_status: "confirmed", currency: "KRW", total_amount: byType.weekday5_20min.price_krw, sessions_total: 20, sessions_completed: 20, sessions_remaining: 0, curriculum: "General English (completed)", preferred_slot_time: "10:00", preferred_slot_day: "Mon", session_adjustments: [], started_at: kstIso(renewFirstDate, "00:00"), ended_at: renewLastEndIso },
      { id: IDS.enCn, student_id: IDS.lCn, teacher_id: IDS.emily, plan_id: byType.weekend_20min.id, status: "active", payment_status: "confirmed", currency: "CNY", total_amount: byType.weekend_20min.price_cny, sessions_total: 8, sessions_completed: 3, sessions_remaining: 5, curriculum: "Phonics World", preferred_slot_time: "09:00", preferred_slot_day: "Sat", session_adjustments: [] },
      { id: IDS.enSib1, student_id: IDS.lSib1, teacher_id: IDS.emily, plan_id: byType.mwf_20min.id, status: "active", payment_status: "confirmed", currency: "KRW", total_amount: byType.mwf_20min.price_krw, sessions_total: 12, sessions_completed: 2, sessions_remaining: 10, curriculum: "Kids phonics", preferred_slot_time: "19:00", preferred_slot_day: "Mon", session_adjustments: [] },
    ]),
    "enrollments"
  );

  const pastMwf = matchDates(addDays(today, -1), ["Mon", "Wed", "Fri"], 4, -1);
  // Start strictly after seed day so an afternoon seed remains valid when the
  // E2E scenario is exercised later that day or the following morning.
  const futureMwf = matchDates(addDays(today, 1), ["Mon", "Wed", "Fri"], 8, 1);
  const makeupDate = matchDates(addDays(today, 14), ["Mon", "Wed", "Fri"], 1, 1)[0];
  const pastWeekend = matchDates(addDays(today, -1), ["Sat", "Sun"], 3, -1);
  const futureWeekend = matchDates(today, ["Sat", "Sun"], 5, 1);
  const pastEve = matchDates(addDays(today, -1), ["Mon", "Wed", "Fri"], 2, -1);
  const futureEve = matchDates(today, ["Mon", "Wed", "Fri"], 10, 1);

  const makeupOriginalId = e2eId(1000 + pastMwf[3].n);
  const makeupNewId = e2eId(1090);
  const rescheduleLessonId = e2eId(1010 + futureMwf[0].n);

  const lessons = [
    ...pastMwf.map((d) => ({
      id: e2eId(1000 + d.n),
      enrollment_id: IDS.enActive,
      teacher_id: IDS.james,
      student_id: IDS.lActive,
      scheduled_at: kstIso(d.dt, "14:00"),
      duration_minutes: 20,
      status: d.n === 4 ? "cancelled" : "completed",
      teacher_no_show: d.n === 4,
      unpaid_for_teacher: d.n === 4,
      cancel_reason: d.n === 4 ? "teacher_no_show" : null,
      completed_at: d.n === 4 ? null : kstIso(d.dt, "14:20"),
      related_lesson_id: d.n === 4 ? makeupNewId : null,
      operation_note: d.n === 4 ? "E2E seed — teacher no-show (makeup linked)" : "E2E seed — completed MWF 14:00",
    })),
    ...futureMwf.map((d) => ({
      id: e2eId(1010 + d.n),
      enrollment_id: IDS.enActive,
      teacher_id: IDS.james,
      student_id: IDS.lActive,
      scheduled_at: kstIso(d.dt, "14:00"),
      duration_minutes: 20,
      status: d.n === 1 ? "reschedule_pending" : "scheduled",
      operation_note: d.n === 1 ? "E2E seed — pending makeup/reschedule" : "E2E seed — scheduled MWF 14:00",
    })),
    {
      id: makeupNewId,
      enrollment_id: IDS.enActive,
      teacher_id: IDS.james,
      student_id: IDS.lActive,
      scheduled_at: kstIso(makeupDate.dt, "14:20"),
      duration_minutes: 20,
      status: "scheduled",
      related_lesson_id: makeupOriginalId,
      original_teacher_id: IDS.james,
      operation_note: "E2E seed — makeup for teacher no-show",
    },
    ...pastWd5.map((d) => ({
      id: e2eId(1100 + d.n),
      enrollment_id: IDS.enRenew,
      teacher_id: IDS.james,
      student_id: IDS.lRenew,
      scheduled_at: kstIso(d.dt, "10:00"),
      duration_minutes: 20,
      status: "completed",
      completed_at: kstIso(d.dt, "10:20"),
      operation_note:
        d.dt === renewLastDate
          ? "E2E seed — last weekday 10:00 lesson (renewal hold from 10:20)"
          : "E2E seed — completed weekday5 10:00",
    })),
    ...pastWeekend.map((d) => ({
      id: e2eId(1200 + d.n),
      enrollment_id: IDS.enCn,
      teacher_id: IDS.emily,
      student_id: IDS.lCn,
      scheduled_at: kstIso(d.dt, "09:00"),
      duration_minutes: 20,
      status: "completed",
      completed_at: kstIso(d.dt, "09:20"),
      operation_note: "E2E seed — completed weekend 09:00",
    })),
    ...futureWeekend.map((d) => ({
      id: e2eId(1210 + d.n),
      enrollment_id: IDS.enCn,
      teacher_id: IDS.emily,
      student_id: IDS.lCn,
      scheduled_at: kstIso(d.dt, "09:00"),
      duration_minutes: 20,
      status: "scheduled",
      operation_note: "E2E seed — scheduled weekend 09:00",
    })),
    ...pastEve.map((d) => ({
      id: e2eId(1300 + d.n),
      enrollment_id: IDS.enSib1,
      teacher_id: IDS.emily,
      student_id: IDS.lSib1,
      scheduled_at: kstIso(d.dt, "19:00"),
      duration_minutes: 20,
      status: "completed",
      completed_at: kstIso(d.dt, "19:20"),
      operation_note: "E2E seed — completed MWF 19:00",
    })),
    ...futureEve.map((d) => ({
      id: e2eId(1310 + d.n),
      enrollment_id: IDS.enSib1,
      teacher_id: IDS.emily,
      student_id: IDS.lSib1,
      scheduled_at: kstIso(d.dt, "19:00"),
      duration_minutes: 20,
      status: "scheduled",
      operation_note: "E2E seed — scheduled MWF 19:00",
    })),
  ];

  for (const l of lessons) {
    l.is_trial = l.is_trial ?? false;
    l.student_absent = l.student_absent ?? false;
    l.teacher_no_show = l.teacher_no_show ?? false;
    l.unpaid_for_teacher = l.unpaid_for_teacher ?? false;
    l.cancel_reason = l.cancel_reason ?? null;
    l.related_lesson_id = l.related_lesson_id ?? null;
    l.original_teacher_id = l.original_teacher_id ?? null;
    l.completed_at = l.completed_at ?? null;
    l.operation_note = l.operation_note ?? null;
  }

  for (let i = 0; i < lessons.length; i += 50) {
    must(await db.from("lessons").insert(lessons.slice(i, i + 50)), `lessons ${i}`);
  }

  must(
    await db.from("lesson_feedbacks").insert([
      ...pastMwf.filter((d) => d.n === 2 || d.n === 3).map((d) => ({
        lesson_id: e2eId(1000 + d.n),
        teacher_id: IDS.james,
        student_id: IDS.lActive,
        content: "Good work on today's target language. Keep using full sentences.",
        homework: `Workbook p.${10 + d.n}`,
        progress_pages: `p.${8 + d.n}-${9 + d.n}`,
      })),
      ...pastWd5.filter((d) => d.n > 16).map((d) => ({
        lesson_id: e2eId(1100 + d.n),
        teacher_id: IDS.james,
        student_id: IDS.lRenew,
        content: "Completed-term recap. Ready for the next course.",
        homework: `Review unit ${d.n}`,
      })),
      ...pastWeekend.map((d) => ({
        lesson_id: e2eId(1200 + d.n),
        teacher_id: IDS.emily,
        student_id: IDS.lCn,
        content: "Nice effort on short vowels. 发音很棒！",
        homework: `Phonics workbook p.${d.n}`,
      })),
    ]),
    "feedbacks"
  );

  must(
    await db.from("lesson_reschedule_requests").insert({
      id: e2eId(701),
      lesson_id: rescheduleLessonId,
      teacher_id: IDS.james,
      student_id: IDS.lActive,
      initiator: "student",
      original_scheduled_at: kstIso(futureMwf[0].dt, "14:00"),
      proposed_scheduled_at: kstIso(futureMwf[0].dt, "14:20"),
      status: "pending_teacher_approval",
      reason: "학교 행사로 20분 뒤 보강 요청",
      request_month: monthKey,
    }),
    "reschedule"
  );

  must(
    await db.from("payments").insert([
      { id: e2eId(501), enrollment_id: IDS.enPay, student_id: IDS.lPay, amount: byType.tuth_20min.price_krw, currency: "KRW", status: "reported", depositor_name: "최하준", reported_at: new Date(now.getTime() - 40 * 60 * 1000).toISOString() },
      { id: e2eId(502), enrollment_id: IDS.enActive, student_id: IDS.lActive, amount: byType.mwf_20min.price_krw, currency: "KRW", status: "confirmed", depositor_name: "정예린", confirmed_by: IDS.admin },
      { id: e2eId(503), enrollment_id: IDS.enRenew, student_id: IDS.lRenew, amount: byType.weekday5_20min.price_krw, currency: "KRW", status: "confirmed", depositor_name: "한지호", confirmed_by: IDS.admin },
      { id: e2eId(504), enrollment_id: IDS.enCn, student_id: IDS.lCn, amount: byType.weekend_20min.price_cny, currency: "CNY", status: "confirmed", depositor_name: "王小明", confirmed_by: IDS.admin },
      { id: e2eId(505), enrollment_id: IDS.enSib1, student_id: IDS.lSib1, amount: byType.mwf_20min.price_krw, currency: "KRW", status: "confirmed", depositor_name: "김수진", confirmed_by: IDS.admin },
    ]),
    "payments"
  );

  const split = (total) => {
    const supply = Math.round(total / 1.1);
    return { supply, vat: total - supply };
  };
  const mwfTax = split(byType.mwf_20min.price_krw);
  const wd5Tax = split(byType.weekday5_20min.price_krw);

  must(
    await db.from("finance_transactions").insert([
      { transaction_date: addDays(today, -21), type: "income", category: "student_payment_kr", description: "정예린 — 월·수·금 20분", currency: "KRW", amount: byType.mwf_20min.price_krw, amount_krw: byType.mwf_20min.price_krw, supply_amount: mwfTax.supply, vat_amount: mwfTax.vat, tax_treatment: "taxable", source: "auto", student_name: "정예린", enrollment_id: IDS.enActive },
      { transaction_date: addDays(today, -56), type: "income", category: "student_payment_kr", description: "한지호 — 주5회(월~금) 20분", currency: "KRW", amount: byType.weekday5_20min.price_krw, amount_krw: byType.weekday5_20min.price_krw, supply_amount: wd5Tax.supply, vat_amount: wd5Tax.vat, tax_treatment: "taxable", source: "auto", student_name: "한지호", enrollment_id: IDS.enRenew },
      { transaction_date: addDays(today, -21), type: "income", category: "student_payment_cn", description: "王小明 — 주말(토·일) 20분", currency: "CNY", amount: byType.weekend_20min.price_cny, amount_krw: byType.weekend_20min.price_cny * 190, supply_amount: byType.weekend_20min.price_cny * 190, vat_amount: 0, tax_treatment: "non_taxable", source: "auto", student_name: "王小明", enrollment_id: IDS.enCn },
    ]),
    "finance"
  );

  return { ok: true, method: "service_role", db };
}

async function verify(db) {
  const { data: slots, error: slotError } = await db
    .from("teachers_weekly_availability")
    .select("teacher_id, day, start_time")
    .in("teacher_id", [IDS.james, IDS.emily, IDS.sarah]);
  if (slotError) throw new Error(slotError.message);
  const badSlots = (slots ?? []).filter((s) => {
    const minute = Number(String(s.start_time).slice(3, 5));
    return ![0, 20, 40].includes(minute);
  });
  if (badSlots.length) throw new Error(`${badSlots.length} availability rows off 20-min grid`);

  const listed1300 = (slots ?? []).filter((s) => s.teacher_id === IDS.james && String(s.start_time).startsWith("13:00"));
  if (listed1300.length !== 5) throw new Error("James 13:00 weekday working hours must stay listed");

  const listed1500 = (slots ?? []).filter(
    (s) => s.teacher_id === IDS.james && ["Tue", "Thu"].includes(s.day) && String(s.start_time).startsWith("15:00")
  );
  if (listed1500.length !== 2) throw new Error("James Tue/Thu 15:00 working hours must stay listed");

  const open1000 = (slots ?? []).some((s) => s.teacher_id === IDS.james && s.day === "Mon" && String(s.start_time).startsWith("10:00"));
  if (!open1000) throw new Error("James Mon 10:00 must stay open for renewal");

  const { data: lessons, error: lessonError } = await db
    .from("lessons")
    .select("id, scheduled_at, duration_minutes, preferred_slot_time:scheduled_at")
    .in("teacher_id", [IDS.james, IDS.emily]);
  if (lessonError) throw new Error(lessonError.message);
  const badLessons = (lessons ?? []).filter((l) => {
    const kst = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(l.scheduled_at));
    const minute = Number(kst.slice(-2));
    return ![0, 20, 40].includes(minute) || l.duration_minutes !== 20;
  });
  if (badLessons.length) throw new Error(`${badLessons.length} lessons off 20-min KST grid`);

  const slotKeys = new Set(
    (slots ?? []).map((slot) =>
      `${slot.teacher_id}|${slot.day}|${String(slot.start_time).slice(0, 5)}`
    )
  );
  const lessonsOutsideAvailability = (lessons ?? []).filter((lesson) => {
    const instant = new Date(lesson.scheduled_at);
    const dateKey = kstToday(instant);
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(instant);
    return !slotKeys.has(`${lesson.teacher_id}|${dayOf(dateKey)}|${time}`);
  });
  if (lessonsOutsideAvailability.length) {
    throw new Error(`${lessonsOutsideAvailability.length} lessons outside teacher availability`);
  }

  const { count: teacherCount } = await db.from("teachers").select("id", { count: "exact", head: true }).in("id", [IDS.james, IDS.emily, IDS.carlos]);
  const { count: enrollmentCount } = await db.from("enrollments").select("id", { count: "exact", head: true }).in("id", [IDS.enHold, IDS.enPay, IDS.enActive, IDS.enRenew, IDS.enCn, IDS.enSib1]);
  const { count: lessonCount } = await db.from("lessons").select("id", { count: "exact", head: true }).in("teacher_id", [IDS.james, IDS.emily]);

  return {
    teachers: teacherCount,
    enrollments: enrollmentCount,
    lessons: lessonCount,
    availability: slots?.length ?? 0,
  };
}

function writeManifest() {
  const manifest = {
    seededAt: new Date().toISOString(),
    password: PASSWORD,
    scenarios: {
      enrollment: { email: "e2e-student-fresh@example.org", note: "수강신청 — 계정만 있고 수강권 없음" },
      hold15h: { email: "e2e-student-hold@example.org", note: "15시간 홀드 (James 13:00 weekday5, 입금 전)" },
      paymentConfirm: { email: "e2e-student-pay@example.org", note: "입금 신고 완료 → 관리자 확인 시 스케줄 일괄 생성" },
      scheduleFeedbackMakeup: { email: "e2e-student-active@example.org", note: "정규 스케줄 + 보강 요청 + 피드백 미작성 1건" },
      renewal: { email: "e2e-student-renew@example.org", note: "최근 완료 수업 직후 12h/15h 재수강 창구 (James 10:00 정규 슬롯 홀드)" },
      guardianSibling: { email: "e2e-student-guardian@example.org", note: "형제 1명 수강 중, 1명 미신청, 1명 가입 검토 대기" },
      teachers: [
        "e2e-teacher-james@example.org",
        "e2e-teacher-emily@example.org",
        "e2e-teacher-carlos@example.org (pending 승인)",
      ],
    },
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

async function main() {
  loadEnvLocal();
  if (!existsSync(MIGRATION)) throw new Error(`Missing ${MIGRATION}`);
  const sql = readFileSync(MIGRATION, "utf8");

  console.log("Applying E2E rich seed (migration 024)…\n");

  const pgResult = await applyWithPg(sql).catch((err) => ({
    ok: false,
    reason: err instanceof Error ? err.message : String(err),
  }));

  let method = pgResult.ok ? pgResult.method : null;
  let db = null;

  if (pgResult.ok) {
    console.log(`✓ SQL applied via ${pgResult.method}`);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (url && serviceKey) {
      db = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
    }
  } else {
    console.warn(`PG apply skipped: ${pgResult.reason}`);
    const sr = await applyWithServiceRole();
    if (!sr.ok) {
      console.error(`
Could not apply seed automatically (${sr.reason}).

Manual steps:
1. Open Supabase Dashboard → SQL Editor
2. Paste supabase/seeds/e2e_rich_seed.sql
3. Run, then: npm run seed:e2e
`);
      process.exit(1);
    }
    method = sr.method;
    db = sr.db;
    console.log(`✓ Seed applied via ${method}`);
  }

  if (db) {
    const stats = await verify(db);
    console.log("✓ 20-min grid checks passed");
    console.log(`  teachers=${stats.teachers} enrollments=${stats.enrollments} lessons=${stats.lessons} availability=${stats.availability}`);
  }

  writeManifest();
  console.log(`\nLogins (password: ${PASSWORD})`);
  console.log("  수강신청     e2e-student-fresh@example.org");
  console.log("  15h 홀드     e2e-student-hold@example.org");
  console.log("  입금확인     e2e-student-pay@example.org");
  console.log("  보강/피드백  e2e-student-active@example.org");
  console.log("  재수강       e2e-student-renew@example.org  (한지호 · 최근 완료 수업 기준 12h/15h)");
  console.log("  선생님       e2e-teacher-james@example.org / e2e-teacher-emily@example.org");
  console.log("  관리자       demo-admin@example.org");
  console.log(`  Manifest     ${MANIFEST}`);
}

main().catch((err) => {
  console.error("E2E seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
