/**
 * Apply migrations newer than the latest remote migration to the linked project.
 *
 * Migration ordering and schema history belong to `supabase db push`. E2E fixtures
 * live under `supabase/seeds`, outside the production migration history.
 */
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const requiredMigrations = [
  "026_profile_country_timezone.sql",
  "027_salary_settlement_persistence.sql",
  "028_schema_rls_hardening.sql",
  "029_transaction_and_column_security.sql",
];

function assertRequiredMigrationsExist() {
  for (const migration of requiredMigrations) {
    const path = resolve(projectRoot, "supabase/migrations", migration);
    if (!existsSync(path)) throw new Error(`Migration not found: ${path}`);
  }
}

function applyWithSupabaseCli() {
  const executable = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx supabase db push"]
    : ["supabase", "db", "push"];
  const result = spawnSync(executable, args, {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`supabase db push failed with exit code ${result.status}`);
  }
}

try {
  assertRequiredMigrationsExist();
  console.log("Applying pending Supabase migrations (026-029 required)...\n");
  applyWithSupabaseCli();
  console.log("Supabase migrations applied successfully.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
