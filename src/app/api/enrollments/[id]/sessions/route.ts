import { NextResponse } from "next/server";
import { adjustEnrollmentSessions } from "@/lib/enrollment-store";
import { adjustEnrollmentSessionsWithScheduleBatch } from "@/lib/lesson-scheduler";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: {
    action?: "adjust_sessions" | "add_session" | "remove_session";
    delta?: number;
    sessionsRemaining?: number;
    sessionsTotal?: number;
    deltaRemaining?: number;
    deltaTotal?: number;
    reason?: string;
    adminName?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    body.action === "adjust_sessions" ||
    body.action === "add_session" ||
    body.action === "remove_session"
  ) {
    const delta =
      body.action === "adjust_sessions"
        ? Number(body.delta)
        : body.action === "add_session"
          ? 1
          : -1;

    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "invalid_delta" }, { status: 400 });
    }

    const result = adjustEnrollmentSessionsWithScheduleBatch(id, Math.trunc(delta), {
      reason: body.reason,
      adminName: body.adminName,
    });

    if (!result) {
      return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error, enrollment: result.enrollment },
        { status: 409 }
      );
    }

    return NextResponse.json({
      enrollment: result.enrollment,
      action: result.action,
      appliedDelta: result.appliedDelta,
      lessons: result.lessons,
    });
  }

  const updated = adjustEnrollmentSessions(id, body);
  if (!updated) {
    return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
  }

  return NextResponse.json({ enrollment: updated });
}
