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

const BASE = process.argv[2] ?? "http://localhost:3000";
const PASSWORD = "DemoPass123!";
const JAMES_ID = "b0000001-0000-4000-8000-000000000001";
const ACTIVE_ENROLLMENT_ID = "b0000001-0000-4000-8000-00000000012f";
const FINANCE_ENROLLMENT_IDS = [
  ACTIVE_ENROLLMENT_ID,
  "b0000001-0000-4000-8000-000000000130",
  "b0000001-0000-4000-8000-000000000131",
];

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) throw new Error("Supabase environment is incomplete");

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function monthInSeoul(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date(value));
}

async function tokenFor(email) {
  const auth = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await auth.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error(`sign-in failed: ${email}`);
  return data.session.access_token;
}

async function getJson(path, token) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(payload)}`);
  return payload;
}

const { data: lessons, error: lessonError } = await db
  .from("lessons")
  .select("id, enrollment_id, teacher_id, scheduled_at, duration_minutes, status, teacher_no_show, unpaid_for_teacher, related_lesson_id")
  .eq("teacher_id", JAMES_ID);
if (lessonError) throw new Error(lessonError.message);

const noShows = lessons.filter(
  (lesson) => lesson.enrollment_id === ACTIVE_ENROLLMENT_ID && lesson.teacher_no_show
);
if (noShows.length !== 1) throw new Error(`expected one E2E no-show, got ${noShows.length}`);
const original = noShows[0];
const makeup = lessons.find((lesson) => lesson.id === original.related_lesson_id);
if (!makeup || makeup.related_lesson_id !== original.id) {
  throw new Error("no-show and makeup lessons are not linked in both directions");
}
if (original.status !== "cancelled" || !original.unpaid_for_teacher || makeup.status !== "scheduled") {
  throw new Error("no-show or makeup lesson state is invalid");
}

const teacherToken = await tokenFor("e2e-teacher-james@example.org");
const adminToken = await tokenFor("demo-admin@example.org");
const salaryPayload = await getJson("/api/teacher/salary", teacherToken);
const completed = lessons.filter(
  (lesson) => lesson.status === "completed" && !lesson.unpaid_for_teacher
);
const salaryRows = [];
for (const statement of salaryPayload.statements ?? []) {
  const monthLessons = completed.filter(
    (lesson) => monthInSeoul(lesson.scheduled_at) === statement.month
  );
  const minutes = monthLessons.reduce((sum, lesson) => sum + lesson.duration_minutes, 0);
  const expectedHours = Math.round((minutes / 60) * 10) / 10;
  const expectedBase = Math.round(expectedHours * statement.hourlyRate);
  if (
    statement.completedClasses !== monthLessons.length ||
    statement.totalHours !== expectedHours ||
    statement.baseSalary !== expectedBase
  ) {
    throw new Error(`salary mismatch ${statement.month}: ${JSON.stringify({ statement, minutes })}`);
  }
  const adminPayload = await getJson(
    `/api/admin/teacher-salary?month=${encodeURIComponent(statement.month)}`,
    adminToken
  );
  const adminStatement = adminPayload.rows?.find((row) => row.teacherId === JAMES_ID);
  if (!adminStatement || adminStatement.baseSalary !== statement.baseSalary) {
    throw new Error(`admin/teacher salary mismatch for ${statement.month}`);
  }
  salaryRows.push({
    month: statement.month,
    completedClasses: monthLessons.length,
    minutes,
    hours: expectedHours,
    hourlyRatePhp: statement.hourlyRate,
    baseSalaryPhp: expectedBase,
  });
}
if (!salaryRows.length) throw new Error("no salary statements were reconciled");

const { data: transactions, error: financeError } = await db
  .from("finance_transactions")
  .select("id, enrollment_id, currency, amount, amount_krw, supply_amount, vat_amount, tax_treatment, exchange_rate, exchange_rate_source, exchange_rate_at")
  .in("enrollment_id", FINANCE_ENROLLMENT_IDS);
if (financeError) throw new Error(financeError.message);
if (transactions.length !== 3) {
  throw new Error(`expected three E2E finance transactions, got ${transactions.length}`);
}

const financeRows = transactions.map((transaction) => {
  const amount = Number(transaction.amount);
  const amountKrw = Number(transaction.amount_krw);
  const supply = Number(transaction.supply_amount);
  const vat = Number(transaction.vat_amount);
  if (transaction.currency === "KRW") {
    if (amountKrw !== amount || supply + vat !== amount) {
      throw new Error(`KRW transaction mismatch: ${transaction.id}`);
    }
  } else if (transaction.currency === "CNY") {
    const rate = Number(transaction.exchange_rate);
    if (!rate || amountKrw !== Math.round(amount * rate)) {
      throw new Error(`CNY conversion mismatch: ${transaction.id}`);
    }
    if (!transaction.exchange_rate_source || !transaction.exchange_rate_at) {
      throw new Error(`CNY audit fields missing: ${transaction.id}`);
    }
  }
  return {
    currency: transaction.currency,
    amount,
    exchangeRate: transaction.exchange_rate == null ? null : Number(transaction.exchange_rate),
    amountKrw,
    supply,
    vat,
    taxTreatment: transaction.tax_treatment,
  };
});

console.log("PASS release reconciliation");
console.log(JSON.stringify({
  salary: salaryRows,
  noShow: {
    originalId: original.id,
    makeupId: makeup.id,
    originalUnpaid: original.unpaid_for_teacher,
    makeupStatus: makeup.status,
  },
  finance: financeRows,
}, null, 2));
