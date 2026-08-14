/**
 * Apply production RLS migration (017) to remote Supabase Postgres.
 *
 * Option A — Supabase CLI (linked project):
 *   npx supabase link --project-ref <ref>
 *   npm run apply:rls
 *
 * Option B — direct Postgres URL:
 *   set DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
 *   npm run apply:rls
 *
 * Option C — Supabase Dashboard → SQL Editor → paste supabase/migrations/017_production_rls.sql
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(__dirname, "../supabase/migrations/017_production_rls.sql");

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
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

async function applyWithPg(sql) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    return { ok: false, reason: "pg package not installed — run: npm install --save-dev pg" };
  }

  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    return { ok: false, reason: "DATABASE_URL or SUPABASE_DB_URL not set" };
  }

  const client = new pg.default.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    return { ok: true, method: "pg" };
  } finally {
    await client.end();
  }
}

function applyWithSupabaseCli() {
  const result = spawnSync(
    "npx",
    ["supabase", "db", "push", "--include-all"],
    { cwd: resolve(__dirname, ".."), encoding: "utf8", shell: true }
  );
  if (result.status === 0) {
    return { ok: true, method: "supabase db push", output: result.stdout };
  }
  return {
    ok: false,
    reason: result.stderr || result.stdout || `exit ${result.status}`,
    method: "supabase db push",
  };
}

async function main() {
  loadEnvLocal();

  if (!existsSync(MIGRATION)) {
    throw new Error(`Migration not found: ${MIGRATION}`);
  }

  const sql = readFileSync(MIGRATION, "utf8");
  console.log("Applying Supabase RLS migrations (017+)…\n");

  const pgResult = await applyWithPg(sql);
  if (pgResult.ok) {
    console.log(`✓ Applied via ${pgResult.method}`);
    return;
  }
  console.warn(`PG apply skipped: ${pgResult.reason}`);

  const cliResult = applyWithSupabaseCli();
  if (cliResult.ok) {
    console.log(`✓ Applied via ${cliResult.method}`);
    if (cliResult.output) console.log(cliResult.output);
    return;
  }
  console.warn(`Supabase CLI skipped: ${cliResult.reason}`);

  console.error(`
Could not apply migration automatically.

Manual steps:
1. Open Supabase Dashboard → SQL Editor for project ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "(your project)"}
2. Paste contents of: supabase/migrations/017_production_rls.sql
3. Run the query
4. Then run: npm run test:rls
`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
