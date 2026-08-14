import { NextResponse } from "next/server";
import type { AccountType, CefrLevel, CountryCode, CoursePurpose } from "@/types";
import {
  bookTrialForLearner,
  ensureAccountSession,
  getAccountSession,
  getActiveLearner,
  registerAccount,
  setActiveLearner,
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

export async function GET() {
  try {
    const session = await ensureAccountSession();
    if (!session) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const activeLearner = getActiveLearner();
    return NextResponse.json({
      ...session,
      activeLearner,
      legacyProfile: learnerToLegacyProfile(activeLearner),
    });
  } catch (error) {
    console.error("[student/account GET]", error);
    return NextResponse.json({ error: "account_fetch_failed" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  const accountType = body.accountType as AccountType;
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const password = String(body.password ?? "").trim();
  const country = body.country as CountryCode;
  const learnerFullName = String(body.learnerFullName ?? body.fullName ?? "").trim();
  const learnerEnglishName = String(body.learnerEnglishName ?? body.englishName ?? "").trim();
  const learnerDateOfBirth = String(body.learnerDateOfBirth ?? body.dateOfBirth ?? "").trim();

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

  if (password.length < 8) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  if (!["self", "guardian"].includes(accountType)) {
    return NextResponse.json({ error: "invalid_account_type" }, { status: 400 });
  }

  if (!["KR", "CN", "OTHER"].includes(country)) {
    return NextResponse.json({ error: "invalid_country" }, { status: 400 });
  }

  try {
    const session = await registerAccount({
      accountType,
      fullName,
      email,
      phone,
      password,
      country,
      learnerFullName,
      learnerEnglishName,
      learnerDateOfBirth,
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    console.error("[student/account POST]", error);
    const message = error instanceof Error ? error.message : "signup_failed";
    if (message.includes("auth_signup_failed")) {
      const detail = message.split(": ").slice(1).join(": ").toLowerCase();
      if (
        detail.includes("already registered") ||
        detail.includes("already been registered") ||
        detail.includes("user already exists")
      ) {
        return NextResponse.json({ error: "email_already_registered" }, { status: 409 });
      }
      if (detail.includes("rate limit")) {
        return NextResponse.json({ error: "signup_rate_limited" }, { status: 429 });
      }
      return NextResponse.json({ error: "signup_failed" }, { status: 409 });
    }
    if (message.includes("auth_signin_failed")) {
      return NextResponse.json({ error: "email_already_registered" }, { status: 409 });
    }
    return NextResponse.json({ error: "signup_failed" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const sessionLoaded = await ensureAccountSession();
    if (!sessionLoaded) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (body.action === "switch_learner") {
      const learnerId = String(body.learnerId ?? "").trim();
      const learner = await setActiveLearner(learnerId);
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
      let sessionMinutes =
        body.sessionMinutes != null ? Number(body.sessionMinutes) : undefined;
      if (sessionMinutes == null && planId) {
        const planForMinutes = await getPricingPlanById(planId);
        sessionMinutes = planForMinutes?.sessionMinutes;
      }
      const learnerId = body.learnerId ? String(body.learnerId) : getActiveLearner().id;

      if (!scheduledAt || !teacherId || !teacherName) {
        return NextResponse.json({ error: "missing_trial_fields" }, { status: 400 });
      }

      const learnerBefore = getActiveLearner();
      if (learnerBefore.id !== learnerId) {
        await setActiveLearner(learnerId);
      }
      const learner = getActiveLearner();
      if (learner.id !== learnerId) {
        return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
      }
      if (learner.trialUsed) {
        return NextResponse.json({ error: "trial_already_used" }, { status: 400 });
      }

      const durationMinutes = sessionMinutes && sessionMinutes > 0 ? sessionMinutes : 20;
      const plan = planId ? await getPricingPlanById(planId) : undefined;
      const studentName = getStudentDisplayName(learner);

      const lesson = await createTrialLessonInDb({
        teacherId,
        teacherName,
        studentId: learner.id,
        studentName,
        scheduledAt,
        durationMinutes,
      });

      if (plan?.scheduleDays?.length) {
        const { start } = lessonScheduledAtToKstSlot(scheduledAt);
        await reserveTeacherWeeklySlotsInDb(teacherId, {
          planDays: plan.scheduleDays as DayLabel[],
          startTime: start as SlotStartTime,
          sessionMinutes: durationMinutes,
          studentName,
          studentId: learner.id,
        });
      }

      const updated = await bookTrialForLearner(learner.id, {
        scheduledAt,
        trialLessonId: lesson.id,
        durationMinutes,
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

    const updated = await updateLearnerSurvey(learnerId, {
      englishLevel,
      purposes,
      surveyNotes,
    });
    if (!updated) {
      return NextResponse.json({ error: "learner_not_found" }, { status: 404 });
    }

    return NextResponse.json({
      learner: updated,
      legacyProfile: learnerToLegacyProfile(updated),
    });
  } catch (error) {
    console.error("[student/account PATCH]", error);
    return NextResponse.json({ error: "account_update_failed" }, { status: 500 });
  }
}
