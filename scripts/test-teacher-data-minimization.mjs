import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const signup = await read("src/app/teacher/signup/page.tsx");
assert.match(signup, /City \/ Province only \(e\.g\., Cebu City, Cebu\)/);
assert.match(signup, /placeholder="Cebu City, Cebu"/);

const teacherDataFiles = await Promise.all([
  "src/app/teacher/signup/page.tsx",
  "src/app/teacher/profile/page.tsx",
  "src/app/api/teacher/applications/route.ts",
  "src/lib/teacher-applications/repository.ts",
  "src/lib/teacher-applications/register-applicant.ts",
  "src/lib/teachers/repository.ts",
  "src/lib/teacher-salary/compute.ts",
  "src/lib/teacher-salary/repository.ts",
  "src/lib/teacher-salary-store-sync.ts",
  "src/lib/admin/teacher-detail-store.ts",
  "src/lib/admin/teacher-salary-overview-store.ts",
  "src/components/admin/AdminTeacherSalaryOverview.tsx",
  "src/components/teacher/TeacherSalaryDashboard.tsx",
  "src/types/index.ts",
  "scripts/apply-e2e-seed.mjs",
  "scripts/test-api-e2e.mjs",
  "scripts/test-rls.mjs",
  "supabase/seeds/e2e_rich_seed.sql",
].map(read));

const activeTeacherData = teacherDataFiles.join("\n");
assert.doesNotMatch(activeTeacherData, /bankAccount|bank_account|payoutAccount|payout_account/);

const migration = await read("supabase/migrations/046_remove_teacher_bank_account_data.sql");
assert.match(migration, /teacher_applications[\s\S]*drop column if exists bank_account/i);
assert.match(migration, /teacher_salary_statements[\s\S]*drop column if exists payout_account/i);

const salaryUi = await read("src/components/teacher/TeacherSalaryDashboard.tsx");
assert.match(salaryUi, /Payment Schedule/);
assert.doesNotMatch(salaryUi, /Payout Account/);

console.log("Teacher data minimization checks passed.");
