import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const registrationSource = await readFile(
  new URL("../src/lib/accounts/register-account.ts", import.meta.url),
  "utf8"
);
const sequenceMigration = await readFile(
  new URL("../supabase/migrations/039_repair_auth_refresh_token_sequence.sql", import.meta.url),
  "utf8"
);
const profileMigration = await readFile(
  new URL("../supabase/migrations/040_restore_auth_profile_provisioning.sql", import.meta.url),
  "utf8"
);
const profileProvisioning = await readFile(
  new URL("../src/lib/auth/profile-provisioning.ts", import.meta.url),
  "utf8"
);
const teacherRegistration = await readFile(
  new URL("../src/lib/teacher-applications/register-applicant.ts", import.meta.url),
  "utf8"
);

assert.doesNotMatch(
  registrationSource,
  /\.listUsers\s*\(/,
  "partial signup recovery must not scan the entire Auth user directory"
);
assert.match(
  registrationSource,
  /signInWithPassword[\s\S]*\.eq\("account_holder_id", user\.id\)/,
  "partial signup recovery must prove the password and check the exact account"
);
assert.match(
  sequenceMigration,
  /pg_get_serial_sequence\('auth\.refresh_tokens', 'id'\)/,
  "the migration must resolve the actual refresh-token identity sequence"
);
assert.match(
  sequenceMigration,
  /LOCK TABLE auth\.refresh_tokens IN SHARE ROW EXCLUSIVE MODE/,
  "sequence repair must prevent concurrent token inserts from racing setval"
);
assert.match(
  sequenceMigration,
  /setval\(sequence_name::regclass, greatest_id, true\)/,
  "the identity sequence must advance to the current maximum id"
);
assert.doesNotMatch(
  sequenceMigration,
  /DELETE\s+FROM\s+auth\.refresh_tokens/i,
  "sequence repair must preserve existing sessions"
);
assert.match(
  profileMigration,
  /CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)/,
  "profile provisioning function must be restored"
);
assert.match(
  profileMigration,
  /CREATE TRIGGER on_auth_user_created/,
  "missing auth profile trigger must be recreated"
);
assert.match(
  profileMigration,
  /LEFT JOIN public\.profiles p ON p\.id = u\.id[\s\S]*WHERE p\.id IS NULL/,
  "existing Auth users with missing profiles must be backfilled"
);
assert.doesNotMatch(
  profileMigration,
  /DROP TRIGGER/i,
  "hosted Supabase postgres must not try to drop an auth-owned trigger"
);
assert.match(
  profileProvisioning,
  /\.eq\("role", input\.role\)/,
  "server fallback must never overwrite a different account role"
);
assert.match(
  profileProvisioning,
  /\.from\("profiles"\)\.insert\(\{[\s\S]*id: input\.userId,[\s\S]*role: input\.role/,
  "server fallback must create a missing profile"
);
assert.match(
  registrationSource,
  /ensurePrivilegedAuthProfile/,
  "student signup must ensure its Auth profile exists"
);
assert.match(
  teacherRegistration,
  /ensurePrivilegedAuthProfile/,
  "teacher signup must ensure its Auth profile exists"
);

console.log("Signup Auth boundaries verified.");
