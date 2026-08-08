import type { PricingPlan } from "@/types";
import type { Locale } from "@/lib/i18n/config";
import { LESSON_MINUTES } from "@/lib/availability/constants";

/** Primary plan uses 20-minute sessions on a 20-minute grid; no system break blocks. */
export const STANDARD_SESSION_MINUTES = LESSON_MINUTES;

export function getPlanDisplayName(
  plan: Pick<PricingPlan, "name" | "nameZh">,
  locale: Locale = "ko"
): string {
  if (locale === "zh-CN" && plan.nameZh?.trim()) {
    return plan.nameZh.trim();
  }
  return plan.name;
}

export function formatPlanLabel(
  plan: Pick<PricingPlan, "name" | "nameZh" | "sessionsCount">,
  locale: Locale = "ko"
): string {
  const sessionsUnit = locale === "zh-CN" ? "次" : "회";
  return `${getPlanDisplayName(plan, locale)} (${plan.sessionsCount}${sessionsUnit})`;
}

export function formatPlanPrice(plan: Pick<PricingPlan, "priceKrw" | "priceCny">, currency: "KRW" | "CNY") {
  const amount = currency === "CNY" ? plan.priceCny : plan.priceKrw;
  return currency === "CNY" ? `${amount.toLocaleString()} 위안` : `${amount.toLocaleString()}원`;
}
