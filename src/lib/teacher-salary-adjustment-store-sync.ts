import type { TeacherSalaryAdjustment } from "@/types";
import { getTeacherSalaryAdjustmentCache } from "@/lib/teacher-salary-adjustment-cache";

export function getAdjustmentsForTeacherMonth(
  teacherId: string,
  month: string
): TeacherSalaryAdjustment[] {
  return getTeacherSalaryAdjustmentCache()
    .filter((a) => a.teacherId === teacherId && a.month === month)
    .map((a) => ({ ...a }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAdjustmentTotals(teacherId: string, month: string) {
  const items = getAdjustmentsForTeacherMonth(teacherId, month);
  const bonusTotal = items
    .filter((a) => a.type === "bonus")
    .reduce((sum, a) => sum + a.amountPhp, 0);
  const penaltyTotal = items
    .filter((a) => a.type === "penalty")
    .reduce((sum, a) => sum + a.amountPhp, 0);
  return { bonusTotal, penaltyTotal, items };
}

import { clearTeacherSalaryAdjustmentCache } from "@/lib/teacher-salary-adjustment-cache";

/** @internal */
export function resetSalaryAdjustmentStore() {
  clearTeacherSalaryAdjustmentCache();
}
