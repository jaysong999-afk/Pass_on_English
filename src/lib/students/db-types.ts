import type {
  CefrLevel,
  CountryCode,
  CoursePurpose,
  Learner,
  PaymentStatus,
  RegistrationStatus,
  VideoPlatform,
  StudentGender,
} from "@/types";

export interface StudentDbRow {
  id: string;
  account_holder_id: string;
  full_name: string | null;
  english_name: string;
  date_of_birth: string;
  gender: StudentGender | null;
  country: Extract<CountryCode, "KR" | "CN" | "PH"> | null;
  english_level: string | null;
  purposes: string[] | null;
  onboarding_note: string | null;
  trial_used: boolean;
  is_active: boolean;
  created_at: string;
  video_platforms: VideoPlatform[] | null;
}

export interface StudentEnrollmentMetaDbRow {
  student_id: string;
  payment_status: PaymentStatus;
}

export interface TrialLessonDbRow {
  student_id: string;
  id: string;
  scheduled_at: string;
  duration_minutes?: number;
}

export interface LearnerDbMeta {
  paymentStatus?: PaymentStatus;
  registrationStatus?: RegistrationStatus;
  trialScheduledAt?: string;
  trialLessonId?: string;
  trialDurationMinutes?: number;
}

export function studentDbRowToLearner(row: StudentDbRow, meta?: LearnerDbMeta): Learner {
  return {
    id: row.id,
    accountHolderId: row.account_holder_id,
    fullName: row.full_name?.trim() || row.english_name,
    englishName: row.english_name,
    dateOfBirth: row.date_of_birth,
    gender: row.gender ?? undefined,
    videoPlatforms: row.video_platforms?.length ? row.video_platforms : ["ZOOM"],
    englishLevel: (row.english_level as CefrLevel | null) ?? undefined,
    purposes: row.purposes?.length ? (row.purposes as CoursePurpose[]) : undefined,
    surveyNotes: row.onboarding_note ?? undefined,
    trialUsed: row.trial_used,
    trialScheduledAt: meta?.trialScheduledAt,
    trialLessonId: meta?.trialLessonId,
    trialDurationMinutes: meta?.trialDurationMinutes,
    paymentStatus: meta?.paymentStatus ?? "pending",
    ...(meta?.registrationStatus ? { registrationStatus: meta.registrationStatus } : {}),
    createdAt: row.created_at,
  };
}
