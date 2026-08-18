import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const migration = read("supabase/migrations/028_schema_rls_hardening.sql");
const transactionMigration = read("supabase/migrations/029_transaction_and_column_security.sql");

const migrationSql = readdirSync(resolve(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => read(`supabase/migrations/${name}`))
  .join("\n");
const tables = [
  ...migrationSql.matchAll(/CREATE TABLE IF NOT EXISTS\s+(?:public\.)?(\w+)/gi),
].map((match) => match[1]);
const policyTables = new Set(
  [...migrationSql.matchAll(/CREATE POLICY\s+\w+\s+ON\s+(?:public\.)?(\w+)/gi)].map(
    (match) => match[1]
  )
);
const tablesWithoutPolicies = [...new Set(tables)].filter((table) => !policyTables.has(table));
if (tablesWithoutPolicies.length > 0) {
  throw new Error(`tables without an RLS policy: ${tablesWithoutPolicies.join(", ")}`);
}
console.log(`PASS all ${new Set(tables).size} declared tables have an explicit RLS policy`);

for (const requirement of [
  "teacher_salary_statements_finance_transaction_id_fkey",
  "uq_teacher_salary_statements_finance_transaction",
  "REFERENCES public.finance_transactions(id)",
]) {
  if (!migration.includes(requirement)) {
    throw new Error(`salary settlement integrity is missing: ${requirement}`);
  }
}
console.log("PASS salary settlement references are constrained and indexed");

for (const requirement of [
  "public.can_read_profile(id)",
  "REVOKE SELECT ON TABLE public.profiles FROM anon",
  "GRANT SELECT (id, full_name, avatar_url) ON public.profiles TO anon",
]) {
  if (!migration.includes(requirement)) {
    throw new Error(`profile privacy boundary is missing: ${requirement}`);
  }
}
console.log("PASS anonymous profile reads are limited to public identity fields");

for (const requirement of [
  "protect_profile_security_fields",
  "NEW.role IS DISTINCT FROM OLD.role",
  "protect_teacher_admin_fields",
  "NEW.hourly_rate_php IS DISTINCT FROM OLD.hourly_rate_php",
  "NEW.status IS DISTINCT FROM OLD.status",
]) {
  if (!migration.includes(requirement)) {
    throw new Error(`privilege escalation guard is missing: ${requirement}`);
  }
}
console.log("PASS account role and teacher payroll fields are admin-protected");

const publicRevokes = migration.match(/REVOKE ALL ON FUNCTION .* FROM PUBLIC;/g) ?? [];
if (publicRevokes.length < 10) {
  throw new Error("SECURITY DEFINER helper privileges are not fully restricted");
}
console.log("PASS SECURITY DEFINER helpers are not executable through PUBLIC");

for (const requirement of [
  "create_lesson_reschedule_request",
  "respond_lesson_reschedule_request",
  "pg_advisory_xact_lock",
  "complete_teacher_salary_settlement",
  "ON CONFLICT (salary_statement_id)",
]) {
  if (!transactionMigration.includes(requirement)) {
    throw new Error(`transaction boundary is missing: ${requirement}`);
  }
}
console.log("PASS reschedule and salary settlement mutations have database transaction boundaries");

for (const requirement of [
  "REVOKE SELECT ON TABLE public.teachers FROM anon, authenticated",
  "GRANT SELECT (id, display_name, bio, specialties, experience_years, status, timezone, created_at, updated_at)",
]) {
  if (!transactionMigration.includes(requirement)) {
    throw new Error(`teacher compensation column boundary is missing: ${requirement}`);
  }
}
console.log("PASS teacher compensation columns are excluded from direct public/authenticated reads");
