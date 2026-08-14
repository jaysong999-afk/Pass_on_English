import type {
  AccountType,
  CefrLevel,
  CountryCode,
  CoursePurpose,
  PaymentStatus,
  RegistrationStatus,
} from "@/types";

export interface RegisterAccountInput {
  accountType: AccountType;
  fullName: string;
  email: string;
  phone: string;
  country: CountryCode;
  learnerFullName: string;
  learnerEnglishName: string;
  learnerDateOfBirth: string;
}

export interface AddLearnerInput {
  fullName: string;
  englishName: string;
  dateOfBirth: string;
}

export interface LearnerSurveyInput {
  englishLevel: CefrLevel;
  purposes: CoursePurpose[];
  surveyNotes?: string;
}

export interface BookTrialInput {
  scheduledAt: string;
  trialLessonId: string;
  durationMinutes?: number;
}

export type { PaymentStatus, RegistrationStatus };
