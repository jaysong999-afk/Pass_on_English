import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { assertLearnerAccess } from "@/lib/auth/session";
import { listStudentEnrollmentsInDb } from "@/lib/enrollments/repository";
import { decorateEnrollmentRenewal } from "@/lib/enrollments/renewal-window";
import { listStudentLessonsInDb } from "@/lib/lessons/repository";
import { listStudentRescheduleRequestsInDb } from "@/lib/reschedule/repository";

export async function GET(request: Request) {
  const studentId = new URL(request.url).searchParams.get("studentId")?.trim();
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  try {
    await assertLearnerAccess(studentId);

    const [lessons, studentEnrollments, rescheduleData] = await Promise.all([
      listStudentLessonsInDb(studentId),
      listStudentEnrollmentsInDb(studentId),
      listStudentRescheduleRequestsInDb(studentId),
    ]);
    const enrollments = studentEnrollments.map((enrollment) =>
      decorateEnrollmentRenewal(
        enrollment,
        lessons,
        studentEnrollments
      )
    );

    return NextResponse.json({
      lessons,
      enrollments,
      requests: rescheduleData.requests,
      makeupRemaining: rescheduleData.makeupRemaining,
      makeupLimit: rescheduleData.makeupLimit,
    });
  } catch (error) {
    console.error("[student/lessons-dashboard GET]", error);
    return authErrorResponse(error);
  }
}
