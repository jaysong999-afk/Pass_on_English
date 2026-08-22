import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.argv[2] ?? "http://localhost:3000";
const EMAIL = "e2e-teacher-james@example.org";
const ORIGINAL_PASSWORD = "DemoPass123!";
const TEMP_PASSWORD = "TeacherSettings456!";

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
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password }),
  });
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new Error(`sign-in failed: ${response.status} ${JSON.stringify(body)}`);
  return body.access_token;
}

async function api(path, token, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options.headers },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

let token = await signIn(ORIGINAL_PASSWORD);
const original = (await api("/api/teacher/settings", token)).settings;
let profileChanged = false;
let passwordChanged = false;

const editable = (settings, temporary = false) => ({
  displayName: temporary ? `${settings.teacher.displayName} Test` : settings.teacher.displayName,
  bio: settings.teacher.bio,
  specialties: settings.teacher.specialties,
  experienceYears: settings.teacher.experienceYears,
  avatarUrl: settings.teacher.avatarUrl ?? "",
  phone: temporary ? "+63-917-999-0001" : settings.phone,
  address: temporary ? `${settings.address} Test` : settings.address,
  messengerId: temporary ? `${settings.messengerId}-test` : settings.messengerId,
  videoPlatforms: settings.teacher.videoPlatforms,
});

try {
  const updated = (await api("/api/teacher/settings", token, { method: "PATCH", body: editable(original, true) })).settings;
  profileChanged = true;
  if (!updated.teacher.displayName.endsWith(" Test") || updated.phone !== "+63-917-999-0001") {
    throw new Error("editable teacher fields were not updated");
  }
  if (updated.teacher.status !== original.teacher.status || updated.teacher.hourlyRatePhp !== original.teacher.hourlyRatePhp) {
    throw new Error("admin-only teacher fields changed unexpectedly");
  }

  await api("/api/teacher/settings/password", token, { method: "POST", body: {
    currentPassword: ORIGINAL_PASSWORD, newPassword: TEMP_PASSWORD, confirmPassword: TEMP_PASSWORD,
  }});
  passwordChanged = true;
  token = await signIn(TEMP_PASSWORD);
  console.log("✓ editable teacher profile and contact fields verified");
  console.log("✓ admin-only status and hourly rate remained unchanged");
  console.log("✓ teacher password change and re-login verified");
} finally {
  if (passwordChanged) {
    token = await signIn(TEMP_PASSWORD);
    await api("/api/teacher/settings/password", token, { method: "POST", body: {
      currentPassword: TEMP_PASSWORD, newPassword: ORIGINAL_PASSWORD, confirmPassword: ORIGINAL_PASSWORD,
    }});
  }
  if (profileChanged) {
    token = await signIn(ORIGINAL_PASSWORD);
    await api("/api/teacher/settings", token, { method: "PATCH", body: editable(original) });
  }
}

console.log("✓ teacher test account restored");
