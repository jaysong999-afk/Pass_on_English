import { NextResponse } from "next/server";
import {
  approveRescheduleRequest,
  cancelRescheduleRequest,
  createRescheduleRequest,
  getAllRescheduleRequests,
  getRescheduleRequestsForStudent,
  getRescheduleRequestsForTeacher,
  getStudentRescheduleRemaining,
  rejectRescheduleRequest,
  STUDENT_RESCHEDULE_MONTHLY_LIMIT,
} from "@/lib/reschedule-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId");
  const studentId = searchParams.get("studentId");
  const scope = searchParams.get("scope");

  if (scope === "all") {
    return NextResponse.json({ requests: getAllRescheduleRequests() });
  }

  if (teacherId) {
    return NextResponse.json({
      requests: getRescheduleRequestsForTeacher(teacherId),
    });
  }

  if (studentId) {
    return NextResponse.json({
      requests: getRescheduleRequestsForStudent(studentId),
      makeupRemaining: getStudentRescheduleRemaining(studentId),
      makeupLimit: STUDENT_RESCHEDULE_MONTHLY_LIMIT,
    });
  }

  return NextResponse.json({ error: "teacherId or studentId required" }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const lessonId = body.lessonId as string;
    const proposedScheduledAt = body.proposedScheduledAt as string;
    const initiator = body.initiator as "teacher" | "student";
    const reason = body.reason as string | undefined;

    if (!lessonId || !proposedScheduledAt || !initiator) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result = createRescheduleRequest({
      lessonId,
      proposedScheduledAt,
      reason,
      initiator,
    });

    if (result.error) {
      const status =
        result.error === "monthly_limit_reached" || result.error === "pending_request_exists"
          ? 409
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = body.id as string;
    const action = body.action as "approve" | "reject" | "cancel";
    const role = body.role as "teacher" | "student";

    if (!id || !action || !role) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result =
      action === "approve"
        ? approveRescheduleRequest(id, role)
        : action === "cancel"
          ? cancelRescheduleRequest(id, role)
          : rejectRescheduleRequest(id, role);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ request: result.request });
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
