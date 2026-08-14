import { NextResponse } from "next/server";
import { getAuthContext, requireTeacherAuth } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { resolveTeacherId } from "@/lib/teachers/resolve-teacher-id";
import {
  createRescheduleRequestInDb,
  approveRescheduleRequestInDb,
  cancelRescheduleRequestInDb,
  rejectRescheduleRequestInDb,
  warmRescheduleCache,
} from "@/lib/reschedule/repository";
import {
  getAllRescheduleRequests,
  getRescheduleRequestsForStudent,
  getRescheduleRequestsForTeacher,
  getStudentRescheduleRemaining,
  STUDENT_RESCHEDULE_MONTHLY_LIMIT,
} from "@/lib/reschedule-store";
import { warmLessonCache } from "@/lib/lessons/repository";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export async function GET(request: Request) {
  try {
    await ensureSchedulesBootstrapped();
  } catch (error) {
    console.error("[lessons/reschedule GET] bootstrap", error);
  }

  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId");
  const studentId = searchParams.get("studentId");
  const scope = searchParams.get("scope");

  if (scope === "all") {
    return NextResponse.json({ requests: getAllRescheduleRequests() });
  }

  if (teacherId) {
    const resolved = resolveTeacherId(teacherId) ?? teacherId;
    return NextResponse.json({
      requests: getRescheduleRequestsForTeacher(resolved),
    });
  }

  if (studentId) {
    return NextResponse.json({
      requests: getRescheduleRequestsForStudent(studentId),
      makeupRemaining: getStudentRescheduleRemaining(studentId),
      makeupLimit: STUDENT_RESCHEDULE_MONTHLY_LIMIT,
    });
  }

  try {
    const { teacherId: sessionTeacherId } = await requireTeacherAuth();
    return NextResponse.json({
      requests: getRescheduleRequestsForTeacher(sessionTeacherId),
    });
  } catch (error) {
    const context = await getAuthContext();
    if (context?.profile.role === "admin") {
      return NextResponse.json({ error: "teacherId or studentId required" }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await ensureSchedulesBootstrapped();
    await warmLessonCache();
    await warmRescheduleCache();

    const body = await request.json();
    const lessonId = body.lessonId as string;
    const proposedScheduledAt = body.proposedScheduledAt as string;
    const initiator = body.initiator as "teacher" | "student";
    const reason = body.reason as string | undefined;

    if (!lessonId || !proposedScheduledAt || !initiator) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result = await createRescheduleRequestInDb({
      lessonId,
      proposedScheduledAt,
      reason,
      initiator,
    });

    if (result.error) {
      const status =
        result.error === "monthly_limit_reached" ||
        result.error === "pending_request_exists" ||
        result.error === "slot_unavailable"
          ? 409
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch (error) {
    console.error("[lessons/reschedule POST]", error);
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureSchedulesBootstrapped();
    const body = await request.json();
    const id = body.id as string;
    const action = body.action as "approve" | "reject" | "cancel";
    const role = body.role as "teacher" | "student";

    if (!id || !action || !role) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result =
      action === "approve"
        ? await approveRescheduleRequestInDb(id, role)
        : action === "cancel"
          ? await cancelRescheduleRequestInDb(id, role)
          : await rejectRescheduleRequestInDb(id, role);

    if (result.error) {
      const status = result.error === "slot_unavailable" ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ request: result.request });
  } catch (error) {
    console.error("[lessons/reschedule PATCH]", error);
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
