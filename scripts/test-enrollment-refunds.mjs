// Isolated temporary PostgreSQL cluster. Never reads .env or contacts Supabase.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { calculateRefundPolicy } from "../src/lib/refunds/policy.ts";

for (const [total, cases] of [
  [20, [[0, "full", 87000], [6, "two_thirds", 58000], [7, "half", 43500], [9, "half", 43500], [10, "none", 0]]],
  [12, [[0, "full", 90000], [3, "two_thirds", 60000], [4, "half", 45000], [5, "half", 45000], [6, "none", 0]]],
]) {
  for (const [counted, tier, amount] of cases) {
    const result = calculateRefundPolicy({ paidAmount: total === 20 ? 87000 : 90000, paidSessionsTotal: total, countedSessions: counted, currency: "KRW" });
    assert.equal(result.tier, tier);
    assert.equal(result.amount, amount);
  }
}
assert.equal(calculateRefundPolicy({ paidAmount: 100, paidSessionsTotal: 20, countedSessions: 6, currency: "CNY" }).amount, 66.67);
console.log("PASS: refund policy boundaries and currency rounding");

const bin = process.env.REFUND_TEST_PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const dir = mkdtempSync(join(tmpdir(), "passon-refund-test-"));
const port = 55450;
function run(name, args) {
  const result = spawnSync(join(bin, name), args, { encoding: "utf8", windowsHide: true, stdio: "ignore", timeout: 90000 });
  if (result.status !== 0) throw new Error(`${name}: ${result.error ?? result.stderr ?? result.stdout}`);
}
const config = { host: "127.0.0.1", port, database: "postgres", user: "postgres" };
const db = new pg.Client(config);
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const admin = uid(1), account = uid(2), teacher = uid(3), student = uid(4), plan = uid(5), enrollment = uid(6), room = uid(7);
let started = false;

async function callPreview(id = enrollment) {
  return (await db.query("select public.admin_preview_enrollment_refund($1) result", [id])).rows[0].result;
}

async function finalize(id, counted, calculated, actual, reason = "가족 일정 변경") {
  return (await db.query(
    "select public.admin_finalize_enrollment_refund($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result",
    [id, counted, calculated, actual, reason, null, "송금 확인", null, true, 190.2, "test", new Date().toISOString()]
  )).rows[0].result;
}

try {
  run("initdb.exe", ["-D", dir, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl.exe", ["-D", dir, "-l", join(dir, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  await db.connect();
  await db.query(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TYPE public.user_role AS ENUM ('student','teacher','admin');
    CREATE TYPE public.enrollment_status AS ENUM ('pending_payment','active','expiring_soon','completed','cancelled');
    CREATE TYPE public.lesson_status AS ENUM ('pending_payment','scheduled','reschedule_pending','completed','cancelled','no_show');
    CREATE TYPE public.payment_status AS ENUM ('pending','reported','confirmed','rejected');
    CREATE TYPE public.reschedule_status AS ENUM ('pending_student_approval','pending_teacher_approval','approved','rejected','cancelled');
    CREATE TYPE public.reschedule_initiator AS ENUM ('student','teacher');
    CREATE TYPE public.currency_code AS ENUM ('KRW','CNY','PHP');
    CREATE TYPE public.notification_type AS ENUM ('payment_request','payment_confirmed','reschedule_request','reschedule_result','chat_message','admin_broadcast','lesson_reminder','admin_direct');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
    CREATE TABLE public.profiles(id uuid primary key, role public.user_role, full_name text, locale text, active_student_id uuid, avatar_url text);
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') $$;
    CREATE TABLE public.students(id uuid primary key, account_holder_id uuid references public.profiles, english_name text, full_name text);
    CREATE TABLE public.teachers(id uuid primary key references public.profiles, display_name text);
    CREATE TABLE public.pricing_plans(id uuid primary key, sessions_count int, description jsonb, plan_type text);
    CREATE TABLE public.enrollments(
      id uuid primary key, student_id uuid references public.students, teacher_id uuid references public.teachers,
      plan_id uuid references public.pricing_plans, status public.enrollment_status, is_trial boolean default false,
      payment_status public.payment_status, currency public.currency_code, total_amount int, sessions_total int,
      sessions_completed int default 0, sessions_remaining int, session_adjustments jsonb default '[]',
      cancel_reason text, ended_at timestamptz, created_at timestamptz default now()
    );
    CREATE TABLE public.lessons(
      id uuid primary key default extensions.gen_random_uuid(), enrollment_id uuid references public.enrollments,
      teacher_id uuid references public.teachers, student_id uuid references public.students, scheduled_at timestamptz,
      duration_minutes int default 20, status public.lesson_status, is_trial boolean default false,
      student_absent boolean default false, teacher_no_show boolean default false, unpaid_for_teacher boolean default false,
      cancel_reason text, operation_note text
    );
    CREATE TABLE public.payments(
      id uuid primary key default extensions.gen_random_uuid(), enrollment_id uuid references public.enrollments,
      student_id uuid references public.students, amount int, currency public.currency_code, status public.payment_status,
      confirmed_at timestamptz, created_at timestamptz default now()
    );
    CREATE TABLE public.chat_rooms(
      id uuid primary key default extensions.gen_random_uuid(), enrollment_id uuid unique references public.enrollments, student_id uuid references public.students,
      teacher_id uuid references public.teachers, last_message_at timestamptz, created_at timestamptz default now()
    );
    CREATE TABLE public.chat_messages(
      id uuid primary key default extensions.gen_random_uuid(), room_id uuid references public.chat_rooms,
      sender_id uuid references public.profiles, sender_role public.user_role, body text, read_at timestamptz, created_at timestamptz default now()
    );
    CREATE TABLE public.chat_room_read_state(room_id uuid references public.chat_rooms, user_id uuid references public.profiles, last_read_at timestamptz, primary key(room_id,user_id));
    CREATE TABLE public.chat_room_presence(
      room_id uuid references public.chat_rooms, user_id uuid references public.profiles,
      client_id uuid, expires_at timestamptz, primary key(room_id,user_id,client_id)
    );
    CREATE FUNCTION public.can_access_chat_room(p_room_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.chat_rooms room
        JOIN public.students student_row ON student_row.id=room.student_id
        WHERE room.id=p_room_id
          AND (public.is_admin() OR room.teacher_id=auth.uid() OR student_row.account_holder_id=auth.uid())
      )
    $$;
    CREATE TABLE public.lesson_reschedule_requests(
      id uuid primary key default extensions.gen_random_uuid(), lesson_id uuid references public.lessons,
      teacher_id uuid, student_id uuid, initiator public.reschedule_initiator, original_scheduled_at timestamptz,
      proposed_scheduled_at timestamptz, status public.reschedule_status, reason text, request_month text,
      responded_at timestamptz, created_at timestamptz default now()
    );
    CREATE TABLE public.finance_transactions(
      id uuid primary key default extensions.gen_random_uuid(), transaction_date date, type text CONSTRAINT finance_transactions_type_check CHECK(type IN ('income','expense')),
      category text, description text, currency text, amount numeric, amount_krw numeric, exchange_rate numeric,
      exchange_rate_source text, exchange_rate_at timestamptz, supply_amount numeric, vat_amount numeric,
      tax_treatment text, source text, teacher_id uuid, teacher_name text, student_name text,
      enrollment_id uuid references public.enrollments, salary_statement_id uuid, created_at timestamptz default now()
    );
    CREATE TABLE public.notifications(
      id uuid primary key default extensions.gen_random_uuid(), user_id uuid references public.profiles,
      type public.notification_type, title text, body text, payload jsonb, read_at timestamptz, created_at timestamptz default now()
    );
    INSERT INTO public.profiles VALUES
      ('${admin}','admin','Admin','ko',null,null),('${account}','student','Guardian','ko','${student}',null),('${teacher}','teacher','Teacher','en',null,null);
    INSERT INTO public.students VALUES ('${student}','${account}','JM','Kim');
    INSERT INTO public.teachers VALUES ('${teacher}','ET');
    INSERT INTO public.pricing_plans VALUES ('${plan}',20,'{"ko":{"name":"주5회 20분"}}','weekday5_20min');
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining)
      VALUES ('${enrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',87000,20,0,20);
    INSERT INTO public.payments(enrollment_id,student_id,amount,currency,status,confirmed_at) VALUES ('${enrollment}','${student}',87000,'KRW','confirmed',now());
    INSERT INTO public.chat_rooms VALUES ('${room}','${enrollment}','${student}','${teacher}',now(),now());
    INSERT INTO public.chat_messages(room_id,sender_id,sender_role,body) VALUES ('${room}','${account}','student','old message');
    INSERT INTO public.lessons(enrollment_id,teacher_id,student_id,scheduled_at,status,student_absent)
      SELECT '${enrollment}','${teacher}','${student}',now()-g*interval '1 day','completed',g=1 FROM generate_series(1,6) g;
    INSERT INTO public.lessons(enrollment_id,teacher_id,student_id,scheduled_at,status)
      SELECT '${enrollment}','${teacher}','${student}','2099-01-01'::timestamptz+g*interval '1 day','scheduled' FROM generate_series(1,14) g;
    CREATE FUNCTION public.on_lesson_completed() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER trg_on_lesson_completed AFTER UPDATE OF status ON public.lessons
      FOR EACH ROW EXECUTE FUNCTION public.on_lesson_completed();
    SELECT set_config('test.uid','${admin}',false);
  `);

  const migration = readFileSync(new URL("../supabase/migrations/048_atomic_enrollment_refunds.sql", import.meta.url), "utf8");
  await db.query(migration);
  const sessionIntegrityMigration = readFileSync(
    new URL("../supabase/migrations/055_repair_enrollment_session_counters.sql", import.meta.url),
    "utf8"
  );
  await db.query(sessionIntegrityMigration);

  const repairedCounter = (
    await db.query("select sessions_completed,sessions_remaining from public.enrollments where id=$1", [enrollment])
  ).rows[0];
  assert.equal(repairedCounter.sessions_completed, 6);
  assert.equal(repairedCounter.sessions_remaining, 14);

  const triggerEnrollment = uid(30), triggerLesson = uid(31);
  await db.query(`
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining)
      VALUES ('${triggerEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',10000,1,0,1);
    INSERT INTO public.lessons(id,enrollment_id,teacher_id,student_id,scheduled_at,status)
      VALUES ('${triggerLesson}','${triggerEnrollment}','${teacher}','${student}',now(),'scheduled');
    ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, UPDATE ON public.lessons TO authenticated;
    SET ROLE authenticated;
    UPDATE public.lessons SET status='completed' WHERE id='${triggerLesson}';
    RESET ROLE;
  `);
  const triggerCounter = (
    await db.query("select sessions_completed,sessions_remaining from public.enrollments where id=$1", [triggerEnrollment])
  ).rows[0];
  assert.equal(triggerCounter.sessions_completed, 1);
  assert.equal(triggerCounter.sessions_remaining, 0);
  console.log("PASS: session counter backfill and teacher completion trigger bypass enrollment RLS safely");

  const preview = await callPreview();
  assert.equal(preview.paidSessionsTotal, 20);
  assert.equal(preview.countedSessions, 6);
  assert.equal(preview.studentAbsentSessions, 1);
  assert.equal(preview.calculatedRefundAmount, 58000);
  assert.equal(preview.futureCancellableSessions, 14);
  assert.equal(preview.unresolvedPastSessions, 0);
  console.log("PASS: one bounded preview aggregates policy inputs and backfilled paid-session basis");

  await assert.rejects(finalize(enrollment, 6, 58000, 57000), /adjustment_reason_required/);
  assert.equal((await db.query("select status from public.enrollments where id=$1", [enrollment])).rows[0].status, "active");
  const result = await finalize(enrollment, 6, 58000, 58000);
  assert.equal(result.cancelledLessonCount, 14);
  assert.equal((await db.query("select status,sessions_remaining from public.enrollments where id=$1", [enrollment])).rows[0].status, "cancelled");
  assert.equal(Number((await db.query("select count(*) n from public.lessons where enrollment_id=$1 and status='cancelled'", [enrollment])).rows[0].n), 14);
  assert.equal((await db.query("select type,category,amount from public.finance_transactions where refund_id=$1", [result.refundId])).rows[0].type, "refund");
  assert.equal(Number((await db.query("select count(*) n from public.notifications where payload->>'refundId'=$1", [result.refundId])).rows[0].n), 2);
  assert.ok((await db.query("select closed_at from public.chat_rooms where id=$1", [room])).rows[0].closed_at);
  await assert.rejects(db.query("insert into public.chat_messages(room_id,sender_id,sender_role,body) values ($1,$2,'student','blocked')", [room, account]), /chat_room_closed/);
  assert.equal(Number((await db.query("select count(*) n from public.chat_messages where room_id=$1", [room])).rows[0].n), 1);
  await assert.rejects(finalize(enrollment, 6, 58000, 58000), /enrollment_not_refundable|refund_already_finalized/);
  console.log("PASS: atomic finalization records refund, cancels lessons, closes chat, notifies users, and blocks replay");

  const secondEnrollment = uid(20), secondRoom = uid(21);
  await db.query(`
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining)
      VALUES ('${secondEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',87000,20,0,20);
    INSERT INTO public.payments(enrollment_id,student_id,amount,currency,status,confirmed_at) VALUES ('${secondEnrollment}','${student}',87000,'KRW','confirmed',now());
    INSERT INTO public.chat_rooms VALUES ('${secondRoom}','${secondEnrollment}','${student}','${teacher}',now(),now(),null,null);
    INSERT INTO public.chat_messages(room_id,sender_id,sender_role,body,created_at)
      VALUES ('${secondRoom}','${teacher}','teacher','renewal message',now()+interval '1 second');
    INSERT INTO public.chat_room_read_state(room_id,user_id,last_read_at)
      VALUES ('${room}','${account}',now()-interval '2 minutes'),('${secondRoom}','${account}',now()-interval '1 minute');
    INSERT INTO public.chat_room_presence(room_id,user_id,client_id,expires_at)
      VALUES ('${secondRoom}','${teacher}','${uid(29)}',now()+interval '1 minute');
    INSERT INTO public.notifications(user_id,type,title,body,payload)
      VALUES ('${account}','chat_message','Chat','Renewal message',jsonb_build_object('roomId','${uid(23)}'));
    INSERT INTO public.lessons(enrollment_id,teacher_id,student_id,scheduled_at,status) VALUES ('${secondEnrollment}','${teacher}','${student}',now()-interval '1 hour','scheduled');
  `);
  const blocked = await callPreview(secondEnrollment);
  assert.equal(blocked.unresolvedPastSessions, 1);
  await assert.rejects(finalize(secondEnrollment, 0, 87000, 87000), /unresolved_past_lessons/);
  assert.equal((await db.query("select status from public.enrollments where id=$1", [secondEnrollment])).rows[0].status, "active");
  console.log("PASS: unresolved past lessons fail closed without partial writes");

  const expiredEnrollment = uid(22), expiredRoom = uid(23);
  await db.query(`
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining,ended_at)
      VALUES ('${expiredEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',87000,20,20,0,now()-interval '1 day');
    INSERT INTO public.chat_rooms(id,enrollment_id,student_id,teacher_id,last_message_at,created_at,closed_at,closed_reason)
      VALUES ('${expiredRoom}','${expiredEnrollment}','${student}','${teacher}',now(),now(),null,null);
  `);
  const chatLifecycleMigration = readFileSync(
    new URL("../supabase/migrations/056_close_expired_enrollment_chats.sql", import.meta.url),
    "utf8"
  );
  await db.query(chatLifecycleMigration);
  const canonicalRoom = (
    await db.query("select id,enrollment_id,closed_at from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])
  ).rows[0];
  assert.equal(canonicalRoom.id, secondRoom);
  assert.equal(canonicalRoom.closed_at, null);
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0].n),
    1
  );
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_messages where room_id=$1", [canonicalRoom.id])).rows[0].n),
    2
  );
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_room_aliases where canonical_room_id=$1", [canonicalRoom.id])).rows[0].n),
    2
  );
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_room_read_state where room_id=$1 and user_id=$2", [canonicalRoom.id, account])).rows[0].n),
    1
  );
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_room_presence where room_id=$1 and user_id=$2", [canonicalRoom.id, teacher])).rows[0].n),
    1
  );
  assert.equal(
    (await db.query("select payload->>'roomId' room_id from public.notifications where title='Chat'")).rows[0].room_id,
    canonicalRoom.id
  );
  await db.query(`SELECT set_config('test.uid','${account}',false)`);
  assert.equal((await db.query("select public.resolve_chat_room_id($1) id", [room])).rows[0].id, canonicalRoom.id);
  assert.equal((await db.query("select public.resolve_chat_room_id($1) id", [expiredRoom])).rows[0].id, canonicalRoom.id);
  console.log("PASS: duplicate rooms merge atomically with messages, read state, presence, and old deep links preserved");

  const futureEnrollment = uid(24), inactiveEnrollment = uid(25);
  await db.query(`
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining,ended_at)
      VALUES ('${futureEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',87000,20,0,20,now()+interval '30 days');
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining,ended_at)
      VALUES ('${inactiveEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',87000,20,20,0,now()-interval '2 days');
  `);
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0].n),
    1
  );
  assert.equal(
    Number((await db.query("select count(*) n from public.chat_rooms where enrollment_id=$1", [inactiveEnrollment])).rows[0].n),
    0
  );
  assert.equal(
    (await db.query("select id from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0].id,
    canonicalRoom.id
  );
  console.log("PASS: additional active or expired enrollments never create another pair room");

  const refundableEnrollment = uid(28);
  await db.query(`
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining,ended_at)
      VALUES ('${refundableEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',10000,1,0,1,now()+interval '10 days');
    INSERT INTO public.payments(enrollment_id,student_id,amount,currency,status,confirmed_at)
      VALUES ('${refundableEnrollment}','${student}',10000,'KRW','confirmed',now());
    INSERT INTO public.lessons(enrollment_id,teacher_id,student_id,scheduled_at,status)
      VALUES ('${refundableEnrollment}','${teacher}','${student}',now()+interval '1 day','scheduled');
    SELECT set_config('test.uid','${admin}',false);
  `);
  const pairRefund = await finalize(refundableEnrollment, 0, 10000, 10000);
  assert.equal(pairRefund.cancelledLessonCount, 1);
  assert.equal(
    (await db.query("select closed_at from public.chat_rooms where id=$1", [canonicalRoom.id])).rows[0].closed_at,
    null
  );
  await db.query("insert into public.chat_messages(room_id,sender_id,sender_role,body) values ($1,$2,'student','other enrollment still active')", [canonicalRoom.id, account]);
  console.log("PASS: refunding one enrollment does not close a pair that still has another active enrollment");

  await db.query(`SELECT set_config('test.uid','${account}',false)`);
  const inbox = (await db.query("select enrollment_id,closed_at from public.get_chat_inbox($1)", [student])).rows;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].closed_at, null);
  await db.query("insert into public.chat_messages(room_id,sender_id,sender_role,body) values ($1,$2,'student','pair remains open')", [canonicalRoom.id, account]);

  await db.query(`
    UPDATE public.enrollments
    SET status='completed', ended_at=now()-interval '1 minute'
    WHERE id IN ('${secondEnrollment}','${futureEnrollment}','${triggerEnrollment}');
  `);
  const closedPair = (await db.query("select id,closed_at from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0];
  assert.equal(closedPair.id, canonicalRoom.id);
  assert.ok(closedPair.closed_at);
  await assert.rejects(
    db.query("insert into public.chat_messages(room_id,sender_id,sender_role,body) values ($1,$2,'student','blocked after final enrollment')", [canonicalRoom.id, account]),
    /chat_room_closed/
  );

  const renewalEnrollment = uid(26);
  await db.query(`
    INSERT INTO public.enrollments(id,student_id,teacher_id,plan_id,status,payment_status,currency,total_amount,sessions_total,sessions_completed,sessions_remaining,ended_at)
      VALUES ('${renewalEnrollment}','${student}','${teacher}','${plan}','active','confirmed','KRW',87000,20,0,20,now()+interval '30 days');
  `);
  const reopenedPair = (await db.query("select id,closed_at,enrollment_id from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0];
  assert.equal(reopenedPair.id, canonicalRoom.id);
  assert.equal(reopenedPair.closed_at, null);
  assert.equal(reopenedPair.enrollment_id, renewalEnrollment);
  assert.equal(Number((await db.query("select count(*) n from public.chat_messages where room_id=$1", [canonicalRoom.id])).rows[0].n), 4);
  console.log("PASS: final enrollment closes the pair and a later renewal reopens the same room with history intact");

  const secondTeacher = uid(27);
  await db.query(`
    INSERT INTO public.profiles VALUES ('${secondTeacher}','teacher','Teacher Two','en',null,null);
    INSERT INTO public.teachers VALUES ('${secondTeacher}','ET2');
    UPDATE public.enrollments SET teacher_id='${secondTeacher}' WHERE id='${renewalEnrollment}';
  `);
  assert.ok((await db.query("select closed_at from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0].closed_at);
  assert.equal(Number((await db.query("select count(*) n from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, secondTeacher])).rows[0].n), 1);
  await db.query("update public.enrollments set teacher_id=$1 where id=$2", [teacher, renewalEnrollment]);
  assert.equal((await db.query("select id,closed_at from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0].id, canonicalRoom.id);
  assert.equal((await db.query("select closed_at from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, teacher])).rows[0].closed_at, null);
  assert.ok((await db.query("select closed_at from public.chat_rooms where student_id=$1 and teacher_id=$2", [student, secondTeacher])).rows[0].closed_at);
  console.log("PASS: teacher reassignment closes the old pair and reuses each pair's single durable room");

  await assert.rejects(callPreview(secondEnrollment), /forbidden/);
  assert.equal((await db.query("select has_function_privilege('anon','public.admin_finalize_enrollment_refund(uuid,integer,numeric,numeric,text,text,text,integer,boolean,numeric,text,timestamptz)','execute') allowed")).rows[0].allowed, false);
  console.log("PASS: refund RPCs are admin-only and anonymous execution is denied");
} finally {
  await db.end().catch(() => {});
  if (started) run("pg_ctl.exe", ["-D", dir, "-m", "fast", "-w", "stop"]);
  console.log(`Temporary test cluster stopped; diagnostic files: ${dir}`);
}
