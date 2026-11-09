export type FreeTrialMode = "paused" | "enabled";

export interface FreeTrialPolicy {
  mode: FreeTrialMode;
  eligibleFrom: string | null;
  eligibleFromMs: number | null;
  acceptsNewTrials: boolean;
}

interface FreeTrialCandidate {
  trialUsed: boolean;
  createdAt: string;
}

interface FreeTrialPolicyInput {
  mode?: string;
  eligibleFrom?: string;
}

/**
 * Free trials fail closed. Enabling the program requires both an explicit
 * enabled mode and a valid eligibility cutoff so pre-migration learners do
 * not become eligible when the program is resumed.
 */
export function parseFreeTrialPolicy(input: FreeTrialPolicyInput): FreeTrialPolicy {
  const mode: FreeTrialMode = input.mode?.trim().toLowerCase() === "enabled" ? "enabled" : "paused";
  const configuredEligibleFrom = input.eligibleFrom?.trim() || null;
  const parsedEligibleFrom = configuredEligibleFrom
    ? Date.parse(configuredEligibleFrom)
    : Number.NaN;
  const eligibleFromMs = Number.isFinite(parsedEligibleFrom) ? parsedEligibleFrom : null;

  return {
    mode,
    eligibleFrom: eligibleFromMs === null ? null : configuredEligibleFrom,
    eligibleFromMs,
    acceptsNewTrials: mode === "enabled" && eligibleFromMs !== null,
  };
}

export function getFreeTrialPolicy(): FreeTrialPolicy {
  return parseFreeTrialPolicy({
    mode: process.env.NEXT_PUBLIC_FREE_TRIAL_MODE,
    eligibleFrom: process.env.NEXT_PUBLIC_FREE_TRIAL_ELIGIBLE_FROM,
  });
}

export function isFreeTrialProgramEnabled(
  policy: FreeTrialPolicy = getFreeTrialPolicy()
): boolean {
  return policy.acceptsNewTrials;
}

export function isFreeTrialEligible(
  candidate: FreeTrialCandidate,
  policy: FreeTrialPolicy = getFreeTrialPolicy()
): boolean {
  if (!policy.acceptsNewTrials || candidate.trialUsed || policy.eligibleFromMs === null) {
    return false;
  }

  const createdAtMs = Date.parse(candidate.createdAt);
  return Number.isFinite(createdAtMs) && createdAtMs >= policy.eligibleFromMs;
}
