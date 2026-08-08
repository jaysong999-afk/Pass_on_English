import type { PricingPlan } from "@/types";
import { LESSON_MINUTES } from "@/lib/availability/constants";
import { createClient } from "@/lib/supabase/server";
import {
  getCachedPricingPlanById,
  setPricingPlanCache,
  patchPricingPlanCache,
} from "@/lib/pricing-plan-cache";

const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface PricingPlanDescription {
  ko?: { name?: string };
  "zh-CN"?: { name?: string };
  schedule_days?: string[];
  sort_order?: number;
  is_popular?: boolean;
}

interface PricingPlanRow {
  id: string;
  plan_type: string;
  sessions_count: number;
  session_minutes: number;
  slot_block_minutes: number;
  price_krw: number;
  price_cny: number;
  description: PricingPlanDescription | null;
  is_active: boolean;
}

function sortPlans(list: PricingPlan[]) {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

function rowToPlan(row: PricingPlanRow): PricingPlan {
  const description = row.description ?? {};
  return {
    id: row.id,
    name: description.ko?.name?.trim() || row.plan_type,
    nameZh: description["zh-CN"]?.name?.trim() || undefined,
    scheduleDays: [...(description.schedule_days ?? [])],
    sessionsCount: row.sessions_count,
    sessionMinutes: row.session_minutes,
    priceKrw: row.price_krw,
    priceCny: row.price_cny,
    isPopular: Boolean(description.is_popular),
    active: row.is_active,
    sortOrder: description.sort_order ?? 999,
  };
}

function buildDescription(
  input: UpsertPricingPlanInput,
  sortOrder: number
): PricingPlanDescription {
  return {
    ko: { name: input.name.trim() },
    ...(input.nameZh?.trim()
      ? { "zh-CN": { name: input.nameZh.trim() } }
      : {}),
    schedule_days: [...input.scheduleDays],
    sort_order: sortOrder,
    is_popular: Boolean(input.isPopular),
  };
}

function derivePlanType(scheduleDays: string[], sessionMinutes: number): string {
  const sorted = [...scheduleDays].sort(
    (a, b) => DAY_ORDER.indexOf(a as (typeof DAY_ORDER)[number]) - DAY_ORDER.indexOf(b as (typeof DAY_ORDER)[number])
  );
  const key = sorted.join(",");

  const baseByDays: Record<string, string> = {
    "Mon,Tue,Wed,Thu,Fri": "weekday5",
    "Mon,Wed,Fri": "mwf",
    "Tue,Thu": "tuth",
    "Sat,Sun": "weekend",
  };

  const base = baseByDays[key] ?? sorted.map((day) => day.slice(0, 3).toLowerCase()).join("_");
  return `${base}_${sessionMinutes}min`;
}

async function fetchPricingPlanRows(activeOnly = false): Promise<PricingPlanRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("pricing_plans")
    .select(
      "id, plan_type, sessions_count, session_minutes, slot_block_minutes, price_krw, price_cny, description, is_active"
    );

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`pricing_plans_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as PricingPlanRow[];
}

async function refreshPlanCache(activeOnly = false) {
  const rows = await fetchPricingPlanRows(activeOnly);
  const plans = sortPlans(rows.map(rowToPlan));
  if (!activeOnly) {
    setPricingPlanCache(plans);
  }
  return plans;
}

async function clearPopularFlagExcept(exceptId?: string) {
  const supabase = await createClient();
  const rows = await fetchPricingPlanRows();
  const updates = rows
    .filter((row) => row.id !== exceptId)
    .map((row) => {
      const description = { ...(row.description ?? {}) };
      if (!description.is_popular) return null;
      description.is_popular = false;
      return supabase.from("pricing_plans").update({ description }).eq("id", row.id);
    })
    .filter(Boolean);

  await Promise.all(updates);
}

/** Warm in-memory cache for legacy sync callers (scheduler, enrollment store). */
export async function warmPricingPlanCache() {
  return refreshPlanCache(false);
}

export async function getAllPricingPlans() {
  return refreshPlanCache(false);
}

export async function getActivePricingPlans() {
  const rows = await fetchPricingPlanRows(true);
  return sortPlans(rows.map(rowToPlan));
}

export async function getPricingPlanById(id: string) {
  const cached = getCachedPricingPlanById(id);
  if (cached) return cached;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing_plans")
    .select(
      "id, plan_type, sessions_count, session_minutes, slot_block_minutes, price_krw, price_cny, description, is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`pricing_plan_fetch_failed: ${error.message}`);
  }

  if (!data) return undefined;

  const plan = rowToPlan(data as PricingPlanRow);
  patchPricingPlanCache(plan);
  return { ...plan, scheduleDays: [...plan.scheduleDays] };
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

function normalizeInput(
  input: UpsertPricingPlanInput,
  fallbackSortOrder: number
): {
  sessions_count: number;
  session_minutes: number;
  slot_block_minutes: number;
  price_krw: number;
  price_cny: number;
  description: PricingPlanDescription;
  is_active: boolean;
} {
  const sortOrder = input.sortOrder ?? fallbackSortOrder;
  return {
    sessions_count: Math.max(1, input.sessionsCount),
    session_minutes: Math.max(1, input.sessionMinutes),
    slot_block_minutes: LESSON_MINUTES,
    price_krw: Math.max(0, input.priceKrw),
    price_cny: Math.max(0, input.priceCny),
    description: buildDescription(input, sortOrder),
    is_active: input.active !== false,
  };
}

export async function createPricingPlan(input: UpsertPricingPlanInput): Promise<PricingPlan> {
  const supabase = await createClient();
  const existing = await fetchPricingPlanRows();
  const fallbackSortOrder = existing.length + 1;
  const normalized = normalizeInput(input, fallbackSortOrder);
  const planType = derivePlanType(input.scheduleDays, normalized.session_minutes);

  if (input.isPopular) {
    await clearPopularFlagExcept();
  }

  const { data, error } = await supabase
    .from("pricing_plans")
    .insert({
      plan_type: planType,
      ...normalized,
    })
    .select(
      "id, plan_type, sessions_count, session_minutes, slot_block_minutes, price_krw, price_cny, description, is_active"
    )
    .single();

  if (error) {
    throw new Error(`pricing_plan_create_failed: ${error.message}`);
  }

  await refreshPlanCache(false);
  return rowToPlan(data as PricingPlanRow);
}

export async function updatePricingPlan(
  id: string,
  input: UpsertPricingPlanInput
): Promise<PricingPlan | null> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("pricing_plans")
    .select(
      "id, plan_type, sessions_count, session_minutes, slot_block_minutes, price_krw, price_cny, description, is_active"
    )
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`pricing_plan_fetch_failed: ${existingError.message}`);
  }
  if (!existing) return null;

  const current = existing as PricingPlanRow;
  const fallbackSortOrder = current.description?.sort_order ?? 999;
  const normalized = normalizeInput(input, fallbackSortOrder);

  if (input.isPopular) {
    await clearPopularFlagExcept(id);
  } else if (input.isPopular === false) {
    normalized.description.is_popular = false;
  } else {
    normalized.description.is_popular = Boolean(current.description?.is_popular);
  }

  const { data, error } = await supabase
    .from("pricing_plans")
    .update(normalized)
    .eq("id", id)
    .select(
      "id, plan_type, sessions_count, session_minutes, slot_block_minutes, price_krw, price_cny, description, is_active"
    )
    .single();

  if (error) {
    throw new Error(`pricing_plan_update_failed: ${error.message}`);
  }

  await refreshPlanCache(false);
  return rowToPlan(data as PricingPlanRow);
}

export async function deletePricingPlan(id: string): Promise<boolean> {
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("pricing_plans")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) {
    throw new Error(`pricing_plan_delete_failed: ${error.message}`);
  }

  if ((count ?? 0) === 0) return false;

  await refreshPlanCache(false);
  return true;
}

export async function isPricingPlanInUse(planId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", planId);

  if (error) {
    throw new Error(`pricing_plan_usage_check_failed: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

/** @internal legacy helper — prefer async isPricingPlanInUse */
export function isPricingPlanInUseIds(planId: string, enrollmentPlanIds: string[]): boolean {
  return enrollmentPlanIds.includes(planId);
}
