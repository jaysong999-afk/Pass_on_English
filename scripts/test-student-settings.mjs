import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = "e2e-student-guardian@example.org";
const ORIGINAL_PASSWORD = "DemoPass123!";
const TEMP_PASSWORD = "SettingsTest456!";
const SEED_PHONE = "010-2001-0007";
const SEED_COUNTRY = "KR";

for (const line of readFileSync(resolve(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const split = trimmed.indexOf("=");
  if (split < 1) continue;
  const key = trimmed.slice(0, split).trim();
  const value = trimmed.slice(split + 1).trim().replace(/^['"]|['"]$/g, "");
  if (!process.env[key]) process.env[key] = value;
}

async function signIn(password) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: EMAIL, password }),
    }
  );
  const body = await response.json();
  if (!response.ok || !body.access_token) {
    throw new Error(`sign-in failed: ${response.status} ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

let token = await signIn(ORIGINAL_PASSWORD);
const originalSession = await api("/api/student/account", token);
const original = originalSession.account;
const originalLearners = originalSession.learners;
if (original.accountType !== "guardian" || originalLearners.length < 2) {
  throw new Error("multi-child guardian seed is required");
}
const temporaryPhone = `010-${String(Date.now()).slice(-4)}-9999`;
const temporaryLearners = originalLearners.map((learner, index) => ({
  id: learner.id,
  englishName: `${learner.englishName} T${index + 1}`,
}));
let profileChanged = false;
let passwordChanged = false;

try {
  const profile = await api("/api/student/settings/profile", token, {
    method: "PATCH",
    body: { phone: temporaryPhone, country: "CN", learners: temporaryLearners },
  });
  profileChanged = true;
  if (profile.account.phone !== temporaryPhone) throw new Error("profile phone was not updated");
  if (profile.account.country !== "CN" || profile.account.timezone !== "Asia/Shanghai") {
    throw new Error("country/timezone mapping was not updated");
  }
  for (const expected of temporaryLearners) {
    if (profile.learners.find((learner) => learner.id === expected.id)?.englishName !== expected.englishName) {
      throw new Error(`learner English name was not updated: ${expected.id}`);
    }
  }

  await api("/api/student/settings/password", token, {
    method: "POST",
    body: {
      currentPassword: ORIGINAL_PASSWORD,
      newPassword: TEMP_PASSWORD,
      confirmPassword: TEMP_PASSWORD,
    },
  });
  passwordChanged = true;
  token = await signIn(TEMP_PASSWORD);

  console.log("✓ guardian phone and country/timezone update verified");
  console.log("✓ multiple learner English-name updates verified");
  console.log("✓ current-password verification and password change verified");
} finally {
  if (passwordChanged) {
    token = await signIn(TEMP_PASSWORD);
    await api("/api/student/settings/password", token, {
      method: "POST",
      body: {
        currentPassword: TEMP_PASSWORD,
        newPassword: ORIGINAL_PASSWORD,
        confirmPassword: ORIGINAL_PASSWORD,
      },
    });
  }
  if (profileChanged) {
    token = await signIn(ORIGINAL_PASSWORD);
    await api("/api/student/settings/profile", token, {
      method: "PATCH",
      body: {
        phone: SEED_PHONE,
        country: SEED_COUNTRY,
        learners: originalLearners.map((learner) => ({ id: learner.id, englishName: learner.englishName })),
      },
    });
  }
}

console.log("✓ test account restored");
