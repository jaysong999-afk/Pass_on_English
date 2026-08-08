import type { PricingPlan } from "@/types";

let planByIdCache = new Map<string, PricingPlan>();

function sortPlans(list: PricingPlan[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function setPricingPlanCache(plans: PricingPlan[]) {
  planByIdCache = new Map(plans.map((plan) => [plan.id, plan]));
}

export function patchPricingPlanCache(plan: PricingPlan) {
  planByIdCache.set(plan.id, plan);
}

export function getCachedPricingPlanById(id: string) {
  const plan = planByIdCache.get(id);
  return plan ? { ...plan, scheduleDays: [...plan.scheduleDays] } : undefined;
}

export function getCachedActivePricingPlans() {
  return sortPlans([...planByIdCache.values()].filter((plan) => plan.active));
}

export function clearPricingPlanCache() {
  planByIdCache = new Map();
}
