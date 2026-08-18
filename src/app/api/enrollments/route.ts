import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/auth/api-guard";
import { forbidden, unauthorized } from "@/lib/auth/errors";
import { assertLearnerAccess, getAuthContext, requireRole } from "@/lib/auth/session";
import { reportEnrollmentPaymentInDb } from "@/lib/enrollments/repository";
import {
  getAllEnrollments,
  getEnrollmentById,
  getEnrollmentsByStudent,
  getPaymentRecordsByStudent,
} from "@/lib/enrollment-store-sync";
import { decorateEnrollmentRenewal } from "@/lib/enrollments/renewal-window";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { ensureAccountSession, getActiveLearner, getLearnerById } from "@/lib/account-store";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");

  try {
    if (studentId) {
      const context = await getAuthContext();
      if (!context) {
        throw unauthorized();
      }
      if (context.profile.role === "student") {
        await assertLearnerAccess(studentId);
      } else if (context.profile.role !== "admin") {
        throw forbidden();
      }
    } else {
      await requireRole("admin");
    }
  } catch (error) {
    return authErrorResponse(error);
  }

  const data = studentId ? getEnrollmentsByStudent(studentId) : getAllEnrollments();
  const enrollments = data.map((enrollment) => decorateEnrollmentRenewal(enrollment));
  const payments = studentId ? getPaymentRecordsByStudent(studentId) : undefined;
  return NextResponse.json({ enrollments, payments });
}

export async function POST(request: Request) {
  let body: {
    enrollmentId?: string;
    depositorName?: string;
    learnerId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  await ensureSchedulesBootstrapped();

  const session = await ensureAccountSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const enrollmentId = String(body.enrollmentId ?? "").trim();
  if (!enrollmentId) {
    return NextResponse.json({ error: "missing_enrollment_id" }, { status: 400 });
  }

  const enrollment = getEnrollmentById(enrollmentId);
  if (!enrollment) {
    return NextResponse.json({ error: "enrollment_not_found" }, { status: 404 });
  }

  const activeLearner = body.learnerId
    ? getLearnerById(String(body.learnerId))
    : getActiveLearner();

  if (!activeLearner || activeLearner.id !== enrollment.studentId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const depositorName = String(body.depositorName ?? session.account.fullName).trim();
  if (!depositorName) {
    return NextResponse.json({ error: "missing_depositor" }, { status: 400 });
  }

  try {
    const updated = await reportEnrollmentPaymentInDb(enrollmentId, depositorName);
    return NextResponse.json({ enrollment: updated }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "report_failed";
    if (message === "payment_deadline_passed") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: "report_failed" }, { status: 400 });
  }
}
