import { NextResponse } from "next/server";
import type { AccountType, CefrLevel, CountryCode, CoursePurpose } from "@/types";
import {
  bookTrialForLearner,
  ensureAccountSession,
  getAccountSession,
  getActiveLearner,
  registerAccount,
  updateLearnerSurvey,
} from "@/lib/account-store";
import { learnerToLegacyProfile } from "@/lib/student-profile-store";
import { createTrialLessonInDb } from "@/lib/lessons/repository";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { getPricingPlanById } from "@/lib/pricing-plans/repository";
import { reserveTeacherWeeklySlotsInDb } from "@/lib/teacher-availability/repository";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { lessonScheduledAtToKstSlot } from "@/lib/availability/timezone";
import { VALID_CEFR_LEVELS, VALID_COURSE_PURPOSES } from "@/lib/student-survey-labels";

/** @deprecated Prefer GET /api/student/account */
export async function GET() {
  const session = await ensureAccountSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const activeLearner = getActiveLearner();
  return NextResponse.json({
    profile: learnerToLegacyProfile(activeLearner),
    account: getAccountSession().account,
    activeLearnerId: getAccountSession().activeLearnerId,
  });
}

export async function POST(request: Request) {
  const body = await request.json();

  const accountType = (body.accountType ?? "self") as AccountType;
  const fullName = String(body.fullName ?? "").trim();
  const englishName = String(body.englishName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "").trim();
  const country = body.country as CountryCode;
  const dateOfBirth = String(body.dateOfBirth ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const learnerFullName = String(body.learnerFullName ?? fullName).trim();
  const learnerEnglishName = String(body.learnerEnglishName ?? englishName).trim();
  const learnerDateOfBirth = String(body.learnerDateOfBirth ?? dateOfBirth).trim();
  const learnerGender = body.learnerGender === "male" ? "male" : "female";

  if (
    !fullName ||
    !email ||
    !phone ||
    !password ||
    !learnerFullName ||
    !learnerEnglishName ||
    !learnerDateOfBirth
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  if (!["KR", "CN", "OTHER"].includes(country)) {
    return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  }

  try {
    await registerAccount({
      accountType,
      fullName,
      email,
      phone,
      password,
      country,
      learnerFullName,
      learnerEnglishName,
      learnerDateOfBirth,
      learnerGender,
      videoPlatforms: ["ZOOM"],
    });
  } catch {
    return NextResponse.json({ error: "signup_failed" }, { status: 500 });
  }

  return NextResponse.json({ profile: learnerToLegacyProfile(getActiveLearner()) });
}

export async function PATCH(request: Request) {
  const session = await ensureAccountSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (body.action === "book_trial") {
    const scheduledAt = String(body.scheduledAt ?? "").trim();
    const teacherId = String(body.teacherId ?? "").trim();
    const teacherName = String(body.teacherName ?? "").trim();
    const planId = body.planId != null ? String(body.planId).trim() : "";
    let sessionMinutes =
      body.sessionMinutes != null ? Number(body.sessionMinutes) : undefined;
    if (sessionMinutes == null && planId) {
      const planForMinutes = await getPricingPlanById(planId);
      sessionMinutes = planForMinutes?.sessionMinutes;
    }

    if (!scheduledAt || !teacherId || !teacherName) {
      return NextResponse.json({ error: "missing_trial_fields" }, { status: 400 });
    }

    const learner = getActiveLearner();
    if (learner.trialUsed) {
      return NextResponse.json({ error: "trial_already_used" }, { status: 400 });
    }

    const durationMinutes = sessionMinutes && sessionMinutes > 0 ? sessionMinutes : 20;
    const plan = planId ? await getPricingPlanById(planId) : undefined;

    const lesson = await createTrialLessonInDb({
      teacherId,
      teacherName,
      studentId: learner.id,
      studentName: getStudentDisplayName(learner),
      scheduledAt,
      durationMinutes,
    });

    if (plan?.scheduleDays?.length) {
      const { start } = lessonScheduledAtToKstSlot(scheduledAt);
      await reserveTeacherWeeklySlotsInDb(teacherId, {
        planDays: plan.scheduleDays as DayLabel[],
        startTime: start as SlotStartTime,
        sessionMinutes: durationMinutes,
        studentName: getStudentDisplayName(learner),
        studentId: learner.id,
      });
    }

    const updated = await bookTrialForLearner(learner.id, {
      scheduledAt,
      trialLessonId: lesson.id,
      durationMinutes,
    });

    return NextResponse.json({
      profile: learnerToLegacyProfile(updated!),
      lesson,
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

  const updated = await updateLearnerSurvey(learnerId, { englishLevel, purposes, surveyNotes });
  if (!updated) {
    return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
  }

  return NextResponse.json({ profile: learnerToLegacyProfile(updated) });
}
