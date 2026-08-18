import { NextResponse } from "next/server";
import { assertLearnerAccess, getAuthContext, requireTeacherAuth } from "@/lib/auth/session";
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
  getRescheduleRequestById,
  STUDENT_RESCHEDULE_MONTHLY_LIMIT,
} from "@/lib/reschedule-store-sync";
import { warmLessonCache } from "@/lib/lessons/repository";
import { getLessonById } from "@/lib/teacher-lesson-store-sync";
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

  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (scope === "all" && context.profile.role === "admin") {
    return NextResponse.json({ requests: getAllRescheduleRequests() });
  }

  if (teacherId) {
    if (context.profile.role !== "admin" && (context.profile.role !== "teacher" || context.userId !== teacherId)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const resolved = resolveTeacherId(teacherId) ?? teacherId;
    return NextResponse.json({
      requests: getRescheduleRequestsForTeacher(resolved),
    });
  }

  if (studentId) {
    if (context.profile.role !== "admin") {
      try { await assertLearnerAccess(studentId); } catch (error) { return authErrorResponse(error); }
    }
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
    const reason = body.reason as string | undefined;

    if (!lessonId || !proposedScheduledAt) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    const context = await getAuthContext();
    if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (context.profile.role === "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const lesson = getLessonById(lessonId);
    if (!lesson?.studentId) return NextResponse.json({ error: "lesson_not_found" }, { status: 404 });
    const initiator = context.profile.role;
    if (initiator === "teacher") {
      const teacher = await requireTeacherAuth();
      if (lesson.teacherId !== teacher.teacherId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    } else {
      try { await assertLearnerAccess(lesson.studentId); } catch (error) { return authErrorResponse(error); }
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
    if (error instanceof Error && /lesson_reschedule_requests|create_lesson_reschedule_request/.test(error.message)) {
      return NextResponse.json({ error: "reschedule_storage_unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    await ensureSchedulesBootstrapped();
    const body = await request.json();
    const id = body.id as string;
    const action = body.action as "approve" | "reject" | "cancel";

    if (!id || !action) {
      return NextResponse.json({ error: "invalid_body" }, { status: 400 });
    }

    await warmRescheduleCache();
    const current = getRescheduleRequestById(id);
    if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const context = await getAuthContext();
    if (!context) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (context.profile.role === "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const role = context.profile.role;
    if (role === "teacher") {
      const teacher = await requireTeacherAuth();
      if (current.teacherId !== teacher.teacherId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    } else {
      try { await assertLearnerAccess(current.studentId); } catch (error) { return authErrorResponse(error); }
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
