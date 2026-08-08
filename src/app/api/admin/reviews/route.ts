import { NextResponse } from "next/server";
import {
  getAdminReviewSnapshot,
  processAdminReviewAction,
} from "@/lib/admin/admin-review-store";

export async function GET() {
  return NextResponse.json(getAdminReviewSnapshot());
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const category = body.category as
      | "reschedule"
      | "teacher_signup"
      | "student_signup"
      | "payment_activation";
    const action = body.action as "approve" | "reject" | "confirm" | "activate";
    const targetId = String(body.targetId ?? "").trim();
    const adminName = body.adminName != null ? String(body.adminName) : undefined;

    if (!category || !action || !targetId) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result = processAdminReviewAction({
      category,
      action,
      targetId,
      adminName,
    });

    if (result.error) {
      const status = result.error === "not_found" ? 404 : 400;
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
