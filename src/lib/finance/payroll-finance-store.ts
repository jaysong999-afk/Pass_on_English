import type { FinanceTransaction, TeacherSalaryStatement } from "@/types";
import { convertToKrw, FALLBACK_RATES } from "@/lib/finance/accounting";

const payrollTransactions: FinanceTransaction[] = [
  {
    id: "payroll-pay-2026-07",
    date: "2026-08-05",
    type: "expense",
    category: "teacher_payroll",
    description: "Sarah Mitchell — 2026년 07월 급여 (₱26,750, 원화 ₩642,600)",
    currency: "PHP",
    amount: 26750,
    amountKrw: 642600,
    supplyAmount: 26750,
    vatAmount: 0,
    taxTreatment: "zero_rated",
    source: "auto",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
  },
];

export function getPayrollFinanceTransactions(): FinanceTransaction[] {
  return payrollTransactions.map((t) => ({ ...t }));
}

export function recordSalaryFinanceTransaction(
  statement: TeacherSalaryStatement,
  krwTransferAmount: number
): FinanceTransaction {
  const existing = payrollTransactions.find(
    (t) => t.id === statement.financeTransactionId
  );
  if (existing) {
    existing.amountKrw = krwTransferAmount;
    existing.amount = statementTotalPhp(statement);
    existing.description = buildDescription(statement);
    existing.date = (statement.completedAt ?? new Date().toISOString()).slice(0, 10);
    return { ...existing };
  }

  const phpTotal = statementTotalPhp(statement);
  const tx: FinanceTransaction = {
    id: `payroll-${statement.id}`,
    date: new Date().toISOString().slice(0, 10),
    type: "expense",
    category: "teacher_payroll",
    description: buildDescription(statement),
    currency: "PHP",
    amount: phpTotal,
    amountKrw: krwTransferAmount,
    supplyAmount: phpTotal,
    vatAmount: 0,
    taxTreatment: "zero_rated",
    source: "auto",
    teacherId: statement.teacherId,
    teacherName: statement.teacherName,
  };
  payrollTransactions.unshift(tx);
  return { ...tx };
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

function buildDescription(statement: TeacherSalaryStatement) {
  const monthLabel = statement.month.replace("-", "년 ") + "월";
  return `${statement.teacherName} — ${monthLabel} 급여 (₱${statementTotalPhp(statement).toLocaleString()}, 원화 ₩${(statement.krwTransferAmount ?? 0).toLocaleString()})`;
}

export function estimateKrwFromPhp(phpAmount: number): number {
  return convertToKrw(phpAmount, "PHP", FALLBACK_RATES);
}

/** @internal */
export function resetPayrollFinanceStore() {
  payrollTransactions.length = 0;
}
