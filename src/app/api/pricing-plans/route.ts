import { NextResponse } from "next/server";
import {
  createPricingPlan,
  getActivePricingPlans,
  getAllPricingPlans,
  type UpsertPricingPlanInput,
} from "@/lib/pricing-plan-store";

const VALID_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function validateInput(body: UpsertPricingPlanInput) {
  if (!body.name?.trim()) return "name_required";
  if (!Array.isArray(body.scheduleDays) || body.scheduleDays.length === 0) {
    return "schedule_days_required";
  }
  if (!body.scheduleDays.every((d) => VALID_DAYS.includes(d))) {
    return "invalid_schedule_days";
  }
  if (body.sessionsCount == null || body.sessionMinutes == null) {
    return "missing_sessions";
  }
  if (body.priceKrw == null || body.priceCny == null) {
    return "missing_prices";
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") === "true";
  const data = activeOnly ? getActivePricingPlans() : getAllPricingPlans();
  return NextResponse.json({ plans: data });
}

export async function POST(request: Request) {
  const body = (await request.json()) as UpsertPricingPlanInput;
  const error = validateInput(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const plan = createPricingPlan(body);
  return NextResponse.json({ plan }, { status: 201 });
}
