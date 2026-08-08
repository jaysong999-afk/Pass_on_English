import type {
  SalaryLessonVerificationRow,
  TeacherSalaryStatement,
  TeacherPayoutAccount,
} from "@/types";
import { getTeacherById, getAllTeachers, updateTeacherHourlyRatePhp } from "@/lib/teacher-profile-store";
import { getTeacherLessons } from "@/lib/teacher-lesson-store";
import { lessonCountsForPayroll } from "@/lib/admin/lesson-operations-store";
import {
  isPerfectAttendanceForfeited,
  isQuarterlyBonusReset,
} from "@/lib/teacher-payroll-penalty-store";
import {
  calcQuarterlyBonusFromHours,
  getSalaryBonusPolicy,
} from "@/lib/teacher-salary-policy-store";
import { getAdjustmentTotals } from "@/lib/teacher-salary-adjustment-store";
import { recordSalaryFinanceTransaction } from "@/lib/finance/payroll-finance-store";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";

const PAYOUT_ACCOUNTS: Record<string, TeacherPayoutAccount> = {
  "teacher-1": {
    type: "bank",
    label: "BDO Savings",
    accountNumber: "**** 4821",
    accountName: "Sarah Mitchell",
  },
  "teacher-2": {
    type: "gcash",
    label: "GCash",
    accountNumber: "09XX XXX 5678",
    accountName: "James Rivera",
  },
};

const SEED: TeacherSalaryStatement[] = [
  {
    id: "pay-2026-07",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    month: "2026-07",
    status: "completed",
    completedClasses: 53,
    totalHours: 26.5,
    hourlyRate: 150,
    baseSalary: 22500,
    perfectAttendanceBonus: 3750,
    quarterlyBonus: 0,
    otherIncentives: 500,
    deductions: 0,
    paymentDate: "2026-08-05",
    adminConfirmedAt: "2026-08-01T09:00:00.000Z",
    adminConfirmedBy: "admin",
    phpPaidAt: "2026-08-05",
    krwTransferAmount: 642600,
    completedAt: "2026-08-05T14:00:00.000Z",
    financeTransactionId: "payroll-pay-2026-07",
    payoutAccount: PAYOUT_ACCOUNTS["teacher-1"],
  },
  {
    id: "pay-2026-06",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    month: "2026-06",
    status: "completed",
    completedClasses: 48,
    totalHours: 24,
    hourlyRate: 150,
    baseSalary: 20400,
    perfectAttendanceBonus: 3600,
    quarterlyBonus: 700,
    otherIncentives: 0,
    deductions: 150,
    paymentDate: "2026-07-05",
    adminConfirmedAt: "2026-07-01T09:00:00.000Z",
    phpPaidAt: "2026-07-05",
    krwTransferAmount: 580000,
    completedAt: "2026-07-05T12:00:00.000Z",
    payoutAccount: PAYOUT_ACCOUNTS["teacher-1"],
  },
  {
    id: "pay-2026-07-t2",
    teacherId: "teacher-2",
    teacherName: "James Rivera",
    month: "2026-07",
    status: "processing",
    completedClasses: 40,
    totalHours: 30,
    hourlyRate: 160,
    baseSalary: 24000,
    perfectAttendanceBonus: 3000,
    quarterlyBonus: 0,
    otherIncentives: 0,
    deductions: 0,
    paymentDate: "2026-08-08",
    adminConfirmedAt: "2026-08-01T10:00:00.000Z",
    adminConfirmedBy: "admin",
    payoutAccount: PAYOUT_ACCOUNTS["teacher-2"],
  },
];

let statements: TeacherSalaryStatement[] = structuredClone(SEED);

function monthKeyFromDate(date: Date): string {
  return getDateKeyInTimezone(date, CANONICAL_TIMEZONE).slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isSalaryMonthEnded(month: string): boolean {
  return month < monthKeyFromDate(new Date());
}

function lessonsInMonth(teacherId: string, month: string) {
  return getTeacherLessons(teacherId).filter((l) => {
    if (l.status !== "completed") return false;
    if (!lessonCountsForPayroll(l, teacherId)) return false;
    const key = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE).slice(0, 7);
    return key === month;
  });
}

function rollingQuarterlyHours(teacherId: string, month: string): number {
  const policy = getSalaryBonusPolicy();
  let total = 0;
  for (let i = 0; i < policy.quarterlyPeriodMonths; i++) {
    const key = addMonths(month, -i);
    const lessons = lessonsInMonth(teacherId, key);
    total += lessons.reduce((sum, l) => sum + l.durationMinutes / 60, 0);
  }
  return Math.round(total * 10) / 10;
}

function computeAmounts(teacherId: string, month: string, totalHours: number, hourlyRate: number) {
  const policy = getSalaryBonusPolicy();
  const { bonusTotal, penaltyTotal } = getAdjustmentTotals(teacherId, month);
  const baseSalary = Math.round(totalHours * hourlyRate);
  const perfectAttendanceBonus = isPerfectAttendanceForfeited(teacherId, month)
    ? 0
    : Math.round(totalHours * policy.perfectAttendancePerHourPhp);
  const quarterlyBonus = isQuarterlyBonusReset(teacherId, month)
    ? 0
    : calcQuarterlyBonusFromHours(rollingQuarterlyHours(teacherId, month));
  return {
    baseSalary,
    perfectAttendanceBonus,
    quarterlyBonus,
    otherIncentives: bonusTotal,
    deductions: penaltyTotal,
  };
}

function buildLiveEstimate(teacherId: string, month: string): TeacherSalaryStatement | null {
  const teacher = getTeacherById(teacherId);
  if (!teacher) return null;

  const completed = lessonsInMonth(teacherId, month);
  const totalHours = Math.round(
    completed.reduce((sum, l) => sum + l.durationMinutes / 60, 0) * 10
  ) / 10;
  const hourlyRate = teacher.hourlyRatePhp;
  const amounts = computeAmounts(teacherId, month, totalHours, hourlyRate);

  const account =
    PAYOUT_ACCOUNTS[teacherId] ?? {
      type: "bank" as const,
      label: "Bank Account",
      accountNumber: "—",
      accountName: teacher.displayName,
    };

  return {
    id: `pay-live-${month}-${teacherId}`,
    teacherId,
    teacherName: teacher.displayName,
    month,
    status: "estimated",
    completedClasses: completed.length,
    totalHours,
    hourlyRate,
    ...amounts,
    paymentDate: undefined,
    payoutAccount: account,
    isLiveEstimate: true,
  };
}

export function getBonusPolicy() {
  const policy = getSalaryBonusPolicy();
  const tiers = policy.quarterlyTiers
    .map((t) => {
      const range =
        t.maxHours === null
          ? `${t.minHours}h+`
          : `${t.minHours}–${t.maxHours}h`;
      return `${range} → ₱${t.amountPhp.toLocaleString()}`;
    })
    .join(" | ");
  return {
    perfectAttendance: `Perfect attendance bonus: ₱${policy.perfectAttendancePerHourPhp}/hr (no unapproved absences or schedule changes)`,
    quarterly: `${policy.quarterlyPeriodMonths}-month rolling total: ${tiers}`,
    config: policy,
  };
}

export function getPayoutAccount(teacherId: string): TeacherPayoutAccount {
  const teacher = getTeacherById(teacherId);
  return (
    PAYOUT_ACCOUNTS[teacherId] ?? {
      type: "bank",
      label: "Bank Account",
      accountNumber: "—",
      accountName: teacher?.displayName ?? "Teacher",
    }
  );
}

export function getSalaryMonthsForTeacher(teacherId: string): string[] {
  const stored = statements
    .filter((s) => s.teacherId === teacherId)
    .map((s) => s.month);
  const current = monthKeyFromDate(new Date());
  const months = new Set([current, ...stored]);
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function getSalaryStatement(
  teacherId: string,
  month: string
): TeacherSalaryStatement | null {
  const current = monthKeyFromDate(new Date());
  const stored = statements.find((s) => s.teacherId === teacherId && s.month === month);

  if (stored && stored.status !== "estimated") {
    return { ...stored, payoutAccount: { ...stored.payoutAccount } };
  }

  if (month === current || !stored) {
    const live = buildLiveEstimate(teacherId, month);
    if (live) return live;
  }

  return stored ? { ...stored, payoutAccount: { ...stored.payoutAccount } } : null;
}

export function getVerificationLessons(
  teacherId: string,
  month: string
): SalaryLessonVerificationRow[] {
  return getTeacherLessons(teacherId)
    .filter((l) => {
      const key = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE).slice(0, 7);
      return key === month;
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((l) => ({
      id: l.id,
      scheduledAt: l.scheduledAt,
      studentName: l.studentName ?? "—",
      durationMinutes: l.durationMinutes,
      durationHours: Math.round((l.durationMinutes / 60) * 10) / 10,
      status: l.status,
      countsForPayroll: lessonCountsForPayroll(l, teacherId),
    }));
}

export function getAllSalaryStatements(): TeacherSalaryStatement[] {
  return statements.map((s) => ({ ...s, payoutAccount: { ...s.payoutAccount } }));
}

export function getSalaryStatementsForTeacher(teacherId: string): TeacherSalaryStatement[] {
  const months = getSalaryMonthsForTeacher(teacherId);
  return months
    .map((m) => getSalaryStatement(teacherId, m))
    .filter((s): s is TeacherSalaryStatement => s !== null);
}

export function updateSalaryStatementStatus(
  id: string,
  status: TeacherSalaryStatement["status"],
  extras?: Partial<
    Pick<TeacherSalaryStatement, "paymentDate" | "phpPaidAt" | "krwTransferAmount" | "completedAt" | "financeTransactionId">
  >
): TeacherSalaryStatement | null {
  const index = statements.findIndex((s) => s.id === id);
  if (index === -1) return null;
  statements[index] = {
    ...statements[index],
    status,
    paymentDate: extras?.paymentDate ?? statements[index].paymentDate,
    phpPaidAt: extras?.phpPaidAt ?? statements[index].phpPaidAt,
    krwTransferAmount: extras?.krwTransferAmount ?? statements[index].krwTransferAmount,
    completedAt: extras?.completedAt ?? statements[index].completedAt,
    financeTransactionId:
      extras?.financeTransactionId ?? statements[index].financeTransactionId,
    isLiveEstimate: false,
  };
  return { ...statements[index], payoutAccount: { ...statements[index].payoutAccount } };
}

export function confirmSalaryStatement(
  teacherId: string,
  month: string,
  adminConfirmedBy = "admin"
): TeacherSalaryStatement | null {
  if (!isSalaryMonthEnded(month)) {
    return null;
  }

  const live = buildLiveEstimate(teacherId, month);
  if (!live) return null;

  const existing = statements.findIndex(
    (s) => s.teacherId === teacherId && s.month === month
  );
  const confirmed: TeacherSalaryStatement = {
    ...live,
    id: `pay-${month}-${teacherId}`,
    status: "confirmed",
    isLiveEstimate: false,
    adminConfirmedAt: new Date().toISOString(),
    adminConfirmedBy,
  };

  if (existing >= 0) {
    statements[existing] = confirmed;
  } else {
    statements.unshift(confirmed);
  }
  return { ...confirmed, payoutAccount: { ...confirmed.payoutAccount } };
}

/** @deprecated use confirmSalaryStatement */
export function finalizeLiveEstimate(
  teacherId: string,
  month: string
): TeacherSalaryStatement | null {
  return confirmSalaryStatement(teacherId, month);
}

export function markSalaryProcessing(id: string): TeacherSalaryStatement | null {
  return updateSalaryStatementStatus(id, "processing");
}

export function markSalaryPhpPaid(
  id: string,
  phpPaidAt?: string
): TeacherSalaryStatement | null {
  const date = phpPaidAt ?? new Date().toISOString().slice(0, 10);
  return updateSalaryStatementStatus(id, "paid", {
    phpPaidAt: date,
    paymentDate: date,
  });
}

export function completeSalaryStatement(
  id: string,
  krwTransferAmount: number
): TeacherSalaryStatement | null {
  const index = statements.findIndex((s) => s.id === id);
  if (index === -1) return null;
  if (statements[index].status !== "paid") return null;
  if (!krwTransferAmount || krwTransferAmount <= 0) return null;

  const tx = recordSalaryFinanceTransaction(
    { ...statements[index], krwTransferAmount },
    krwTransferAmount
  );

  statements[index] = {
    ...statements[index],
    status: "completed",
    krwTransferAmount,
    completedAt: new Date().toISOString(),
    financeTransactionId: tx.id,
    isLiveEstimate: false,
  };

  return { ...statements[index], payoutAccount: { ...statements[index].payoutAccount } };
}

export function updateTeacherHourlyRate(teacherId: string, hourlyRatePhp: number) {
  return updateTeacherHourlyRatePhp(teacherId, hourlyRatePhp);
}

export function previewBulkHourlyRateUpdate(
  hourlyRatePhp: number,
  teacherIds?: string[]
) {
  const eligible = getAllTeachers().filter(
    (t) => t.status === "active" || t.status === "on_leave"
  );
  const targets = teacherIds?.length
    ? eligible.filter((t) => teacherIds.includes(t.id))
    : eligible;
  const differing = targets
    .filter((t) => t.hourlyRatePhp !== hourlyRatePhp)
    .map((t) => ({
      id: t.id,
      name: t.displayName,
      currentRate: t.hourlyRatePhp,
    }));
  return {
    targetIds: targets.map((t) => t.id),
    differing,
    hasDifferingRates: differing.length > 0,
  };
}

export function applyBulkHourlyRateUpdate(
  hourlyRatePhp: number,
  teacherIds?: string[]
) {
  const preview = previewBulkHourlyRateUpdate(hourlyRatePhp, teacherIds);
  for (const id of preview.targetIds) {
    updateTeacherHourlyRatePhp(id, hourlyRatePhp);
  }
  return preview;
}

export function statementTotal(s: TeacherSalaryStatement): number {
  return (
    s.baseSalary +
    s.perfectAttendanceBonus +
    s.quarterlyBonus +
    s.otherIncentives -
    s.deductions
  );
}

/** @internal */
export function resetTeacherSalaryStore() {
  statements = structuredClone(SEED);
}
