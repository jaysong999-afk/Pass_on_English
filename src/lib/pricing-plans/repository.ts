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
  archived_at?: string;
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

function isArchived(row: PricingPlanRow) {
  return Boolean(row.description?.archived_at);
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

function deriveUniquePlanType(
  scheduleDays: string[],
  sessionMinutes: number,
  existing: PricingPlanRow[]
) {
  const base = derivePlanType(scheduleDays, sessionMinutes);
  const used = new Set(existing.map((row) => row.plan_type));
  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
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

async function refreshPlanCache(activeOnly = false, includeArchived = false) {
  const rows = await fetchPricingPlanRows(activeOnly);
  const allPlans = sortPlans(rows.map(rowToPlan));
  if (!activeOnly) {
    // Keep archived plans cached so historical enrollments can resolve their
    // original plan without another database request.
    setPricingPlanCache(allPlans);
  }
  return includeArchived
    ? allPlans
    : sortPlans(rows.filter((row) => !isArchived(row)).map(rowToPlan));
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
  return refreshPlanCache(false, true);
}

export async function getAllPricingPlans() {
  return refreshPlanCache(false);
}

export async function getActivePricingPlans() {
  const rows = await fetchPricingPlanRows(true);
  return sortPlans(rows.filter((row) => !isArchived(row)).map(rowToPlan));
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
  const planType = deriveUniquePlanType(
    input.scheduleDays,
    normalized.session_minutes,
    existing
  );

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

  await refreshPlanCache(false, true);
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

  await refreshPlanCache(false, true);
  return rowToPlan(data as PricingPlanRow);
}

const BLOCKING_ENROLLMENT_STATUSES = [
  "pending_payment",
  "active",
  "expiring_soon",
] as const;

export type DeletePricingPlanResult = "deleted" | "not_found" | "in_use";

export async function deletePricingPlan(id: string): Promise<DeletePricingPlanResult> {
  const supabase = await createClient();
  const [planResult, usageResult] = await Promise.all([
    supabase
      .from("pricing_plans")
      .select("id, description")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", id)
      .in("status", [...BLOCKING_ENROLLMENT_STATUSES]),
  ]);

  if (planResult.error) {
    throw new Error(`pricing_plan_fetch_failed: ${planResult.error.message}`);
  }
  if (usageResult.error) {
    throw new Error(`pricing_plan_usage_check_failed: ${usageResult.error.message}`);
  }

  const plan = planResult.data as Pick<PricingPlanRow, "id" | "description"> | null;
  if (!plan || plan.description?.archived_at) return "not_found";
  if ((usageResult.count ?? 0) > 0) return "in_use";

  const description: PricingPlanDescription = {
    ...(plan.description ?? {}),
    is_popular: false,
    archived_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("pricing_plans")
    .update({ is_active: false, description })
    .eq("id", id);

  if (error) {
    throw new Error(`pricing_plan_delete_failed: ${error.message}`);
  }

  await refreshPlanCache(false, true);
  return "deleted";
}
