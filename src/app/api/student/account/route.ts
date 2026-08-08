import { NextResponse } from "next/server";
import type { AccountType, CefrLevel, CountryCode, CoursePurpose } from "@/types";
import {
  bookTrialForLearner,
  getAccountSession,
  getActiveLearner,
  registerAccount,
  setActiveLearner,
  updateLearnerSurvey,
} from "@/lib/account-store";
import { learnerToLegacyProfile } from "@/lib/student-profile-store";
import { createTrialLesson } from "@/lib/teacher-lesson-store";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getPricingPlanById } from "@/lib/pricing-plan-store";
import { reserveTeacherWeeklySlotsForPlan } from "@/lib/teacher-booked-slots";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { lessonScheduledAtToKstSlot } from "@/lib/availability/timezone";
import { VALID_CEFR_LEVELS, VALID_COURSE_PURPOSES } from "@/lib/student-survey-labels";

export async function GET() {
  const session = getAccountSession();
  const activeLearner = getActiveLearner();
  return NextResponse.json({
    ...session,
    activeLearner,
    legacyProfile: learnerToLegacyProfile(activeLearner),
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const accountType = body.accountType as AccountType;
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const country = body.country as CountryCode;
  const learnerFullName = String(body.learnerFullName ?? body.fullName ?? "").trim();
  const learnerEnglishName = String(body.learnerEnglishName ?? body.englishName ?? "").trim();
  const learnerDateOfBirth = String(body.learnerDateOfBirth ?? body.dateOfBirth ?? "").trim();

  if (!fullName || !email || !phone || !learnerFullName || !learnerEnglishName || !learnerDateOfBirth) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!["self", "guardian"].includes(accountType)) {
    return NextResponse.json({ error: "invalid_account_type" }, { status: 400 });
  }

  if (!["KR", "CN", "OTHER"].includes(country)) {
    return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  }

  const session = registerAccount({
    accountType,
    fullName,
    email,
    phone,
    country,
    learnerFullName,
    learnerEnglishName,
    learnerDateOfBirth,
  });

  return NextResponse.json({ session }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();

  if (body.action === "switch_learner") {
    const learnerId = String(body.learnerId ?? "").trim();
    const learner = setActiveLearner(learnerId);
    if (!learner) {
      return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
    }
    return NextResponse.json({
      session: getAccountSession(),
      activeLearner: learner,
      legacyProfile: learnerToLegacyProfile(learner),
    });
  }

  if (body.action === "book_trial") {
    const scheduledAt = String(body.scheduledAt ?? "").trim();
    const teacherId = String(body.teacherId ?? "").trim();
    const teacherName = String(body.teacherName ?? "").trim();
    const planId = body.planId != null ? String(body.planId).trim() : "";
    const sessionMinutes =
      body.sessionMinutes != null
        ? Number(body.sessionMinutes)
        : planId
          ? getPricingPlanById(planId)?.sessionMinutes
          : undefined;
    const learnerId = body.learnerId ? String(body.learnerId) : getActiveLearner().id;

    if (!scheduledAt || !teacherId || !teacherName) {
      return NextResponse.json({ error: "missing_trial_fields" }, { status: 400 });
    }

    const learnerBefore = getActiveLearner();
    if (learnerBefore.id !== learnerId) {
      setActiveLearner(learnerId);
    }
    const learner = getActiveLearner();
    if (learner.id !== learnerId) {
      return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
    }
    if (learner.trialUsed) {
      return NextResponse.json({ error: "trial_already_used" }, { status: 400 });
    }

    const durationMinutes = sessionMinutes && sessionMinutes > 0 ? sessionMinutes : 20;
    const plan = planId ? getPricingPlanById(planId) : undefined;
    const studentName = getStudentDisplayName(learner);

    const lesson = createTrialLesson({
      teacherId,
      teacherName,
      studentId: learner.id,
      studentName,
      scheduledAt,
      durationMinutes,
    });

    if (plan?.scheduleDays?.length) {
      const { start } = lessonScheduledAtToKstSlot(scheduledAt);
      reserveTeacherWeeklySlotsForPlan(
        teacherId,
        plan.scheduleDays as DayLabel[],
        start as SlotStartTime,
        studentName,
        durationMinutes
      );
    }

    const updated = bookTrialForLearner(learner.id, {
      scheduledAt,
      trialLessonId: lesson.id,
    });

    return NextResponse.json({
      learner: updated,
      lesson,
      legacyProfile: learnerToLegacyProfile(updated!),
    });
  }

  const englishLevel = body.englishLevel as CefrLevel;
  const purposes = body.purposes as CoursePurpose[];
  const surveyNotes = body.surveyNotes != null ? String(body.surveyNotes) : undefined;
  const learnerId = body.learnerId ? String(body.learnerId) : getActiveLearner().id;

  if (!VALID_CEFR_LEVELS.includes(englishLevel)) {
    return NextResponse.json({ error: "invalid_english_level" }, { status: 400 });
  }

  if (!Array.isArray(purposes) || purposes.length === 0) {
    return NextResponse.json({ error: "missing_purposes" }, { status: 400 });
  }

  if (!purposes.every((p) => VALID_COURSE_PURPOSES.includes(p))) {
    return NextResponse.json({ error: "invalid_purposes" }, { status: 400 });
  }

  const updated = updateLearnerSurvey(learnerId, { englishLevel, purposes, surveyNotes });
  if (!updated) {
    return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    learner: updated,
    legacyProfile: learnerToLegacyProfile(updated),
  });
}
