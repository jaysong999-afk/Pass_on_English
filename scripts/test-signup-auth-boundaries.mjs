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

console.log("Signup Auth boundaries verified.");
