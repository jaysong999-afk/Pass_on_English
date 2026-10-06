// Isolated PostgreSQL verification. Never reads .env or contacts Supabase.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";

const bin = process.env.CHAT_TEST_PG_BIN ?? "C:/Program Files/PostgreSQL/18/bin";
const dir = mkdtempSync(join(tmpdir(), "passon-chat-test-"));
const port = 55450;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function run(name, args) {
  const result = spawnSync(join(bin, name), args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: "ignore",
    timeout: 90000,
  });
  if (result.status !== 0) throw new Error(`${name}: ${result.error ?? result.stderr ?? result.stdout}`);
}

const db = new pg.Client({ host: "127.0.0.1", port, database: "postgres", user: "postgres" });
let started = false;

try {
  run("initdb.exe", ["-D", dir, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"]);
  run("pg_ctl.exe", ["-D", dir, "-l", join(dir, "server.log"), "-o", `-h 127.0.0.1 -p ${port}`, "-w", "start"]);
  started = true;
  await db.connect();

  await db.query(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TYPE public.user_role AS ENUM ('student', 'teacher', 'admin');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.profiles(
      id uuid PRIMARY KEY,
      role public.user_role NOT NULL,
      active_student_id uuid,
      full_name text,
      avatar_url text
    );
    CREATE TABLE public.students(
      id uuid PRIMARY KEY,
      account_holder_id uuid NOT NULL REFERENCES public.profiles(id),
      full_name text,
      english_name text NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.teachers(
      id uuid PRIMARY KEY REFERENCES public.profiles(id),
      display_name text NOT NULL
    );
    CREATE TABLE public.chat_rooms(
      id uuid PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES public.students(id),
      teacher_id uuid NOT NULL REFERENCES public.teachers(id),
      last_message_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.chat_messages(
      id uuid PRIMARY KEY,
      room_id uuid NOT NULL REFERENCES public.chat_rooms(id),
      sender_id uuid NOT NULL REFERENCES public.profiles(id),
      sender_role public.user_role NOT NULL,
      body text NOT NULL,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TABLE public.admin_direct_threads(
      id uuid PRIMARY KEY,
      target_type text NOT NULL CHECK (target_type IN ('student', 'teacher')),
      student_id uuid REFERENCES public.students(id),
      teacher_id uuid REFERENCES public.teachers(id),
      profile_id uuid NOT NULL REFERENCES public.profiles(id),
      last_message_at timestamptz,
      last_message_preview text NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE public.admin_direct_messages(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      thread_id uuid NOT NULL REFERENCES public.admin_direct_threads(id),
      sender_role text NOT NULL CHECK (sender_role IN ('admin', 'student', 'teacher')),
      sender_id uuid REFERENCES public.profiles(id),
      body text NOT NULL,
      read_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    $$;
    CREATE FUNCTION public.can_access_chat_room(p_room_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.chat_rooms room
        JOIN public.students student ON student.id = room.student_id
        WHERE room.id = p_room_id
          AND (public.is_admin() OR room.teacher_id = auth.uid() OR student.account_holder_id = auth.uid())
      )
    $$;
    CREATE FUNCTION public.can_access_admin_direct_thread(p_thread_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
      SELECT EXISTS (
        SELECT 1 FROM public.admin_direct_threads thread
        WHERE thread.id = p_thread_id
          AND (public.is_admin() OR thread.profile_id = auth.uid())
      )
    $$;
  `);

  const studentProfile = uid(1), teacher = uid(2), admin = uid(3);
  const student = uid(4), room = uid(5), thread = uid(6);
  await db.query(`
    INSERT INTO public.profiles(id, role, active_student_id, full_name) VALUES
      ('${studentProfile}', 'student', '${student}', 'Guardian'),
      ('${teacher}', 'teacher', NULL, 'Teacher'),
      ('${admin}', 'admin', NULL, 'Admin');
    INSERT INTO public.students(id, account_holder_id, full_name, english_name)
      VALUES ('${student}', '${studentProfile}', '학생', 'Student');
    INSERT INTO public.teachers(id, display_name) VALUES ('${teacher}', 'ET');
    INSERT INTO public.chat_rooms(id, student_id, teacher_id)
      VALUES ('${room}', '${student}', '${teacher}');
    INSERT INTO public.chat_messages(id, room_id, sender_id, sender_role, body, created_at) VALUES
      ('${uid(7)}', '${room}', '${teacher}', 'teacher', 'Teacher message', now() - interval '2 minutes'),
      ('${uid(8)}', '${room}', '${studentProfile}', 'student', 'Student message', now() - interval '1 minute');
    INSERT INTO public.admin_direct_threads(id, target_type, student_id, profile_id)
      VALUES ('${thread}', 'student', '${student}', '${studentProfile}');
  `);

  await db.query(readFileSync(new URL("../supabase/migrations/045_chat_delivery_consistency.sql", import.meta.url), "utf8"));

  const asUser = async (userId, sql, params = []) => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
    return db.query(sql, params);
  };

  let inbox = await asUser(studentProfile, "SELECT unread::int FROM public.get_chat_inbox($1)", [student]);
  assert.equal(inbox.rows[0].unread, 1);
  await asUser(studentProfile, "SELECT public.mark_chat_room_read($1)", [room]);
  inbox = await asUser(studentProfile, "SELECT unread::int FROM public.get_chat_inbox($1)", [student]);
  assert.equal(inbox.rows[0].unread, 0);

  let adminInbox = await asUser(admin, "SELECT unread::int FROM public.get_chat_inbox(NULL)");
  assert.equal(adminInbox.rows[0].unread, 2);
  await asUser(admin, "SELECT public.mark_chat_room_read($1)", [room]);
  assert.equal(
    Number((await db.query("SELECT COUNT(*) FROM public.chat_messages WHERE read_at IS NULL")).rows[0].count),
    1,
    "admin monitoring must not change participant read receipts"
  );

  await db.query(
    "INSERT INTO public.chat_messages(id,room_id,sender_id,sender_role,body) VALUES($1,$2,$3,'teacher','New')",
    [uid(9), room, teacher]
  );
  inbox = await asUser(studentProfile, "SELECT unread::int FROM public.get_chat_inbox($1)", [student]);
  adminInbox = await asUser(admin, "SELECT unread::int FROM public.get_chat_inbox(NULL)");
  assert.equal(inbox.rows[0].unread, 1);
  assert.equal(adminInbox.rows[0].unread, 1);
  console.log("PASS per-profile read cursors isolate student, teacher, and admin badges");

  let sent = await asUser(
    studentProfile,
    "SELECT * FROM public.send_admin_direct_message($1,$2)",
    [thread, "Need help"]
  );
  assert.equal(sent.rows[0].sender_role, "student");
  let directInbox = await asUser(admin, "SELECT * FROM public.get_admin_direct_inbox()");
  assert.equal(directInbox.rows[0].unread, "1");
  assert.equal(directInbox.rows[0].last_message, "Need help");
  const directMessages = await asUser(
    admin,
    "SELECT * FROM public.get_admin_direct_thread_messages($1)",
    [thread]
  );
  assert.equal(directMessages.rows.length, 1);
  sent = await asUser(admin, "SELECT * FROM public.send_admin_direct_message($1,$2)", [thread, "Reply"]);
  assert.equal(sent.rows[0].target_profile_id, studentProfile);
  await assert.rejects(
    asUser(teacher, "SELECT * FROM public.send_admin_direct_message($1,$2)", [thread, "Forbidden"]),
    /forbidden/
  );
  console.log("PASS admin direct send is atomic, authorized, and immediately queryable");

  assert.equal(
    (await db.query("SELECT has_function_privilege('anon','public.send_admin_direct_message(uuid,text)','execute') allowed")).rows[0].allowed,
    false
  );
  assert.equal(
    (await db.query("SELECT has_function_privilege('authenticated','public.send_admin_direct_message(uuid,text)','execute') allowed")).rows[0].allowed,
    true
  );
  console.log("PASS chat RPCs reject anonymous execution and retain authenticated access");
} finally {
  await db.end().catch(() => {});
  if (started) run("pg_ctl.exe", ["-D", dir, "-m", "fast", "-w", "stop"]);
  console.log(`Temporary chat test cluster stopped; diagnostic files: ${dir}`);
}
