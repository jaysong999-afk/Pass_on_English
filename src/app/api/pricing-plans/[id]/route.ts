import { NextResponse } from "next/server";
import { getAllEnrollments } from "@/lib/enrollment-store";
import {
  deletePricingPlan,
  getPricingPlanById,
  isPricingPlanInUse,
  updatePricingPlan,
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const plan = getPricingPlanById(id);
  if (!plan) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ plan });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as UpsertPricingPlanInput;
  const error = validateInput(body);
  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const updated = updatePricingPlan(id, body);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ plan: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const plan = getPricingPlanById(id);
  if (!plan) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const enrollmentPlanIds = getAllEnrollments()
    .map((e) => e.planId)
    .filter(Boolean) as string[];

  if (isPricingPlanInUse(id, enrollmentPlanIds)) {
    return NextResponse.json({ error: "plan_in_use" }, { status: 409 });
  }

  deletePricingPlan(id);
  return NextResponse.json({ ok: true });
}
