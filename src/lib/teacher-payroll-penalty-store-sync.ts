import type { TeacherPayrollPenalty } from "@/types";
import { getTeacherPayrollPenaltyCache } from "@/lib/teacher-payroll-penalty-cache";

export function getTeacherPenalties(teacherId: string): TeacherPayrollPenalty[] {
  return getTeacherPayrollPenaltyCache()
    .filter((p) => p.teacherId === teacherId)
    .map((p) => ({ ...p }));
}

export function getPenaltyForMonth(
  teacherId: string,
  month: string
): TeacherPayrollPenalty | undefined {
  const penalty = getTeacherPayrollPenaltyCache().find(
    (p) => p.teacherId === teacherId && p.month === month
  );
  return penalty ? { ...penalty } : undefined;
}

export function isPerfectAttendanceForfeited(teacherId: string, month: string): boolean {
  return Boolean(getPenaltyForMonth(teacherId, month)?.perfectAttendanceForfeited);
}

export function isQuarterlyBonusReset(teacherId: string, month: string): boolean {
  return Boolean(getPenaltyForMonth(teacherId, month)?.quarterlyBonusReset);
}

import { clearTeacherPayrollPenaltyCache } from "@/lib/teacher-payroll-penalty-cache";

/** @internal */
export function resetTeacherPayrollPenaltyStore() {
  clearTeacherPayrollPenaltyCache();
}
