import type {
  CountryCode,
  FinanceTransaction,
  StudentEnrollment,
  TaxTreatment,
  TeacherSalaryStatement,
  TransactionCategory,
} from "@/types";
import { splitTaxInclusive, convertToKrw, FALLBACK_RATES } from "@/lib/finance/accounting";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import {
  getFinanceTransactionCache,
  setFinanceTransactionCache,
  upsertFinanceTransactionInCache,
} from "@/lib/finance/finance-cache";

interface FinanceTransactionRow {
  id: string;
  transaction_date: string;
  type: "income" | "expense";
  category: string;
  description: string;
  currency: "KRW" | "CNY" | "PHP";
  amount: number;
  amount_krw: number;
  supply_amount: number;
  vat_amount: number;
  tax_treatment: string;
  source: "auto" | "manual";
  teacher_id: string | null;
  teacher_name: string | null;
  student_name: string | null;
  enrollment_id: string | null;
  salary_statement_id: string | null;
  created_at: string;
}

const SELECT_COLUMNS =
  "id, transaction_date, type, category, description, currency, amount, amount_krw, supply_amount, vat_amount, tax_treatment, source, teacher_id, teacher_name, student_name, enrollment_id, salary_statement_id, created_at";

function rowToTransaction(row: FinanceTransactionRow): FinanceTransaction {
  return {
    id: row.id,
    date: row.transaction_date,
    type: row.type,
    category: row.category as TransactionCategory,
    description: row.description,
    currency: row.currency,
    amount: Number(row.amount),
    amountKrw: Number(row.amount_krw),
    supplyAmount: Number(row.supply_amount),
    vatAmount: Number(row.vat_amount),
    taxTreatment: row.tax_treatment as FinanceTransaction["taxTreatment"],
    source: row.source,
    teacherId: row.teacher_id ?? undefined,
    teacherName: row.teacher_name ?? undefined,
    studentName: row.student_name ?? undefined,
  };
}

function transactionToRow(
  tx: FinanceTransaction,
  links?: { enrollmentId?: string; salaryStatementId?: string }
) {
  return {
    transaction_date: tx.date,
    type: tx.type,
    category: tx.category,
    description: tx.description,
    currency: tx.currency,
    amount: tx.amount,
    amount_krw: tx.amountKrw,
    supply_amount: tx.supplyAmount,
    vat_amount: tx.vatAmount,
    tax_treatment: tx.taxTreatment,
    source: tx.source,
    teacher_id: tx.teacherId ?? null,
    teacher_name: tx.teacherName ?? null,
    student_name: tx.studentName ?? null,
    enrollment_id: links?.enrollmentId ?? null,
    salary_statement_id: links?.salaryStatementId ?? null,
  };
}

async function fetchFinanceRows(): Promise<FinanceTransactionRow[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("finance_transactions")
    .select(SELECT_COLUMNS)
    .order("transaction_date", { ascending: false });

  if (error) {
    throw new Error(`finance_transactions_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as FinanceTransactionRow[];
}

export async function warmFinanceCache(): Promise<void> {
  const rows = await fetchFinanceRows();
  setFinanceTransactionCache(rows.map(rowToTransaction));
}

export function getPayrollFinanceTransactionsFromCache(): FinanceTransaction[] {
  return getFinanceTransactionCache()
    .filter((t) => t.category === "teacher_payroll")
    .map((t) => ({ ...t }));
}

export function getAllFinanceTransactionsFromCache(): FinanceTransaction[] {
  return getFinanceTransactionCache().map((t) => ({ ...t }));
}

function statementTotalPhp(s: TeacherSalaryStatement) {
  return (
    s.baseSalary +
    s.perfectAttendanceBonus +
    s.quarterlyBonus +
    s.otherIncentives -
    s.deductions
  );
}

function buildSalaryDescription(statement: TeacherSalaryStatement, krwAmount: number) {
  const monthLabel = statement.month.replace("-", "년 ") + "월";
  return `${statement.teacherName} — ${monthLabel} 급여 (₱${statementTotalPhp(statement).toLocaleString()}, 원화 ₩${krwAmount.toLocaleString()})`;
}

export function estimateKrwFromPhp(phpAmount: number): number {
  return convertToKrw(phpAmount, "PHP", FALLBACK_RATES);
}

export async function recordSalaryFinanceTransactionInDb(
  statement: TeacherSalaryStatement,
  krwTransferAmount?: number
): Promise<FinanceTransaction> {
  const phpTotal = statementTotalPhp(statement);
  const amountKrw = krwTransferAmount ?? estimateKrwFromPhp(phpTotal);
  const description = buildSalaryDescription(statement, amountKrw);
  const date = (statement.phpPaidAt ?? statement.completedAt ?? new Date().toISOString()).slice(
    0,
    10
  );

  const supabase = await createClient();
  const { data: linkedRow, error: linkedError } = await supabase
    .from("finance_transactions")
    .select(SELECT_COLUMNS)
    .eq("salary_statement_id", statement.id)
    .maybeSingle();
  if (linkedError) {
    throw new Error(`finance_transaction_lookup_failed: ${linkedError.message}`);
  }
  const existingId = statement.financeTransactionId ?? linkedRow?.id;

  const payload: FinanceTransaction = {
    id: existingId ?? crypto.randomUUID(),
    date,
    type: "expense",
    category: "teacher_payroll",
    description,
    currency: "PHP",
    amount: phpTotal,
    amountKrw,
    supplyAmount: phpTotal,
    vatAmount: 0,
    taxTreatment: "zero_rated",
    source: "auto",
    teacherId: statement.teacherId,
    teacherName: statement.teacherName,
  };

  if (existingId) {
    const { data, error } = await supabase
      .from("finance_transactions")
      .update(transactionToRow(payload, { salaryStatementId: statement.id }))
      .eq("id", existingId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw new Error(`finance_transaction_update_failed: ${error.message}`);
    const tx = rowToTransaction(data as FinanceTransactionRow);
    upsertFinanceTransactionInCache(tx);
    await refreshFinanceSnapshotForDate(tx.date);
    return tx;
  }

  const { data, error } = await supabase
    .from("finance_transactions")
    .insert(transactionToRow(payload, { salaryStatementId: statement.id }))
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("finance_transactions")
        .select(SELECT_COLUMNS)
        .eq("salary_statement_id", statement.id)
        .maybeSingle();
      if (existing) {
        const tx = rowToTransaction(existing as FinanceTransactionRow);
        upsertFinanceTransactionInCache(tx);
        return tx;
      }
    }
    throw new Error(`finance_transaction_insert_failed: ${error.message}`);
  }

  const tx = rowToTransaction(data as FinanceTransactionRow);
  upsertFinanceTransactionInCache(tx);
  await refreshFinanceSnapshotForDate(tx.date);
  return tx;
}

export async function recordEnrollmentPaymentFinanceTransactionInDb(
  enrollment: StudentEnrollment,
  studentDisplayName: string,
  country?: CountryCode
): Promise<FinanceTransaction | null> {
  const isKr = country !== "CN";
  const currency = isKr ? "KRW" : "CNY";
  const amount = isKr ? enrollment.amountKrw : enrollment.amountKrw;
  const amountKrw = enrollment.amountKrw;
  const taxTreatment: TaxTreatment = isKr ? "taxable" : "non_taxable";
  const { supply, vat } = isKr
    ? splitTaxInclusive(amountKrw)
    : { supply: amountKrw, vat: 0 };

  const category: TransactionCategory = isKr ? "student_payment_kr" : "student_payment_cn";
  const description = `${studentDisplayName} — ${enrollment.planLabel}`;

  const payload: FinanceTransaction = {
    id: crypto.randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    type: "income",
    category,
    description,
    currency,
    amount,
    amountKrw,
    supplyAmount: isKr ? supply : amountKrw,
    vatAmount: vat,
    taxTreatment,
    source: "auto",
    studentName: studentDisplayName,
  };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("finance_transactions")
    .insert(transactionToRow(payload, { enrollmentId: enrollment.id }))
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: row } = await supabase
        .from("finance_transactions")
        .select(SELECT_COLUMNS)
        .eq("enrollment_id", enrollment.id)
        .maybeSingle();
      if (row) {
        const tx = rowToTransaction(row as FinanceTransactionRow);
        upsertFinanceTransactionInCache(tx);
        return tx;
      }
    }
    throw new Error(`finance_enrollment_insert_failed: ${error.message}`);
  }

  const tx = rowToTransaction(data as FinanceTransactionRow);
  upsertFinanceTransactionInCache(tx);
  await refreshFinanceSnapshotForDate(tx.date);
  return tx;
}

async function upsertMonthlyFinanceSnapshot(monthKey: string): Promise<void> {
  const txs = getFinanceTransactionCache().filter((t) => t.date.startsWith(monthKey));
  const income = txs.filter((t) => t.type === "income");
  const expense = txs.filter((t) => t.type === "expense");

  const revenueKrw = income.reduce((s, t) => s + t.amountKrw, 0);
  const revenueCny = income
    .filter((t) => t.currency === "CNY")
    .reduce((s, t) => s + t.amount, 0);
  const expensePhp = expense
    .filter((t) => t.currency === "PHP")
    .reduce((s, t) => s + t.amount, 0);
  const expenseKrw = expense.reduce((s, t) => s + t.amountKrw, 0);

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("finance_snapshots")
    .select("id")
    .eq("period_type", "month")
    .eq("period_key", monthKey)
    .maybeSingle();

  const payload = {
    period_type: "month" as const,
    period_key: monthKey,
    revenue_krw: revenueKrw,
    revenue_cny: revenueCny,
    expense_php: expensePhp,
    expense_krw: expenseKrw,
    snapshot_data: { transactionCount: txs.length },
  };

  if (existing?.id) {
    await supabase.from("finance_snapshots").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("finance_snapshots").insert(payload);
  }
}

export async function refreshFinanceSnapshotForDate(isoDate: string): Promise<void> {
  await upsertMonthlyFinanceSnapshot(isoDate.slice(0, 7));
}
