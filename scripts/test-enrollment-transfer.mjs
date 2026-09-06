// Isolated temporary PostgreSQL cluster. Never reads .env or contacts Supabase.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import ts from 'typescript';
import vm from 'node:vm';

const bin = process.env.TRANSFER_TEST_PG_BIN ?? 'C:/Program Files/PostgreSQL/18/bin';
const dir = mkdtempSync(join(tmpdir(), 'passon-transfer-test-'));
const port = 55449;
function run(name, args) {
  const r = spawnSync(join(bin, name), args, { encoding: 'utf8', windowsHide: true, stdio: 'ignore', timeout: 90000 });
  if (r.status !== 0) throw new Error(`${name}: ${r.error ?? r.stderr ?? r.stdout}`);
}
const config = { host: '127.0.0.1', port, database: 'postgres', user: 'postgres' };
let started = false;
const db = new pg.Client(config);
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const from = uid(1), to = uid(2), student = uid(3), enrollment = uid(4), lesson = uid(5);
const batch = [{ enrollmentId: enrollment, toTeacherId: to }];
async function call(execute = false, transfers = batch, client = db) {
  return (await client.query('select admin_transfer_batch($1,$2,$3) as result', [from, JSON.stringify(transfers), execute])).rows[0].result;
}
async function reset(minutes = 20) {
  await db.query(`TRUNCATE admin_lesson_operation_logs,lesson_reschedule_requests,teacher_availability_exceptions,teachers_weekly_availability,lessons,enrollments,students,teachers,pricing_plans;
    INSERT INTO teachers VALUES ('${from}','active','From'),('${to}','active','ET');
    INSERT INTO students VALUES ('${student}','Student','Student');
    INSERT INTO pricing_plans VALUES ('${uid(6)}','mwf_20min','{"schedule_days":["Mon"]}',20);
    INSERT INTO enrollments(id,student_id,teacher_id,plan_id,status,payment_status,sessions_remaining,sessions_total,preferred_slot_time)
      VALUES ('${enrollment}','${student}','${from}','${uid(6)}','active','confirmed',1,1,'11:00');
    INSERT INTO lessons(id,enrollment_id,teacher_id,student_id,scheduled_at,duration_minutes)
      VALUES ('${lesson}','${enrollment}','${from}','${student}','2099-01-05T11:00:00+09:00',${minutes});`);
}
async function enable(times = ['11:00']) {
  for (const time of times) await db.query('insert into teachers_weekly_availability values ($1,$2,$3)',[to,'Mon',time]);
}
function has(result, reason) { return result.slotsByEnrollment[enrollment].issues.some(i => i.reason === reason); }

try {
  run('initdb.exe', ['-D',dir,'-U','postgres','-A','trust','--encoding=UTF8','--no-locale']);
  run('pg_ctl.exe', ['-D',dir,'-l',join(dir,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','start']);
  started = true;
  await db.connect();
  const schema = readFileSync(new URL('../supabase/migrations/001_initial_schema.sql',import.meta.url),'utf8');
  // Use the production enum definitions, not permissive text substitutes.
  for (const match of schema.matchAll(/CREATE TYPE \w+ AS ENUM\s*\([\s\S]*?\);/g)) await db.query(match[0]);
  await db.query(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uid(9)}'::uuid $$;
    CREATE FUNCTION is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.is_admin',true),'true')::boolean $$;
    CREATE TABLE teachers(id uuid primary key,status teacher_status,display_name text);
    CREATE TABLE students(id uuid primary key,english_name text,full_name text);
    CREATE TABLE pricing_plans(id uuid primary key,plan_type plan_type,description jsonb,session_minutes int);
    CREATE TABLE enrollments(id uuid primary key,student_id uuid,teacher_id uuid,plan_id uuid,status enrollment_status,payment_status payment_status,
      sessions_remaining int,sessions_total int,is_trial boolean default false,curriculum text,preferred_slot_time text,
      preferred_slot_day text,started_at timestamptz,ended_at timestamptz,created_at timestamptz default now());
    CREATE TABLE lessons(id uuid primary key,enrollment_id uuid,teacher_id uuid,student_id uuid,scheduled_at timestamptz,
      duration_minutes int,status lesson_status default 'scheduled',is_trial boolean default false,original_teacher_id uuid,operation_note text);
    CREATE TABLE teachers_weekly_availability(teacher_id uuid,day text,start_time time,primary key(teacher_id,day,start_time));
    CREATE TABLE teacher_availability_exceptions(teacher_id uuid,exception_date date);
    CREATE TABLE lesson_reschedule_requests(lesson_id uuid,status reschedule_status);
    CREATE TABLE admin_lesson_operation_logs(teacher_id uuid,lesson_id uuid,student_name text,scheduled_at timestamptz,
      week_start_key date,action text,summary text,note text,admin_name text,undoable boolean);
  `);
  await db.query(readFileSync(new URL('../supabase/migrations/044_atomic_enrollment_transfer.sql',import.meta.url),'utf8'));
  await reset();
  assert(has(await call(),'availability_off'));
  assert.equal((await call(true)).ok,false);
  assert.equal((await db.query('select teacher_id from lessons')).rows[0].teacher_id,from);
  assert.equal((await db.query('select count(*)::int as n from teachers_weekly_availability')).rows[0].n,0);
  console.log('PASS: disabled ET availability blocks preview and execution without opening slots');

  await reset(40); await enable(); assert(has(await call(),'availability_off'));
  await enable(['11:20']); assert.equal((await call()).ok,true);
  await db.query(`update pricing_plans set description='{"schedule_days":["Mon","Wed"]}'`);
  assert(has(await call(),'contract_availability_off'));
  await db.query(`update pricing_plans set description='{"schedule_days":["Mon"]}'`);
  await db.query("insert into teacher_availability_exceptions values ($1,'2099-01-05')",[to]);
  assert(has(await call(),'availability_off'));
  console.log('PASS: full 40-minute coverage, KST conversion and unavailable date exceptions');

  await reset(); await enable();
  await db.query(`insert into lessons values ('${uid(7)}',null,'${to}','${uid(8)}','2099-01-05T11:10:00+09:00',20,'scheduled',false,null,null)`);
  assert(has(await call(),'lesson_conflict'));
  await db.query('delete from lessons where id=$1',[uid(7)]);
  await db.query(`insert into enrollments(id,student_id,teacher_id,plan_id,status,payment_status,sessions_remaining,preferred_slot_time)
    values ('${uid(7)}','${uid(8)}','${to}','${uid(6)}','pending_payment','pending',1,'11:00')`);
  assert(has(await call(),'contract_conflict'));
  console.log('PASS: overlapping lesson and pending contract block transfer');

  await reset(); await enable();
  await db.query('update enrollments set sessions_remaining=2'); assert(has(await call(),'schedule_mismatch'));
  await db.query('delete from lessons'); assert.equal((await call()).ok,false);
  await reset(); await enable();
  await db.query(`insert into lesson_reschedule_requests values ('${lesson}','pending_student_approval')`);
  assert(has(await call(),'reschedule_pending'));
  console.log('PASS: missing schedules, zero lessons and pending reschedules fail closed');

  await reset(); await enable();
  await db.query(`ALTER TABLE lessons DISABLE TRIGGER guard_lesson_teacher_overlap;
    insert into enrollments select '${uid(7)}',student_id,teacher_id,plan_id,status,payment_status,sessions_remaining,sessions_total,is_trial,curriculum,preferred_slot_time,preferred_slot_day,started_at,ended_at,created_at from enrollments;
    insert into lessons select '${uid(8)}','${uid(7)}',teacher_id,student_id,scheduled_at,duration_minutes,status,is_trial,original_teacher_id,operation_note from lessons;`);
  await db.query('ALTER TABLE lessons ENABLE TRIGGER guard_lesson_teacher_overlap');
  const both = [...batch,{enrollmentId:uid(7),toTeacherId:to}];
  assert(has(await call(false,both),'batch_conflict'));
  assert.equal((await call(true,both)).ok,false);
  console.log('PASS: conflicts within one batch block the entire request');

  await reset(); await enable(); assert.equal((await call()).ok,true);
  await db.query('delete from teachers_weekly_availability'); assert.equal((await call(true)).ok,false);
  await enable();
  await db.query(`CREATE FUNCTION fail_transfer_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
    CREATE TRIGGER fail_transfer_test BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION fail_transfer_test();`);
  await assert.rejects(call(true),/injected failure/);
  assert.equal((await db.query('select teacher_id from lessons')).rows[0].teacher_id,from);
  assert.equal((await db.query('select count(*)::int n from admin_lesson_operation_logs')).rows[0].n,0);
  await db.query('DROP TRIGGER fail_transfer_test ON enrollments');
  console.log('PASS: fresh execution validation and rollback after lesson writes');

  const peer = new pg.Client(config); await peer.connect();
  try {
    await db.query('BEGIN'); assert.equal((await call(true)).ok,true);
    await peer.query("SET lock_timeout='150ms'");
    await assert.rejects(peer.query('delete from teachers_weekly_availability'),/lock timeout/);
    await assert.rejects(peer.query("insert into lessons(id,teacher_id,scheduled_at,duration_minutes) values ($1,$2,now(),20)",[uid(10),to]),/lock timeout/);
    await db.query('COMMIT');
    await assert.rejects(peer.query("insert into lessons(id,teacher_id,scheduled_at,duration_minutes) values ($1,$2,'2099-01-05T11:00:00+09:00',20)",[uid(10),to]),/teacher_lesson_overlap/);
    assert.equal((await peer.query('select teacher_id from enrollments where id=$1',[enrollment])).rows[0].teacher_id,to);
    assert.equal((await peer.query('select teacher_id from lessons where id=$1',[lesson])).rows[0].teacher_id,to);
  } finally { await peer.end(); }
  assert.equal((await call(true)).ok,false);
  console.log('PASS: atomic durable contract/lesson writes, replay blocked, concurrent legacy writes serialized');

  await db.query("set test.is_admin='false'"); await assert.rejects(call(),/forbidden/);
  await assert.rejects(db.query('select admin_transfer_enrollments($1)',[from]),/forbidden/);
  await db.query("set test.is_admin='true'");
  assert.equal((await db.query("select has_function_privilege('anon','admin_transfer_batch(uuid,jsonb,boolean)','execute') allowed")).rows[0].allowed,false);
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/admin/enrollment-transfer.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});
  assert(exports.isTransferInput({fromTeacherId:from,transfers:batch}));
  for (const value of [null,{}, {fromTeacherId:from,transfers:[...batch,...batch]}, {fromTeacherId:from,transfers:[{enrollmentId:enrollment,toTeacherId:from}]}, {fromTeacherId:from,transfers:batch,action:'force'}]) assert.equal(exports.isTransferInput(value),false);
  await reset();
  const rows = (await db.query('select admin_transfer_enrollments($1) result',[from])).rows[0].result;
  assert.equal(rows.length,1); assert.equal(rows[0].upcomingLessonCount,1); assert.equal(rows[0].scheduleInSync,true);
  await db.query(`update teachers set status='inactive' where id='${to}'`);
  assert(has(await call(),'teacher_inactive'));
  console.log('PASS: auth, request validation, bounded list DTO');
} finally {
  await db.end().catch(()=>{});
  if (started) run('pg_ctl.exe',['-D',dir,'-m','fast','-w','stop']);
  console.log(`Temporary test cluster stopped; diagnostic files: ${dir}`);
}
