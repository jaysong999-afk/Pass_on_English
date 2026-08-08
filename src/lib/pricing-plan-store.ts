import type { PricingPlan } from "@/types";
import type { Locale } from "@/lib/i18n/config";
import { LESSON_MINUTES } from "@/lib/availability/constants";

/** Primary plan uses 20-minute sessions on a 20-minute grid; no system break blocks. */
export const STANDARD_SESSION_MINUTES = LESSON_MINUTES;

const SEED: PricingPlan[] = [
  {
    id: "plan-1",
    name: "주5회(월~금) 20분",
    nameZh: "每周5次(周一至周五) 20分钟",
    scheduleDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    sessionsCount: 20,
    sessionMinutes: STANDARD_SESSION_MINUTES,
    priceKrw: 87000,
    priceCny: 480,
    isPopular: true,
    active: true,
    sortOrder: 1,
  },
  {
    id: "plan-2",
    name: "월·수·금 20분",
    nameZh: "周一·周三·周五 20分钟",
    scheduleDays: ["Mon", "Wed", "Fri"],
    sessionsCount: 12,
    sessionMinutes: STANDARD_SESSION_MINUTES,
    priceKrw: 90000,
    priceCny: 490,
    isPopular: false,
    active: true,
    sortOrder: 2,
  },
  {
    id: "plan-3",
    name: "화·목 20분",
    nameZh: "周二·周四 20分钟",
    scheduleDays: ["Tue", "Thu"],
    sessionsCount: 8,
    sessionMinutes: STANDARD_SESSION_MINUTES,
    priceKrw: 64000,
    priceCny: 340,
    isPopular: false,
    active: true,
    sortOrder: 3,
  },
  {
    id: "plan-4",
    name: "주말(토·일) 20분",
    nameZh: "周末(周六·周日) 20分钟",
    scheduleDays: ["Sat", "Sun"],
    sessionsCount: 8,
    sessionMinutes: STANDARD_SESSION_MINUTES,
    priceKrw: 64000,
    priceCny: 340,
    isPopular: false,
    active: true,
    sortOrder: 4,
  },
  {
    id: "plan-40",
    name: "월·수·금 40분",
    nameZh: "周一·周三·周五 40分钟",
    scheduleDays: ["Mon", "Wed", "Fri"],
    sessionsCount: 12,
    sessionMinutes: 40,
    priceKrw: 120000,
    priceCny: 650,
    isPopular: false,
    active: true,
    sortOrder: 5,
  },
  {
    id: "plan-60",
    name: "화·목 60분",
    nameZh: "周二·周四 60分钟",
    scheduleDays: ["Tue", "Thu"],
    sessionsCount: 8,
    sessionMinutes: 60,
    priceKrw: 96000,
    priceCny: 520,
    isPopular: false,
    active: true,
    sortOrder: 6,
  },
];

let plans: PricingPlan[] = structuredClone(SEED);

function sortPlans(list: PricingPlan[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function getAllPricingPlans() {
  return sortPlans(plans);
}

export function getActivePricingPlans() {
  return sortPlans(plans.filter((p) => p.active));
}

export function getPricingPlanById(id: string) {
  const plan = plans.find((p) => p.id === id);
  return plan ? { ...plan, scheduleDays: [...plan.scheduleDays] } : undefined;
}

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

export interface UpsertPricingPlanInput {
  name: string;
  nameZh?: string;
  scheduleDays: string[];
  sessionsCount: number;
  sessionMinutes: number;
  priceKrw: number;
  priceCny: number;
  isPopular?: boolean;
  active?: boolean;
  sortOrder?: number;
}

function normalizeInput(input: UpsertPricingPlanInput): Omit<PricingPlan, "id"> {
  return {
    name: input.name.trim(),
    nameZh: input.nameZh?.trim() || undefined,
    scheduleDays: [...input.scheduleDays],
    sessionsCount: Math.max(1, input.sessionsCount),
    sessionMinutes: Math.max(1, input.sessionMinutes),
    priceKrw: Math.max(0, input.priceKrw),
    priceCny: Math.max(0, input.priceCny),
    isPopular: Boolean(input.isPopular),
    active: input.active !== false,
    sortOrder: input.sortOrder ?? plans.length + 1,
  };
}

export function createPricingPlan(input: UpsertPricingPlanInput): PricingPlan {
  const id = `plan-${Date.now()}`;
  if (input.isPopular) {
    plans = plans.map((p) => ({ ...p, isPopular: false }));
  }
  const plan: PricingPlan = { id, ...normalizeInput(input) };
  plans.push(plan);
  return { ...plan, scheduleDays: [...plan.scheduleDays] };
}

export function updatePricingPlan(id: string, input: UpsertPricingPlanInput): PricingPlan | null {
  const index = plans.findIndex((p) => p.id === id);
  if (index === -1) return null;

  if (input.isPopular) {
    plans = plans.map((p) => ({ ...p, isPopular: p.id === id }));
  }

  const updated: PricingPlan = {
    id,
    ...normalizeInput(input),
    isPopular: input.isPopular ?? plans[index].isPopular,
  };
  plans[index] = updated;
  return { ...updated, scheduleDays: [...updated.scheduleDays] };
}

export function deletePricingPlan(id: string): boolean {
  const index = plans.findIndex((p) => p.id === id);
  if (index === -1) return false;
  plans.splice(index, 1);
  return true;
}

export function isPricingPlanInUse(planId: string, enrollmentPlanIds: string[]): boolean {
  return enrollmentPlanIds.includes(planId);
}

/** @internal 테스트/리셋용 */
export function resetPricingPlans() {
  plans = structuredClone(SEED);
}
