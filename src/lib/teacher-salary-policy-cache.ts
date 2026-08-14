import type { SalaryBonusPolicyConfig } from "@/types";

export const SALARY_SETTINGS_ROW_ID = "00000000-0000-0000-0000-000000000001";

const DEFAULT_POLICY: SalaryBonusPolicyConfig = {
  perfectAttendancePerHourPhp: 25,
  perfectAttendanceDescription:
    "Perfect attendance bonus: ₱25/hr (no unapproved absences or schedule changes)",
  quarterlyPeriodMonths: 3,
  quarterlyTiers: [
    { minHours: 300, maxHours: null, amountPhp: 2000 },
    { minHours: 150, maxHours: 299, amountPhp: 1300 },
    { minHours: 0, maxHours: 149, amountPhp: 700 },
  ],
};

let policyCache: SalaryBonusPolicyConfig = structuredClone(DEFAULT_POLICY);

export function getCachedSalaryBonusPolicy() {
  return structuredClone(policyCache);
}

export function setCachedSalaryBonusPolicy(policy: SalaryBonusPolicyConfig) {
  policyCache = structuredClone(policy);
}

export function clearSalaryBonusPolicyCache() {
  policyCache = structuredClone(DEFAULT_POLICY);
}

export function calcQuarterlyBonusFromHoursSync(totalHours: number): number {
  const tiers = [...policyCache.quarterlyTiers].sort((a, b) => b.minHours - a.minHours);
  for (const tier of tiers) {
    const withinMax = tier.maxHours === null || totalHours <= tier.maxHours;
    if (totalHours >= tier.minHours && withinMax) {
      return tier.amountPhp;
    }
  }
  return 0;
}
