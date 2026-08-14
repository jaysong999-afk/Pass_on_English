import type { SalaryBonusPolicyConfig } from "@/types";
import { createClient } from "@/lib/supabase/server";
import {
  SALARY_SETTINGS_ROW_ID,
  getCachedSalaryBonusPolicy,
  setCachedSalaryBonusPolicy,
} from "@/lib/teacher-salary-policy-cache";

interface SalarySettingsRow {
  id: string;
  monthly_bonus_per_hour_php: number;
  quarter_bonus_tier1_hours: number;
  quarter_bonus_tier1_php: number;
  quarter_bonus_tier2_hours: number;
  quarter_bonus_tier2_php: number;
  quarter_bonus_tier3_php: number;
  updated_at: string;
}

function rowToPolicy(row: SalarySettingsRow): SalaryBonusPolicyConfig {
  return {
    perfectAttendancePerHourPhp: Number(row.monthly_bonus_per_hour_php),
    perfectAttendanceDescription:
      "Perfect attendance bonus: ₱25/hr (no unapproved absences or schedule changes)",
    quarterlyPeriodMonths: 3,
    quarterlyTiers: [
      { minHours: row.quarter_bonus_tier1_hours, maxHours: null, amountPhp: Number(row.quarter_bonus_tier1_php) },
      {
        minHours: row.quarter_bonus_tier2_hours,
        maxHours: row.quarter_bonus_tier1_hours - 1,
        amountPhp: Number(row.quarter_bonus_tier2_php),
      },
      {
        minHours: 0,
        maxHours: row.quarter_bonus_tier2_hours - 1,
        amountPhp: Number(row.quarter_bonus_tier3_php),
      },
    ],
  };
}

function policyToRow(policy: SalaryBonusPolicyConfig) {
  const tiers = [...policy.quarterlyTiers].sort((a, b) => b.minHours - a.minHours);
  const tier1 = tiers[0] ?? { minHours: 300, amountPhp: 2000 };
  const tier2 = tiers[1] ?? { minHours: 150, amountPhp: 1300 };
  const tier3 = tiers[2] ?? { minHours: 0, amountPhp: 700 };

  return {
    monthly_bonus_per_hour_php: policy.perfectAttendancePerHourPhp,
    quarter_bonus_tier1_hours: tier1.minHours,
    quarter_bonus_tier1_php: tier1.amountPhp,
    quarter_bonus_tier2_hours: tier2.minHours,
    quarter_bonus_tier2_php: tier2.amountPhp,
    quarter_bonus_tier3_php: tier3.amountPhp,
  };
}

async function fetchSalarySettingsRow(): Promise<SalarySettingsRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salary_settings")
    .select(
      "id, monthly_bonus_per_hour_php, quarter_bonus_tier1_hours, quarter_bonus_tier1_php, quarter_bonus_tier2_hours, quarter_bonus_tier2_php, quarter_bonus_tier3_php, updated_at"
    )
    .eq("id", SALARY_SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`salary_settings_fetch_failed: ${error.message}`);
  }

  return (data as SalarySettingsRow | null) ?? null;
}

export async function warmSalaryBonusPolicyCache() {
  const row = await fetchSalarySettingsRow();
  if (row) {
    setCachedSalaryBonusPolicy(rowToPolicy(row));
  }
  return getCachedSalaryBonusPolicy();
}

export async function getSalaryBonusPolicyInDb() {
  const row = await fetchSalarySettingsRow();
  if (row) {
    setCachedSalaryBonusPolicy(rowToPolicy(row));
  }
  return getCachedSalaryBonusPolicy();
}

export async function updateSalaryBonusPolicyInDb(
  input: Partial<SalaryBonusPolicyConfig>,
  updatedBy?: string
): Promise<SalaryBonusPolicyConfig> {
  const current = getCachedSalaryBonusPolicy();
  const merged: SalaryBonusPolicyConfig = {
    ...current,
    ...input,
    quarterlyTiers: input.quarterlyTiers
      ? input.quarterlyTiers.map((t) => ({ ...t }))
      : current.quarterlyTiers,
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salary_settings")
    .upsert({
      id: SALARY_SETTINGS_ROW_ID,
      ...policyToRow(merged),
      ...(updatedBy ? { updated_by: updatedBy } : {}),
    })
    .select(
      "id, monthly_bonus_per_hour_php, quarter_bonus_tier1_hours, quarter_bonus_tier1_php, quarter_bonus_tier2_hours, quarter_bonus_tier2_php, quarter_bonus_tier3_php, updated_at"
    )
    .single();

  if (error) {
    throw new Error(`salary_settings_update_failed: ${error.message}`);
  }

  const policy = rowToPolicy(data as SalarySettingsRow);
  setCachedSalaryBonusPolicy(policy);
  return getCachedSalaryBonusPolicy();
}
