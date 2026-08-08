import type { TeacherSalaryStatement } from "@/types";
import { getPenaltyForMonth } from "@/lib/teacher-payroll-penalty-store";
import { getAllTeachers, getTeacherById } from "@/lib/teacher-profile-store";
import {
  confirmSalaryStatement,
  getSalaryStatement,
  statementTotal,
  getAllSalaryStatements,
  isSalaryMonthEnded,
} from "@/lib/teacher-salary-store";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";

export interface AdminSalaryRow extends TeacherSalaryStatement {
  total: number;
  bonusTotal: number;
  needsReview: boolean;
  reviewReasons: string[];
}

export interface AdminSalaryMonthSummary {
  month: string;
  grandTotal: number;
  estimatedTotal: number;
  confirmedTotal: number;
  processingTotal: number;
  paidTotal: number;
  completedTotal: number;
  reviewCount: number;
  monthEnded: boolean;
}

export function currentSalaryMonth(): string {
  return getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE).slice(0, 7);
}

export function getAvailableSalaryMonths(): string[] {
  const months = new Set<string>([currentSalaryMonth()]);
  for (const s of getAllSalaryStatements()) {
    months.add(s.month);
  }
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

function teachersForMonth(month: string): string[] {
  const ids = new Set<string>();
  for (const t of getAllTeachers()) {
    if (t.status === "active" || t.status === "on_leave") {
      ids.add(t.id);
    }
  }
  for (const s of getAllSalaryStatements()) {
    if (s.month === month) ids.add(s.teacherId);
  }
  return [...ids];
}

export function salaryNeedsReview(statement: TeacherSalaryStatement): {
  needsReview: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const penalty = getPenaltyForMonth(statement.teacherId, statement.month);

  if (statement.deductions > 0) {
    reasons.push(`공제 ₱${statement.deductions.toLocaleString()}`);
  }
  if (penalty?.perfectAttendanceForfeited) {
    reasons.push("만근 보너스 상실");
  }
  if (penalty?.quarterlyBonusReset) {
    reasons.push("분기 보너스 리셋");
  }
  if (statement.payoutAccount.accountNumber === "—") {
    reasons.push("지급 계좌 미등록");
  }
  if (penalty?.reason) {
    reasons.push(penalty.reason);
  }

  return { needsReview: reasons.length > 0, reasons };
}

function toRow(statement: TeacherSalaryStatement): AdminSalaryRow {
  const bonusTotal =
    statement.perfectAttendanceBonus +
    statement.quarterlyBonus +
    statement.otherIncentives;
  const { needsReview, reasons } = salaryNeedsReview(statement);
  return {
    ...statement,
    payoutAccount: { ...statement.payoutAccount },
    total: statementTotal(statement),
    bonusTotal,
    needsReview,
    reviewReasons: reasons,
  };
}

export function getAdminSalaryOverview(month: string): {
  summary: AdminSalaryMonthSummary;
  rows: AdminSalaryRow[];
} {
  const rows = teachersForMonth(month)
    .map((teacherId) => getSalaryStatement(teacherId, month))
    .filter((s): s is TeacherSalaryStatement => s !== null)
    .map(toRow)
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName));

  const summary: AdminSalaryMonthSummary = {
    month,
    grandTotal: rows.reduce((sum, r) => sum + r.total, 0),
    estimatedTotal: rows
      .filter((r) => r.status === "estimated")
      .reduce((sum, r) => sum + r.total, 0),
    confirmedTotal: rows
      .filter((r) => r.status === "confirmed")
      .reduce((sum, r) => sum + r.total, 0),
    processingTotal: rows
      .filter((r) => r.status === "processing")
      .reduce((sum, r) => sum + r.total, 0),
    paidTotal: rows
      .filter((r) => r.status === "paid")
      .reduce((sum, r) => sum + r.total, 0),
    completedTotal: rows
      .filter((r) => r.status === "completed")
      .reduce((sum, r) => sum + r.total, 0),
    reviewCount: rows.filter((r) => r.needsReview).length,
    monthEnded: isSalaryMonthEnded(month),
  };

  return { summary, rows };
}

export function finalizeAllEstimatesForMonth(month: string): TeacherSalaryStatement[] {
  const finalized: TeacherSalaryStatement[] = [];
  for (const teacherId of teachersForMonth(month)) {
    const statement = getSalaryStatement(teacherId, month);
    if (statement?.isLiveEstimate || statement?.status === "estimated") {
      const result = confirmSalaryStatement(teacherId, month);
      if (result) finalized.push(result);
    }
  }
  return finalized;
}

export function getTeacherDisplayShortName(teacherId: string, fallback: string): string {
  const teacher = getTeacherById(teacherId);
  const name = teacher?.displayName ?? fallback;
  return name.split(/\s+/)[0] ?? name;
}
