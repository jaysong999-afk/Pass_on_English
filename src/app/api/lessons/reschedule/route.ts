import { NextResponse } from "next/server";
import { assertLearnerAccess, getAuthContext, requireTeacherAuth } from "@/lib/auth/session";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { resolveTeacherId } from "@/lib/teachers/resolve-teacher-id";
import {
  approveRescheduleRequestInDb,
  cancelRescheduleRequestInDb,
  createRescheduleRequestInDb,
  listAllRescheduleRequestsInDb,
  listStudentRescheduleRequestsInDb,
  listTeacherRescheduleRequestsInDb,
  rejectRescheduleRequestInDb,
} from "@/lib/reschedule/repository";

function errorStatus(error: string): number {
  if (error === "not_found" || error === "lesson_not_found" || error === "enrollment_not_found") return 404;
  if (error === "forbidden") return 403;
  if (
    [
      "student_reschedule_limit_reached",
      "pending_request_exists",
      "slot_unavailable",
      "request_expired",
      "reschedule_deadline_passed",
    ].includes(error)
  ) return 409;
  return 400;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const teacherId = searchParams.get("teacherId")?.trim();
  const studentId = searchParams.get("studentId")?.trim();
  const scope = searchParams.get("scope");

  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    if (scope === "all") {
      if (context.profile.role !== "admin") {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      return NextResponse.json({ requests: await listAllRescheduleRequestsInDb() });
    }

    if (teacherId) {
      if (
        context.profile.role !== "admin" &&
        (context.profile.role !== "teacher" || context.userId !== teacherId)
      ) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      const resolved = resolveTeacherId(teacherId) ?? teacherId;
      return NextResponse.json({
        requests: await listTeacherRescheduleRequestsInDb(resolved),
      });
    }

    if (studentId) {
      if (context.profile.role !== "admin") await assertLearnerAccess(studentId);
      return NextResponse.json({
        requests: await listStudentRescheduleRequestsInDb(studentId),
      });
    }

    const { teacherId: sessionTeacherId } = await requireTeacherAuth();
    return NextResponse.json({
      requests: await listTeacherRescheduleRequestsInDb(sessionTeacherId),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (context.profile.role !== "student" && context.profile.role !== "teacher") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const lessonId = typeof body.lessonId === "string" ? body.lessonId.trim() : "";
    const proposedScheduledAt =
      typeof body.proposedScheduledAt === "string" ? body.proposedScheduledAt.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    if (!lessonId || !proposedScheduledAt) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const result = await createRescheduleRequestInDb({
      lessonId,
      proposedScheduledAt,
      reason,
      initiator: context.profile.role,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: errorStatus(result.error) });
    }
    return NextResponse.json({ request: result.request }, { status: 201 });
  } catch (error) {
    console.error("[lessons/reschedule POST]", error);
    if (error instanceof Error && /lesson_reschedule_requests|create_lesson_reschedule_request/.test(error.message)) {
      return NextResponse.json({ error: "reschedule_storage_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (context.profile.role !== "student" && context.profile.role !== "teacher") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const action = body.action as "approve" | "reject" | "cancel";
    if (!id || !["approve", "reject", "cancel"].includes(action)) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const role = context.profile.role;
    const result =
      action === "approve"
        ? await approveRescheduleRequestInDb(id, role)
        : action === "cancel"
          ? await cancelRescheduleRequestInDb(id, role)
          : await rejectRescheduleRequestInDb(id, role);

    if (result.error) {
      return NextResponse.json(
        { error: result.error, request: result.request },
        { status: errorStatus(result.error) }
      );
    }
    return NextResponse.json({ request: result.request });
  } catch (error) {
    console.error("[lessons/reschedule PATCH]", error);
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}
