import { guardApiRole, isGuardResponse } from "@/lib/auth/api-guard";
import { NextResponse } from "next/server";
import { assertLearnerAccess, getAuthContext } from "@/lib/auth/session";
import { getEnrollmentById } from "@/lib/enrollment-store";
import {
  cancelEnrollmentHoldInDb,
  confirmEnrollmentPaymentInDb,
  rejectEnrollmentPaymentInDb,
} from "@/lib/enrollments/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchedulesBootstrapped();
  const { id } = await params;
  const enrollment = getEnrollmentById(id);
  if (!enrollment) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ enrollment });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureSchedulesBootstrapped();
  const { id } = await params;

  let body: { action?: string; adminName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action;
  const adminName = body.adminName?.trim() || "관리자";

  if (action === "confirm_payment" || action === "reject_payment") {
    const auth = await guardApiRole("admin");
    if (isGuardResponse(auth)) return auth;
  }

  if (action === "cancel_hold") {
    const enrollment = getEnrollmentById(id);
    if (!enrollment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    try {
      const context = await getAuthContext();
      if (!context || context.profile.role !== "student") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      await assertLearnerAccess(enrollment.studentId);
    } catch {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    try {
      const cancelled = await cancelEnrollmentHoldInDb(id);
      if (!cancelled) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ enrollment: cancelled });
    } catch (error) {
      const message = error instanceof Error ? error.message : "cancel_failed";
      if (message === "cannot_cancel_after_payment_report") {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      return NextResponse.json({ error: "cancel_failed" }, { status: 400 });
    }
  }

  if (action === "confirm_payment") {
    try {
      const enrollment = await confirmEnrollmentPaymentInDb(id, adminName);
      if (!enrollment) {
        return NextResponse.json({ error: "not_found" }, { status: 404 });
      }
      return NextResponse.json({ enrollment });
    } catch (error) {
      console.error("[enrollments/:id PATCH confirm_payment]", error);
      const message = error instanceof Error ? error.message : "confirm_failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === "reject_payment") {
    const enrollment = await rejectEnrollmentPaymentInDb(id, adminName);
    if (!enrollment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ enrollment });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
