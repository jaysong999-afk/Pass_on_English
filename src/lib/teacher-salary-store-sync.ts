import type { TeacherSalaryStatement } from "@/types";
import { findSalaryInCache, getSalaryCache } from "@/lib/teacher-salary/salary-cache";
import {
  buildLiveEstimate,
  cloneStatement,
  getBonusPolicy,
  getPayoutAccount,
  getVerificationLessons,
  isSalaryMonthEnded,
  statementTotal,
  previewBulkHourlyRateUpdate,
  applyBulkHourlyRateUpdate,
  updateTeacherHourlyRate,
  monthKeyFromDate,
} from "@/lib/teacher-salary/compute";

export function getAllSalaryStatements(): TeacherSalaryStatement[] {
  return getSalaryCache().map(cloneStatement);
}

export function getSalaryMonthsForTeacher(teacherId: string): string[] {
  const stored = getSalaryCache()
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
  const stored = findSalaryInCache(teacherId, month);

  if (stored && stored.status !== "estimated") {
    return cloneStatement(stored);
  }

  if (stored && !stored.isLiveEstimate && month !== current) {
    return cloneStatement(stored);
  }

  if (month === current || !stored) {
    const live = buildLiveEstimate(teacherId, month);
    if (live) return live;
  }

  return stored ? cloneStatement(stored) : null;
}

export function getSalaryStatementsForTeacher(teacherId: string): TeacherSalaryStatement[] {
  const months = getSalaryMonthsForTeacher(teacherId);
  return months
    .map((m) => getSalaryStatement(teacherId, m))
    .filter((s): s is TeacherSalaryStatement => s !== null);
}

export {
  buildLiveEstimate,
  getBonusPolicy,
  getPayoutAccount,
  getVerificationLessons,
  isSalaryMonthEnded,
  statementTotal,
  previewBulkHourlyRateUpdate,
  applyBulkHourlyRateUpdate,
  updateTeacherHourlyRate,
  monthKeyFromDate,
};
