import type { SalaryBonusPolicyConfig } from "@/types";

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

let policy: SalaryBonusPolicyConfig = structuredClone(DEFAULT_POLICY);

export function getSalaryBonusPolicy(): SalaryBonusPolicyConfig {
  return structuredClone(policy);
}

export function updateSalaryBonusPolicy(
  input: Partial<SalaryBonusPolicyConfig>
): SalaryBonusPolicyConfig {
  policy = {
    ...policy,
    ...input,
    quarterlyTiers: input.quarterlyTiers
      ? input.quarterlyTiers.map((t) => ({ ...t }))
      : policy.quarterlyTiers,
  };
  return getSalaryBonusPolicy();
}

export function calcQuarterlyBonusFromHours(totalHours: number): number {
  const tiers = [...policy.quarterlyTiers].sort((a, b) => b.minHours - a.minHours);
  for (const tier of tiers) {
    const withinMax =
      tier.maxHours === null || totalHours <= tier.maxHours;
    if (totalHours >= tier.minHours && withinMax) {
      return tier.amountPhp;
    }
  }
  return 0;
}

/** @internal */
export function resetSalaryBonusPolicyStore() {
  policy = structuredClone(DEFAULT_POLICY);
}
