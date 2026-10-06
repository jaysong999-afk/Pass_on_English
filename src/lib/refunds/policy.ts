export const REFUND_POLICY_VERSION = "2026-10-06-v1";

export type RefundPolicyTier = "full" | "two_thirds" | "half" | "none";

export interface RefundPolicyResult {
  tier: RefundPolicyTier;
  rateNumerator: number;
  rateDenominator: number;
  rate: number;
  amount: number;
}

function roundCurrency(amount: number, currency: "KRW" | "CNY"): number {
  return currency === "KRW"
    ? Math.round(amount)
    : Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Refund boundaries use integer comparisons so thirds never depend on
 * floating-point rounding. Trial, bonus, and compensation classes must be
 * excluded before passing countedSessions and paidSessionsTotal.
 */
export function calculateRefundPolicy(input: {
  paidAmount: number;
  paidSessionsTotal: number;
  countedSessions: number;
  currency: "KRW" | "CNY";
}): RefundPolicyResult {
  const { paidAmount, paidSessionsTotal, countedSessions, currency } = input;
  if (!Number.isFinite(paidAmount) || paidAmount < 0) throw new Error("invalid_paid_amount");
  if (!Number.isInteger(paidSessionsTotal) || paidSessionsTotal <= 0) {
    throw new Error("invalid_paid_sessions_total");
  }
  if (!Number.isInteger(countedSessions) || countedSessions < 0) {
    throw new Error("invalid_counted_sessions");
  }

  let tier: RefundPolicyTier;
  let rateNumerator: number;
  let rateDenominator: number;

  if (countedSessions === 0) {
    tier = "full";
    rateNumerator = 1;
    rateDenominator = 1;
  } else if (countedSessions * 3 < paidSessionsTotal) {
    tier = "two_thirds";
    rateNumerator = 2;
    rateDenominator = 3;
  } else if (countedSessions * 2 < paidSessionsTotal) {
    tier = "half";
    rateNumerator = 1;
    rateDenominator = 2;
  } else {
    tier = "none";
    rateNumerator = 0;
    rateDenominator = 1;
  }

  const rate = rateNumerator / rateDenominator;
  return {
    tier,
    rateNumerator,
    rateDenominator,
    rate,
    amount: roundCurrency((paidAmount * rateNumerator) / rateDenominator, currency),
  };
}

export function refundTierLabel(tier: RefundPolicyTier): string {
  switch (tier) {
    case "full":
      return "전액 환불";
    case "two_thirds":
      return "결제금액의 2/3 환불";
    case "half":
      return "결제금액의 1/2 환불";
    case "none":
      return "환불 대상 아님";
  }
}
