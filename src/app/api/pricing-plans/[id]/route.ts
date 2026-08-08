import { NextResponse } from "next/server";
import { getAllEnrollments } from "@/lib/enrollment-store";
import {
  deletePricingPlan,
  getPricingPlanById,
  isPricingPlanInUse,
  isPricingPlanInUseIds,
  updatePricingPlan,
  type UpsertPricingPlanInput,
} from "@/lib/pricing-plans/repository";

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

  try {
    const plan = await getPricingPlanById(id);
    if (!plan) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ plan });
  } catch (error) {
    console.error("[pricing-plans/:id GET]", error);
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
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

  try {
    const updated = await updatePricingPlan(id, body);
    if (!updated) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ plan: updated });
  } catch (err) {
    console.error("[pricing-plans/:id PATCH]", err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const plan = await getPricingPlanById(id);
    if (!plan) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const inUseInDb = await isPricingPlanInUse(id);
    const enrollmentPlanIds = getAllEnrollments()
      .map((e) => e.planId)
      .filter(Boolean) as string[];
    const inUseInMemory = isPricingPlanInUseIds(id, enrollmentPlanIds);

    if (inUseInDb || inUseInMemory) {
      return NextResponse.json({ error: "plan_in_use" }, { status: 409 });
    }

    const deleted = await deletePricingPlan(id);
    if (!deleted) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[pricing-plans/:id DELETE]", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
