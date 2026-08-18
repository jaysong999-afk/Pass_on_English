import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const separator = line.indexOf("=");
  if (separator < 1 || line.trimStart().startsWith("#")) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  if (!process.env[key]) process.env[key] = value;
}

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const { data, error } = await supabase.auth.signInWithPassword({
  email: "e2e-teacher-james@example.org",
  password: "DemoPass123!",
});
if (error || !data.session) throw error ?? new Error("teacher_sign_in_failed");

const response = await fetch(`${baseUrl}/api/teacher/salary`, {
  headers: { Authorization: `Bearer ${data.session.access_token}` },
});
const text = await response.text();
const payload = text ? JSON.parse(text) : null;
if (!response.ok) {
  throw new Error(`salary API ${response.status}: ${JSON.stringify(payload)}`);
}
if (!Array.isArray(payload?.availableMonths)) {
  throw new Error("salary API response is missing availableMonths");
}
const teacherStatement = payload.statements?.[0];
if (!teacherStatement) throw new Error("salary API response is missing a statement");
if (teacherStatement.quarterlyBonus !== 0) {
  throw new Error(`new teacher received quarterly bonus: ${teacherStatement.quarterlyBonus}`);
}
if (teacherStatement.perfectAttendanceBonus !== 0) {
  throw new Error(
    `teacher received perfect-attendance bonus before completing a full prior month: ${teacherStatement.perfectAttendanceBonus}`
  );
}

const { data: adminAuth, error: adminAuthError } = await supabase.auth.signInWithPassword({
  email: "demo-admin@example.org",
  password: "DemoPass123!",
});
if (adminAuthError || !adminAuth.session) {
  throw adminAuthError ?? new Error("admin_sign_in_failed");
}
const adminResponse = await fetch(
  `${baseUrl}/api/admin/teacher-salary?month=${encodeURIComponent(teacherStatement.month)}`,
  { headers: { Authorization: `Bearer ${adminAuth.session.access_token}` } }
);
const adminPayload = JSON.parse(await adminResponse.text());
if (!adminResponse.ok) {
  throw new Error(`admin salary API ${adminResponse.status}: ${JSON.stringify(adminPayload)}`);
}
const adminStatement = adminPayload.rows?.find(
  (row) => row.teacherId === teacherStatement.teacherId
);
if (!adminStatement) throw new Error("teacher statement is missing from admin salary overview");
if (adminStatement.quarterlyBonus !== teacherStatement.quarterlyBonus) {
  throw new Error("teacher and admin quarterly bonus values do not match");
}
if (adminStatement.perfectAttendanceBonus !== teacherStatement.perfectAttendanceBonus) {
  throw new Error("teacher and admin perfect-attendance bonus values do not match");
}

console.log(
  `PASS teacher/admin salary API (${response.status}, months=${payload.availableMonths.length}, perfect=${teacherStatement.perfectAttendanceBonus}, quarterly=${teacherStatement.quarterlyBonus})`
);
