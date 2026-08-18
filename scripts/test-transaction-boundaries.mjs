import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3000";
for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase env missing");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const PASSWORD = "DemoPass123!";
const JAMES = "b0000001-0000-4000-8000-000000000001";
const YERIN = "b0000001-0000-4000-8000-0000000000cc";

async function signIn(email) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`signIn ${email}: ${JSON.stringify(json)}`);
  return json.access_token;
}
async function api(path, token, method = "GET", body) {
  const response = await fetch(`${BASE}${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => ({})) };
}

const teacherToken = await signIn("e2e-teacher-james@example.org");
const adminToken = await signIn("demo-admin@example.org");
const lessonId = randomUUID();
const statementId = randomUUID();
let requestId;
let financeId;

try {
  const scheduledAt = new Date(Date.now() + 40 * 86400000);
  scheduledAt.setUTCMinutes(0, 0, 0);
  const proposedAt = new Date(scheduledAt.getTime() + 20 * 60000);
  const lessonInsert = await db.from("lessons").insert({
    id: lessonId, teacher_id: JAMES, student_id: YERIN,
    scheduled_at: scheduledAt.toISOString(), duration_minutes: 20, status: "scheduled", is_trial: false,
  });
  if (lessonInsert.error) throw lessonInsert.error;

  const created = await api("/api/lessons/reschedule", teacherToken, "POST", {
    lessonId, proposedScheduledAt: proposedAt.toISOString(), reason: "transaction boundary test",
  });
  if (created.status !== 201) throw new Error(`reschedule create ${created.status}: ${JSON.stringify(created.json)}`);
  requestId = created.json.request.id;
  const [requestAfterCreate, lessonAfterCreate] = await Promise.all([
    db.from("lesson_reschedule_requests").select("status").eq("id", requestId).single(),
    db.from("lessons").select("status").eq("id", lessonId).single(),
  ]);
  if (requestAfterCreate.data?.status !== "pending_student_approval" || lessonAfterCreate.data?.status !== "reschedule_pending") {
    throw new Error("reschedule create was not atomically persisted");
  }
  const cancelled = await api("/api/lessons/reschedule", teacherToken, "PATCH", { id: requestId, action: "cancel" });
  if (cancelled.status !== 200) throw new Error(`reschedule cancel ${cancelled.status}: ${JSON.stringify(cancelled.json)}`);
  const [requestAfterCancel, lessonAfterCancel] = await Promise.all([
    db.from("lesson_reschedule_requests").select("status").eq("id", requestId).single(),
    db.from("lessons").select("status").eq("id", lessonId).single(),
  ]);
  if (requestAfterCancel.data?.status !== "cancelled" || lessonAfterCancel.data?.status !== "scheduled") {
    throw new Error("reschedule cancel was not atomically persisted");
  }
  console.log("PASS reschedule request and lesson state transition atomically");

  const statementInsert = await db.from("teacher_salary_statements").insert({
    id: statementId, teacher_id: JAMES, month: `tx-${Date.now()}`, status: "paid",
    completed_classes: 3, total_hours: 1, hourly_rate: 150, base_salary: 150,
    perfect_attendance_bonus: 0, quarterly_bonus: 0, other_incentives: 0,
    deductions: 0, payment_date: new Date().toISOString().slice(0, 10), is_live_estimate: false,
  });
  if (statementInsert.error) throw statementInsert.error;
  const completed = await api("/api/admin/teacher-salary", adminToken, "PATCH", {
    action: "complete", id: statementId, krwTransferAmount: 3600,
  });
  if (completed.status !== 200) throw new Error(`salary complete ${completed.status}: ${JSON.stringify(completed.json)}`);
  financeId = completed.json.statement.financeTransactionId;
  const [statement, finance] = await Promise.all([
    db.from("teacher_salary_statements").select("status, finance_transaction_id").eq("id", statementId).single(),
    db.from("finance_transactions").select("id").eq("salary_statement_id", statementId),
  ]);
  if (statement.data?.status !== "completed" || statement.data.finance_transaction_id !== financeId || finance.data?.length !== 1) {
    throw new Error("salary statement and finance transaction were not atomically linked");
  }
  console.log("PASS salary completion and finance transaction atomically linked");
} finally {
  if (financeId) await db.from("finance_transactions").delete().eq("id", financeId);
  await db.from("teacher_salary_statements").delete().eq("id", statementId);
  if (requestId) await db.from("lesson_reschedule_requests").delete().eq("id", requestId);
  await db.from("lessons").delete().eq("id", lessonId);
}
