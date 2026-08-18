import { NextResponse } from "next/server";
import { guardAdminApi, isAdminGuardResponse } from "@/lib/auth/admin-api-guard";
import {
  getAdminReviewSnapshot,
  processAdminReviewAction,
} from "@/lib/admin/admin-review-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET() {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  return NextResponse.json(getAdminReviewSnapshot());
}

export async function PATCH(request: Request) {
  const guard = await guardAdminApi();
  if (isAdminGuardResponse(guard)) return guard;

  await ensureSchedulesBootstrapped();
  try {
    const body = await request.json();
    const category = body.category as
      | "reschedule"
      | "teacher_signup"
      | "student_signup"
      | "payment_activation";
    const action = body.action as "approve" | "reject" | "confirm" | "activate";
    const targetId = String(body.targetId ?? "").trim();
    const adminName = guard.profile.fullName?.trim() || guard.email;

    if (!category || !action || !targetId) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result = await processAdminReviewAction({
      category,
      action,
      targetId,
      adminName,
    });

    if (result.error) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "slot_unavailable" || result.error === "hold_expired"
            ? 409
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      log: result.log,
      snapshot: getAdminReviewSnapshot(),
    });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
