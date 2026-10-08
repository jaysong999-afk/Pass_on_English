import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const migration = read("supabase/migrations/053_enrollment_reschedule_policy.sql");
const compatibilityMigration = read("supabase/migrations/054_legacy_reschedule_rpc_compatibility.sql");
const route = read("src/app/api/lessons/reschedule/route.ts");
const policy = read("src/lib/reschedule-policy.ts");
const repository = read("src/lib/reschedule/repository.ts");
const salary = read("src/lib/teacher-salary/compute.ts");
const maintenance = read("src/lib/lesson-scheduler-bootstrap.ts");

assert.match(migration, /student_reschedule_limit integer NOT NULL DEFAULT 2/);
assert.match(migration, /interval '2 hours'/);
assert.match(migration, /student-reschedule:enrollment:/);
assert.match(migration, /status IN \('pending_student_approval', 'pending_teacher_approval', 'approved'\)/);
assert.match(migration, /teacher_attendance_policy_events/);
assert.match(migration, /v_teacher_approved_count >= 2/);
assert.match(migration, /teacher_bonus_policy_applies = true/);
assert.match(migration, /closed_reason = 'expired_at_start'/);
assert.match(migration, /expire_due_lesson_reschedule_requests/);
assert.match(compatibilityMigration, /p_request_month text/);
assert.match(compatibilityMigration, /SELECT public\.create_lesson_reschedule_request\([\s\S]*p_initiator[\s\S]*\);/);
assert.match(compatibilityMigration, /FROM PUBLIC, anon/);
assert.doesNotMatch(route, /ensureRescheduleWorkflowBootstrapped|ensureSchedulesBootstrapped/);
assert.doesNotMatch(repository, /warmLessonCache|warmEnrollmentCache|isTeacherSlotFree/);
assert.match(repository, /limit = 100/);
assert.match(repository, /\.limit\(limit\)/);
assert.match(repository, /\.eq\("teacher_id", teacherId\)/);
assert.match(policy, /RESCHEDULE_REQUEST_LEAD_TIME_MS = 2 \* 60 \* 60 \* 1000/);
assert.match(policy, /TRIAL_STUDENT_RESCHEDULE_LIMIT = 1/);
assert.match(salary, /isScheduleChangePerfectAttendanceForfeited/);
assert.match(salary, /isScheduleChangeQuarterlyBonusReset/);
assert.match(maintenance, /expireDueRescheduleRequestsInDb/);

console.log("Reschedule policy boundaries passed.");
