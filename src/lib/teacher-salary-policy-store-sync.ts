import type { SalaryBonusPolicyConfig } from "@/types";
import {
  calcQuarterlyBonusFromHoursSync,
  getCachedSalaryBonusPolicy,
} from "@/lib/teacher-salary-policy-cache";

export function getSalaryBonusPolicy(): SalaryBonusPolicyConfig {
  return getCachedSalaryBonusPolicy();
}

export function calcQuarterlyBonusFromHours(totalHours: number): number {
  return calcQuarterlyBonusFromHoursSync(totalHours);
}

import { clearSalaryBonusPolicyCache } from "@/lib/teacher-salary-policy-cache";

/** @internal */
export function resetSalaryBonusPolicyStore() {
  clearSalaryBonusPolicyCache();
}
