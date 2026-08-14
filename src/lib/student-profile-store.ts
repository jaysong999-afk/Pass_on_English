import type { CefrLevel, CountryCode, CoursePurpose, PaymentStatus } from "@/types";
import {
  getAccountHolder,
  getActiveLearner,
  updateLearnerEnrollmentMeta,
} from "@/lib/account-store-sync";

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

export interface StudentSurveyInput {
  englishLevel: CefrLevel;
  purposes: CoursePurpose[];
  surveyNotes?: string;
}

export interface BookTrialInput {
  scheduledAt: string;
  trialLessonId: string;
}

export function registerStudentProfile(
  _input: Omit<
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
  throw new Error("deprecated: use POST /api/student/account");
}

export function updateStudentSurvey(_input: StudentSurveyInput): StudentProfile {
  throw new Error("deprecated: use PATCH /api/student/account");
}

export function bookTrialLesson(_input: BookTrialInput): StudentProfile {
  throw new Error("deprecated: use PATCH /api/student/account book_trial");
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

export { getAccountSession } from "@/lib/account-store-sync";
