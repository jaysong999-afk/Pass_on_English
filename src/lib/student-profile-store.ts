import type { CefrLevel, CountryCode, CoursePurpose, PaymentStatus } from "@/types";
import {
  bookTrialForLearner,
  getAccountHolder,
  getActiveLearner,
  registerAccount,
  updateLearnerEnrollmentMeta,
  updateLearnerSurvey,
} from "@/lib/account-store";

/**
 * @deprecated Use AccountHolder + Learner from account-store.
 * Legacy shape for gradual migration — maps active learner + account contact fields.
 */
export interface StudentProfile {
  id: string;
  fullName: string;
  englishName: string;
  email: string;
  country: CountryCode;
  dateOfBirth: string;
  phone: string;
  englishLevel?: CefrLevel;
  purposes?: CoursePurpose[];
  surveyNotes?: string;
  trialUsed: boolean;
  trialScheduledAt?: string;
  trialLessonId?: string;
  paymentStatus: PaymentStatus;
  planLabel?: string;
  teacherName?: string;
  accountHolderId?: string;
  accountHolderName?: string;
}

export function learnerToLegacyProfile(learner = getActiveLearner()): StudentProfile {
  const account = getAccountHolder();
  return {
    id: learner.id,
    fullName: learner.fullName,
    englishName: learner.englishName,
    email: account.email,
    country: account.country,
    dateOfBirth: learner.dateOfBirth,
    phone: account.phone,
    englishLevel: learner.englishLevel,
    purposes: learner.purposes ? [...learner.purposes] : undefined,
    surveyNotes: learner.surveyNotes,
    trialUsed: learner.trialUsed,
    trialScheduledAt: learner.trialScheduledAt,
    trialLessonId: learner.trialLessonId,
    paymentStatus: learner.paymentStatus,
    planLabel: learner.planLabel,
    teacherName: learner.teacherName,
    accountHolderId: account.id,
    accountHolderName: account.fullName,
  };
}

export function getCurrentStudentProfile(): StudentProfile {
  return learnerToLegacyProfile();
}

export function registerStudentProfile(
  input: Omit<
    StudentProfile,
    | "id"
    | "englishLevel"
    | "purposes"
    | "surveyNotes"
    | "trialUsed"
    | "trialScheduledAt"
    | "trialLessonId"
    | "paymentStatus"
    | "planLabel"
    | "teacherName"
    | "accountHolderId"
    | "accountHolderName"
  > & { id?: string; accountType?: "self" | "guardian" }
): StudentProfile {
  registerAccount({
    accountType: input.accountType ?? "self",
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    country: input.country,
    learnerFullName: input.fullName,
    learnerEnglishName: input.englishName,
    learnerDateOfBirth: input.dateOfBirth,
  });
  return getCurrentStudentProfile();
}

export interface StudentSurveyInput {
  englishLevel: CefrLevel;
  purposes: CoursePurpose[];
  surveyNotes?: string;
}

export function updateStudentSurvey(input: StudentSurveyInput): StudentProfile {
  const learner = getActiveLearner();
  updateLearnerSurvey(learner.id, input);
  return getCurrentStudentProfile();
}

export interface BookTrialInput {
  scheduledAt: string;
  trialLessonId: string;
}

export function bookTrialLesson(input: BookTrialInput): StudentProfile {
  const learner = getActiveLearner();
  bookTrialForLearner(learner.id, input);
  return getCurrentStudentProfile();
}

export function updateStudentEnrollmentMeta(input: {
  paymentStatus?: PaymentStatus;
  planLabel?: string;
  teacherName?: string;
}): StudentProfile {
  const learner = getActiveLearner();
  updateLearnerEnrollmentMeta(learner.id, input);
  return getCurrentStudentProfile();
}

export { getAccountSession } from "@/lib/account-store";
