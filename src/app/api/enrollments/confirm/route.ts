import { NextResponse } from "next/server";
import type { Locale } from "@/lib/i18n/config";
import type { DayLabel } from "@/lib/availability/types";
import { ensureAccountSession, getAccountHolder, getActiveLearner, getLearnerById } from "@/lib/account-store";
import { ensureSchedulesBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { getPricingPlanById, warmPricingPlanCache } from "@/lib/pricing-plans/repository";
import {
  confirmNewEnrollmentInDb,
  confirmRenewalEnrollmentInDb,
} from "@/lib/enrollments/repository";
import { appendAdminReviewLogInDb } from "@/lib/admin/admin-review-log-repository";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { formatPlanLabel } from "@/lib/pricing-plan-display";

export async function POST(request: Request) {
  let body: {
    planId?: string;
    teacherId?: string;
    teacherName?: string;
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
    await ensureSchedulesBootstrapped();
  } catch (error) {
    console.error("[enrollments/confirm POST] bootstrap", error);
  }

  const session = await ensureAccountSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const account = getAccountHolder();
  const activeLearner = body.learnerId
    ? getLearnerById(String(body.learnerId))
    : getActiveLearner();

  if (!activeLearner) {
    return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
  }

  const currency = account.country === "CN" ? "CNY" : "KRW";
  const studentName = getStudentDisplayName(activeLearner);
  const locale = body.locale ?? "ko";

  try {
    if (body.renewFromEnrollmentId) {
      const fromId = String(body.renewFromEnrollmentId).trim();
      const { getEnrollmentById } = await import("@/lib/enrollment-store");
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
      const enrollment = await confirmRenewalEnrollmentInDb({
        fromEnrollmentId: fromId,
        amountKrw,
        locale,
        studentName,
      });

      try {
        await appendAdminReviewLogInDb({
          category: "payment_activation",
          action: "confirmed",
          targetId: enrollment.id,
          targetLabel: `${enrollment.planLabel} · ${enrollment.teacherName}`,
          detail: "재수강 신청 확인 · 입금 대기",
          adminName: studentName,
        });
      } catch (logError) {
        console.error("[enrollments/confirm POST] review log", logError);
      }

      return NextResponse.json({ enrollment }, { status: 201 });
    }

    const planId = String(body.planId ?? "").trim();
    const teacherId = String(body.teacherId ?? "").trim();
    const teacherName = String(body.teacherName ?? "").trim();

    if (!planId || !teacherId || !teacherName || !body.preferredSlotTime) {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const plan = await getPricingPlanById(planId);
    if (!plan) {
      return NextResponse.json({ error: "plan_not_found" }, { status: 404 });
    }

    const amountKrw = currency === "CNY" ? plan.priceCny : plan.priceKrw;
    const enrollment = await confirmNewEnrollmentInDb({
      studentId: activeLearner.id,
      teacherId,
      teacherName,
      planId,
      curriculum: body.curriculum,
      amountKrw,
      locale,
      preferredSlotDay: body.preferredSlotDay,
      preferredSlotTime: body.preferredSlotTime,
      studentName,
      bookTrial: !activeLearner.trialUsed,
    });

    try {
      await appendAdminReviewLogInDb({
        category: "payment_activation",
        action: "confirmed",
        targetId: enrollment.id,
        targetLabel: `${formatPlanLabel(plan, locale)} · ${teacherName}`,
        detail: `${(plan.scheduleDays ?? []).join("/")} ${body.preferredSlotTime} · 입금 대기`,
        adminName: studentName,
      });
    } catch (logError) {
      console.error("[enrollments/confirm POST] review log", logError);
    }

    return NextResponse.json({ enrollment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "confirm_failed";
    if (message === "slot_no_longer_available") {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (
      message === "not_renewable" ||
      message === "renewal_window_not_open" ||
      message === "renewal_window_closed"
    ) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[POST /api/enrollments/confirm]", error);
    return NextResponse.json({ error: "confirm_failed" }, { status: 400 });
  }
}
