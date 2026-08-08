import { NextResponse } from "next/server";
import type { Locale } from "@/lib/i18n/config";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import {
  createEnrollment,
  createRenewalEnrollment,
  getAllEnrollments,
  getEnrollmentById,
  getEnrollmentsByStudent,
} from "@/lib/enrollment-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getAccountHolder, getActiveLearner, getLearnerById } from "@/lib/account-store";
import { warmPricingPlanCache, getPricingPlanById } from "@/lib/pricing-plans/repository";
import { learnerToLegacyProfile } from "@/lib/student-profile-store";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getStudent } from "@/lib/mock-data";
import { reserveTeacherWeeklySlotsForPlan } from "@/lib/teacher-booked-slots";

export async function GET(request: Request) {
  await ensureSchedulesBootstrapped();
  const { searchParams } = new URL(request.url);
  const studentId = searchParams.get("studentId");

  const data = studentId ? getEnrollmentsByStudent(studentId) : getAllEnrollments();
  return NextResponse.json({ enrollments: data });
}

export async function POST(request: Request) {
  let body: {
    planId?: string;
    teacherId?: string;
    teacherName?: string;
    depositorName?: string;
    learnerId?: string;
    curriculum?: string;
    locale?: Locale;
    preferredSlotDay?: string;
    preferredSlotTime?: string;
    renewFromEnrollmentId?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    await warmPricingPlanCache();
  } catch (error) {
    console.error("[enrollments POST] pricing plan cache", error);
    return NextResponse.json({ error: "plan_fetch_failed" }, { status: 500 });
  }

  const account = getAccountHolder();
  const activeLearner = body.learnerId
    ? getLearnerById(String(body.learnerId))
    : getActiveLearner();

  if (!activeLearner) {
    return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
  }

  const depositorName = String(body.depositorName ?? account.fullName).trim();
  const currency = account.country === "CN" ? "CNY" : "KRW";

  if (body.renewFromEnrollmentId) {
    const fromId = String(body.renewFromEnrollmentId).trim();
    const previous = getEnrollmentById(fromId);
    if (!previous) {
      return NextResponse.json({ error: "enrollment_not_found" }, { status: 404 });
    }
    if (previous.studentId !== activeLearner.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const plan = await getPricingPlanById(previous.planId);
    if (!plan) {
      return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
    }

    const amountKrw = currency === "CNY" ? plan.priceCny : plan.priceKrw;

    try {
      const enrollment = createRenewalEnrollment({
        fromEnrollmentId: fromId,
        depositorName,
        amountKrw,
        locale: body.locale,
      });

      const slotTime = (enrollment.preferredSlotTime ?? "10:00") as SlotStartTime;
      const student = getStudent(activeLearner.id);
      const studentName = student
        ? getStudentDisplayName(student)
        : getStudentDisplayName(activeLearner);

      reserveTeacherWeeklySlotsForPlan(
        enrollment.teacherId,
        (plan.scheduleDays ?? []) as DayLabel[],
        slotTime,
        studentName,
        plan.sessionMinutes
      );

      return NextResponse.json(
        {
          enrollment,
          learner: activeLearner,
          profile: learnerToLegacyProfile(activeLearner),
          depositorName: account.fullName,
        },
        { status: 201 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "create_failed";
      if (message === "not_renewable") {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      return NextResponse.json({ error: "create_failed" }, { status: 400 });
    }
  }

  const planId = String(body.planId ?? "").trim();
  const teacherId = String(body.teacherId ?? "").trim();
  const teacherName = String(body.teacherName ?? "").trim();

  if (!planId || !teacherId || !teacherName) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const plan = await getPricingPlanById(planId);
  if (!plan) {
    return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
  }

  const amountKrw = currency === "CNY" ? plan.priceCny : plan.priceKrw;

  try {
    const enrollment = createEnrollment({
      studentId: activeLearner.id,
      teacherId,
      teacherName,
      planId,
      depositorName,
      curriculum: body.curriculum,
      amountKrw,
      locale: body.locale,
      preferredSlotDay: body.preferredSlotDay,
      preferredSlotTime: body.preferredSlotTime,
    });

    if (body.preferredSlotTime) {
      const student = getStudent(activeLearner.id);
      const studentName = student
        ? getStudentDisplayName(student)
        : getStudentDisplayName(activeLearner);

      reserveTeacherWeeklySlotsForPlan(
        teacherId,
        (plan.scheduleDays ?? []) as DayLabel[],
        body.preferredSlotTime as SlotStartTime,
        studentName,
        plan.sessionMinutes
      );
    }

    return NextResponse.json(
      {
        enrollment,
        learner: activeLearner,
        profile: learnerToLegacyProfile(activeLearner),
        depositorName: account.fullName,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "create_failed" }, { status: 400 });
  }
}
