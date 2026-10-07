import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getQuarterlyBonusEarningMonths,
  isFixedQuarterlyBonusPayoutMonth,
} from "../src/lib/teacher-salary/quarter-policy.ts";

assert.deepEqual(getQuarterlyBonusEarningMonths("2027-01"), ["2026-10", "2026-11", "2026-12"]);
assert.deepEqual(getQuarterlyBonusEarningMonths("2027-04"), ["2027-01", "2027-02", "2027-03"]);
assert.deepEqual(getQuarterlyBonusEarningMonths("2027-07"), ["2027-04", "2027-05", "2027-06"]);
assert.deepEqual(getQuarterlyBonusEarningMonths("2027-10"), ["2027-07", "2027-08", "2027-09"]);
assert.deepEqual(getQuarterlyBonusEarningMonths("2027-02"), []);
assert.equal(isFixedQuarterlyBonusPayoutMonth("2026-10"), false);
assert.equal(isFixedQuarterlyBonusPayoutMonth("2027-01"), true);

const computeSource = readFileSync("src/lib/teacher-salary/compute.ts", "utf8");
assert.match(computeSource, /getActiveNoShowDeductionTotal/);
assert.match(computeSource, /penaltyTotal \+ noShowPenaltyTotal/);
assert.match(computeSource, /lessonsInMonth\(teacherId, earningMonth\)\.length === 0/);

const migration = readFileSync("supabase/migrations/051_teacher_compensation_governance.sql", "utf8");
assert.match(migration, /UNIQUE \(lesson_id\)/);
assert.match(migration, /admin_apply_teacher_no_show/);
assert.match(migration, /admin_reverse_teacher_no_show/);
assert.match(migration, /deduction_amount_php/);
assert.match(migration, /ON CONFLICT \(lesson_id\)/);
assert.match(migration, /teacher_compensation_reviews/);
assert.match(migration, /teacher_hourly_rate_history/);
assert.match(migration, /teacher_payroll_penalty_events/);
assert.match(migration, /REVOKE ALL ON FUNCTION public\.admin_apply_teacher_no_show/);

console.log("PASS teacher compensation fixed-quarter, audit and penalty boundaries");
