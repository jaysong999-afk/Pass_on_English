import { NextResponse } from "next/server";
import {
  confirmEnrollmentPayment,
  getEnrollmentById,
  rejectEnrollmentPayment,
} from "@/lib/enrollment-store";
import { scheduleLessonsForConfirmedEnrollment } from "@/lib/lesson-scheduler";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;

  let body: { action?: string; adminName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const action = body.action;
  const adminName = body.adminName?.trim() || "관리자";

  if (action === "confirm_payment") {
    const enrollment = confirmEnrollmentPayment(id, adminName);
    if (!enrollment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const scheduleResult = scheduleLessonsForConfirmedEnrollment(id);
    return NextResponse.json({ enrollment, scheduleResult });
  }

  if (action === "reject_payment") {
    const enrollment = rejectEnrollmentPayment(id, adminName);
    if (!enrollment) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ enrollment });
  }

  return NextResponse.json({ error: "invalid_action" }, { status: 400 });
}
