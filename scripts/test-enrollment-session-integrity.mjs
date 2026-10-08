import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getSessionsUsed,
  isUsableEnrollment,
  sumActiveSessionBalance,
} from "../src/lib/sessions.ts";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");

const active = {
  status: "active",
  paymentStatus: "confirmed",
  sessionsTotal: 12,
  sessionsCompleted: 10,
  sessionsRemaining: 2,
};
const cancelled = {
  status: "cancelled",
  paymentStatus: "rejected",
  sessionsTotal: 20,
  sessionsCompleted: 0,
  sessionsRemaining: 20,
};
const pending = {
  status: "pending_payment",
  paymentStatus: "reported",
  sessionsTotal: 20,
  sessionsCompleted: 0,
  sessionsRemaining: 20,
};

assert.equal(isUsableEnrollment(active), true);
assert.equal(isUsableEnrollment(cancelled), false);
assert.equal(isUsableEnrollment(pending), false);
assert.deepEqual(sumActiveSessionBalance([active, cancelled, pending]), {
  remaining: 2,
  total: 12,
});
assert.equal(getSessionsUsed(active), 10);

const migration = read("supabase/migrations/055_repair_enrollment_session_counters.sql");
const sessionRoute = read("src/app/api/enrollments/[id]/sessions/route.ts");
const authConstants = read("src/lib/auth/constants.ts");
const editor = read("src/components/admin/EnrollmentSessionEditor.tsx");
const adminDetail = read("src/app/admin/students/[id]/page.tsx");
const enrollmentRoute = read("src/app/api/enrollments/route.ts");
const studentDetailRoute = read("src/app/api/admin/students/[id]/route.ts");
const enrollmentRepository = read("src/lib/enrollments/repository.ts");
const schedulerBootstrap = read("src/lib/lesson-scheduler-bootstrap.ts");

assert.match(migration, /SECURITY DEFINER/);
assert.match(migration, /SET search_path = pg_catalog/);
assert.match(migration, /ELSIF NEW\.enrollment_id IS NOT NULL/);
assert.match(migration, /GET DIAGNOSTICS updated_count = ROW_COUNT/);
assert.match(migration, /AND NOT lesson\.is_trial/);
assert.match(migration, /missing_completed/);
assert.match(
  migration,
  /viewer\.role = 'admin'::public\.user_role\s+AND \(p_student_id IS NULL OR room\.student_id = p_student_id\)/
);
assert.match(sessionRoute, /guardAdminApi/);
assert.doesNotMatch(sessionRoute, /adjustEnrollmentSessionsInDb/);
assert.match(sessionRoute, /invalid_action/);
assert.match(authConstants, /\/sessions\$\/\.test\(pathname\)/);
assert.match(editor, /filter\(isUsableEnrollment\)/);
assert.match(editor, /statuses=scheduled,reschedule_pending/);
assert.match(editor, /지난 미처리 수업/);
assert.match(adminDetail, /filter\(isUsableEnrollment\)/);
assert.match(enrollmentRoute, /listStudentEnrollmentsInDb/);
assert.match(studentDetailRoute, /listStudentLessonsInDb\(id\)/);
assert.match(
  enrollmentRepository,
  /plan:pricing_plans!enrollments_plan_id_fkey\([\s\S]*?plan_type,[\s\S]*?sessions_count,[\s\S]*?session_minutes,[\s\S]*?description/
);
assert.match(enrollmentRepository, /\.select\(STUDENT_ENROLLMENT_SELECT\)/);
assert.match(
  enrollmentRepository,
  /planLabel: planLabel \?\? \(plan \? formatPlanLabel\(plan, "ko"\) : "플랜 정보 없음"\)/
);
assert.doesNotMatch(enrollmentRepository, /formatPlanLabel\(plan, "ko"\) : row\.plan_id/);
assert.match(
  schedulerBootstrap,
  /export const ensureEnrollmentsBootstrapped = async \(\) => \{\s+await ensurePricingPlansBootstrapped\(\);\s+await ensureReadModel\("enrollments", warmEnrollmentCache\);/
);
assert.doesNotMatch(studentDetailRoute, /ensureAdminStudentsBootstrapped|ensureLessonsBootstrapped/);
assert.doesNotMatch(
  enrollmentRoute.slice(
    enrollmentRoute.indexOf("if (studentId)"),
    enrollmentRoute.indexOf("await ensureEnrollmentsBootstrapped")
  ),
  /ensureEnrollmentsBootstrapped/
);

console.log("Enrollment session integrity boundaries passed.");
