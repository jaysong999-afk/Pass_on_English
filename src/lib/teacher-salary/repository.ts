import type { TeacherPayoutAccount, TeacherSalaryStatement, SalaryPayoutStatus } from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import { warmFinanceCache } from "@/lib/finance/repository";
import {
  findSalaryInCache,
  getSalaryCache,
  patchSalaryInCache,
  setSalaryCache,
} from "@/lib/teacher-salary/salary-cache";
import {
  buildLiveEstimate,
  cloneStatement,
  dbStatusToApp,
  appStatusToDb,
  getPayoutAccount,
  isSalaryMonthEnded,
  monthKeyFromDate,
} from "@/lib/teacher-salary/compute";
import {
  getAllSalaryStatements,
  getSalaryMonthsForTeacher,
  getSalaryStatement,
  getSalaryStatementsForTeacher,
} from "@/lib/teacher-salary-store-sync";

interface SalaryRow {
  id: string;
  teacher_id: string;
  month: string;
  status: "estimated" | "processing" | "paid" | "completed";
  completed_classes: number;
  total_hours: number;
  hourly_rate: number;
  base_salary: number;
  perfect_attendance_bonus: number;
  quarterly_bonus: number;
  other_incentives: number;
  deductions: number;
  payment_date: string | null;
  payout_account: TeacherPayoutAccount | null;
  is_live_estimate: boolean;
  admin_confirmed_at: string | null;
  admin_confirmed_by: string | null;
  php_paid_at: string | null;
  krw_transfer_amount: number | null;
  completed_at: string | null;
  finance_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  teacher?: { display_name: string | null } | null;
}

const SALARY_SELECT = `
  id,
  teacher_id,
  month,
  status,
  completed_classes,
  total_hours,
  hourly_rate,
  base_salary,
  perfect_attendance_bonus,
  quarterly_bonus,
  other_incentives,
  deductions,
  payment_date,
  payout_account,
  is_live_estimate,
  admin_confirmed_at,
  admin_confirmed_by,
  php_paid_at,
  krw_transfer_amount,
  completed_at,
  finance_transaction_id,
  created_at,
  updated_at,
  teacher:teachers!teacher_salary_statements_teacher_id_fkey(display_name)
`;

function rowToStatement(row: SalaryRow, teacherName?: string): TeacherSalaryStatement {
  const payout =
    row.payout_account ??
    getPayoutAccount(row.teacher_id);

  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: teacherName ?? row.teacher?.display_name?.trim() ?? "Teacher",
    month: row.month,
    status: dbStatusToApp(row.status, row.is_live_estimate),
    completedClasses: row.completed_classes,
    totalHours: Number(row.total_hours),
    hourlyRate: Number(row.hourly_rate),
    baseSalary: Number(row.base_salary),
    perfectAttendanceBonus: Number(row.perfect_attendance_bonus),
    quarterlyBonus: Number(row.quarterly_bonus),
    otherIncentives: Number(row.other_incentives),
    deductions: Number(row.deductions),
    paymentDate: row.payment_date ?? undefined,
    adminConfirmedAt: row.admin_confirmed_at ?? (!row.is_live_estimate && row.status === "estimated" ? row.updated_at : undefined),
    adminConfirmedBy: row.admin_confirmed_by ?? undefined,
    phpPaidAt: row.php_paid_at ?? undefined,
    krwTransferAmount: row.krw_transfer_amount == null ? undefined : Number(row.krw_transfer_amount),
    completedAt: row.completed_at ?? undefined,
    financeTransactionId: row.finance_transaction_id ?? undefined,
    payoutAccount: payout,
    isLiveEstimate: row.is_live_estimate,
  };
}

function statementToPayload(statement: TeacherSalaryStatement) {
  const mapped = appStatusToDb(statement.status, statement.isLiveEstimate);
  return {
    teacher_id: statement.teacherId,
    month: statement.month,
    status: mapped.status,
    completed_classes: statement.completedClasses,
    total_hours: statement.totalHours,
    hourly_rate: statement.hourlyRate,
    base_salary: statement.baseSalary,
    perfect_attendance_bonus: statement.perfectAttendanceBonus,
    quarterly_bonus: statement.quarterlyBonus,
    other_incentives: statement.otherIncentives,
    deductions: statement.deductions,
    payment_date: statement.paymentDate ?? null,
    payout_account: statement.payoutAccount,
    is_live_estimate: mapped.is_live_estimate,
    admin_confirmed_at: statement.adminConfirmedAt ?? null,
    admin_confirmed_by: statement.adminConfirmedBy ?? null,
    php_paid_at: statement.phpPaidAt ?? null,
    krw_transfer_amount: statement.krwTransferAmount ?? null,
    completed_at: statement.completedAt ?? null,
    finance_transaction_id: statement.financeTransactionId ?? null,
  };
}

export {
  getAllSalaryStatements,
  getSalaryMonthsForTeacher,
  getSalaryStatement,
  getSalaryStatementsForTeacher,
};

export async function warmSalaryCache(): Promise<TeacherSalaryStatement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teacher_salary_statements")
    .select(SALARY_SELECT)
    .order("month", { ascending: false });

  if (error) {
    throw new Error(`teacher_salary_fetch_failed: ${error.message}`);
  }

  const statements = ((data ?? []) as unknown as SalaryRow[]).map((row) => rowToStatement(row));
  setSalaryCache(statements);
  return statements;
}

async function upsertStatementInDb(statement: TeacherSalaryStatement): Promise<TeacherSalaryStatement> {
  // Salary snapshots are server-computed records. Teachers may read their own
  // statements through RLS, but must never receive direct table write access.
  const supabase = createPrivilegedClient();
  const payload = statementToPayload(statement);

  const { data, error } = await supabase
    .from("teacher_salary_statements")
    .upsert(payload, { onConflict: "teacher_id,month" })
    .select(SALARY_SELECT)
    .single();

  if (error) {
    throw new Error(`teacher_salary_upsert_failed: ${error.message}`);
  }

  const saved = rowToStatement(data as unknown as SalaryRow, statement.teacherName);
  patchSalaryInCache(saved);
  return saved;
}

export async function syncLiveEstimateInDb(
  teacherId: string,
  month: string
): Promise<TeacherSalaryStatement | null> {
  const live = buildLiveEstimate(teacherId, month);
  if (!live) return null;
  return upsertStatementInDb(live);
}

export async function getSalaryStatementInDb(
  teacherId: string,
  month: string
): Promise<TeacherSalaryStatement | null> {
  const current = monthKeyFromDate(new Date());
  const cached = findSalaryInCache(teacherId, month);

  if (month === current) {
    return syncLiveEstimateInDb(teacherId, month);
  }

  if (cached && cached.status !== "estimated") {
    return cloneStatement(cached);
  }

  if (cached && !cached.isLiveEstimate) {
    return cloneStatement(cached);
  }

  if (!cached) {
    const live = buildLiveEstimate(teacherId, month);
    if (live && !isSalaryMonthEnded(month)) {
      return syncLiveEstimateInDb(teacherId, month);
    }
    return live;
  }

  return cloneStatement(cached);
}

export async function getSalaryStatementsForTeacherInDb(
  teacherId: string
): Promise<TeacherSalaryStatement[]> {
  await warmSalaryCache();
  const months = getSalaryMonthsForTeacher(teacherId);
  const current = monthKeyFromDate(new Date());

  const results: TeacherSalaryStatement[] = [];
  for (const month of months) {
    if (month === current) {
      const live = await syncLiveEstimateInDb(teacherId, month);
      if (live) results.push(live);
    } else {
      const statement = getSalaryStatement(teacherId, month);
      if (statement) results.push(statement);
    }
  }
  return results;
}

export async function updateSalaryStatementStatusInDb(
  id: string,
  status: SalaryPayoutStatus,
  extras?: Partial<
    Pick<TeacherSalaryStatement, "paymentDate" | "phpPaidAt" | "krwTransferAmount" | "completedAt" | "financeTransactionId">
  >
): Promise<TeacherSalaryStatement | null> {
  const current = getSalaryCache().find((s) => s.id === id);
  if (!current) return null;
  const allowedNext: Record<SalaryPayoutStatus, SalaryPayoutStatus[]> = {
    estimated: ["confirmed"],
    confirmed: ["processing"],
    processing: ["paid"],
    paid: ["completed"],
    completed: [],
  };
  if (status !== current.status && !allowedNext[current.status].includes(status)) {
    return null;
  }

  const updated: TeacherSalaryStatement = {
    ...current,
    status,
    paymentDate: extras?.paymentDate ?? current.paymentDate,
    phpPaidAt: extras?.phpPaidAt ?? current.phpPaidAt,
    krwTransferAmount: extras?.krwTransferAmount ?? current.krwTransferAmount,
    completedAt: extras?.completedAt ?? current.completedAt,
    financeTransactionId: extras?.financeTransactionId ?? current.financeTransactionId,
    isLiveEstimate: false,
  };

  return upsertStatementInDb(updated);
}

export async function confirmSalaryStatementInDb(
  teacherId: string,
  month: string,
  adminConfirmedBy = "admin"
): Promise<TeacherSalaryStatement | null> {
  void adminConfirmedBy;
  if (!isSalaryMonthEnded(month)) return null;

  const live = buildLiveEstimate(teacherId, month);
  if (!live) return null;

  const confirmed: TeacherSalaryStatement = {
    ...live,
    status: "confirmed",
    isLiveEstimate: false,
    adminConfirmedAt: new Date().toISOString(),
    adminConfirmedBy,
  };

  return upsertStatementInDb(confirmed);
}

export async function markSalaryProcessingInDb(id: string): Promise<TeacherSalaryStatement | null> {
  const current = getSalaryCache().find((s) => s.id === id);
  if (!current || current.status !== "confirmed") return null;
  return updateSalaryStatementStatusInDb(id, "processing");
}

export async function markSalaryPhpPaidInDb(
  id: string,
  phpPaidAt?: string
): Promise<TeacherSalaryStatement | null> {
  const current = getSalaryCache().find((s) => s.id === id);
  if (!current || current.status !== "processing") return null;

  const date = phpPaidAt ?? new Date().toISOString().slice(0, 10);
  return updateSalaryStatementStatusInDb(id, "paid", {
    phpPaidAt: date,
    paymentDate: date,
  });
}

export async function completeSalaryStatementInDb(
  id: string,
  krwTransferAmount: number
): Promise<TeacherSalaryStatement | null> {
  const current = getSalaryCache().find((s) => s.id === id);
  if (!current) return null;
  if (current.status !== "paid") return null;
  if (!krwTransferAmount || krwTransferAmount <= 0) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("complete_teacher_salary_settlement", {
      p_statement_id: id,
      p_krw_transfer_amount: krwTransferAmount,
    })
    .single();
  if (error) {
    if (error.message.includes("invalid_state") || error.message.includes("not_found")) {
      return null;
    }
    throw new Error(`teacher_salary_complete_failed: ${error.message}`);
  }

  const saved = rowToStatement(data as unknown as SalaryRow, current.teacherName);
  patchSalaryInCache(saved);
  await warmFinanceCache();
  return saved;
}
