import type { TeacherSalaryAdjustment } from "@/types";

let adjustmentCache: TeacherSalaryAdjustment[] = [];

export function setTeacherSalaryAdjustmentCache(adjustments: TeacherSalaryAdjustment[]) {
  adjustmentCache = adjustments.map((a) => ({ ...a }));
}

export function getTeacherSalaryAdjustmentCache() {
  return adjustmentCache.map((a) => ({ ...a }));
}

export function prependTeacherSalaryAdjustmentCache(adjustment: TeacherSalaryAdjustment) {
  adjustmentCache.unshift({ ...adjustment });
}

export function clearTeacherSalaryAdjustmentCache() {
  adjustmentCache = [];
}
