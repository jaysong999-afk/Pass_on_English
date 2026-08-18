import type {
  AccountType,
  CefrLevel,
  CountryCode,
  CoursePurpose,
  RegistrationStatus,
  StudentGender,
  StudentRegistrationReview,
  VideoPlatform,
} from "@/types";
import { createClient } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import {
  getStudentRegistrationCache,
  patchStudentRegistrationCache,
  setStudentRegistrationCache,
} from "@/lib/student-registrations/registration-cache";

export interface RegisterStudentReviewInput {
  accountType: AccountType;
  fullName: string;
  email: string;
  phone: string;
  country: CountryCode;
  learnerFullName: string;
  learnerEnglishName: string;
  learnerDateOfBirth: string;
  learnerId: string;
  learnerGender?: StudentGender;
  videoPlatforms?: VideoPlatform[];
  englishLevel?: CefrLevel;
  purposes?: CoursePurpose[];
  surveyNotes?: string;
}

interface StudentRegistrationReviewRow {
  id: string;
  account_holder_name: string;
  account_email: string;
  account_phone: string;
  account_type: AccountType;
  country: CountryCode;
  learner_full_name: string;
  learner_english_name: string;
  learner_date_of_birth: string;
  learner_gender: StudentGender | null;
  video_platforms: VideoPlatform[] | null;
  english_level: string | null;
  purposes: string[] | null;
  survey_notes: string | null;
  status: RegistrationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

function normalizePurposes(purposes: string[] | null | undefined): CoursePurpose[] | undefined {
  if (!purposes?.length) return undefined;
  return purposes as CoursePurpose[];
}

function rowToReview(row: StudentRegistrationReviewRow): StudentRegistrationReview {
  return {
    id: row.id,
    accountHolderName: row.account_holder_name,
    accountEmail: row.account_email,
    accountPhone: row.account_phone,
    accountType: row.account_type,
    country: row.country,
    learnerFullName: row.learner_full_name,
    learnerEnglishName: row.learner_english_name,
    learnerDateOfBirth: row.learner_date_of_birth,
    learnerGender: row.learner_gender ?? undefined,
    videoPlatforms: row.video_platforms?.length ? row.video_platforms : ["ZOOM"],
    englishLevel: (row.english_level as CefrLevel | null) ?? undefined,
    purposes: normalizePurposes(row.purposes),
    surveyNotes: row.survey_notes ?? undefined,
    submittedAt: row.submitted_at,
    status: row.status,
  };
}

const SELECT_COLUMNS =
  "id, account_holder_name, account_email, account_phone, account_type, country, learner_full_name, learner_english_name, learner_date_of_birth, learner_gender, video_platforms, english_level, purposes, survey_notes, status, submitted_at, reviewed_at, reviewed_by";

async function fetchRegistrationRows(): Promise<StudentRegistrationReviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_registration_reviews")
    .select(SELECT_COLUMNS)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`student_registration_reviews_fetch_failed: ${error.message}`);
  }

  return (data ?? []) as StudentRegistrationReviewRow[];
}

async function refreshRegistrationCache() {
  const rows = await fetchRegistrationRows();
  const registrations = rows.map(rowToReview);
  setStudentRegistrationCache(registrations);
  return registrations;
}

export async function warmStudentRegistrationCache() {
  return refreshRegistrationCache();
}

export function getPendingStudentRegistrationsSync() {
  return getStudentRegistrationCache()
    .filter((r) => r.status === "pending")
    .slice()
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
    .map((r) => ({
      ...r,
      purposes: r.purposes ? [...r.purposes] : undefined,
    }));
}

export async function getStudentRegistrationByIdInDb(id: string) {
  const cached = getStudentRegistrationCache().find((r) => r.id === id);
  if (cached) return { ...cached, purposes: cached.purposes ? [...cached.purposes] : undefined };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_registration_reviews")
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`student_registration_review_fetch_failed: ${error.message}`);
  }
  if (!data) return null;

  const review = rowToReview(data as StudentRegistrationReviewRow);
  patchStudentRegistrationCache(review);
  return { ...review, purposes: review.purposes ? [...review.purposes] : undefined };
}

export async function registerStudentForReviewInDb(
  input: RegisterStudentReviewInput
): Promise<StudentRegistrationReview> {
  const existing = await getStudentRegistrationByIdInDb(input.learnerId);
  if (existing) return existing;

  const supabase = createPrivilegedClient();
  const { data, error } = await supabase
    .from("student_registration_reviews")
    .insert({
      id: input.learnerId,
      account_holder_name: input.fullName.trim(),
      account_email: input.email.trim(),
      account_phone: input.phone.trim(),
      account_type: input.accountType,
      country: input.country,
      learner_full_name: input.learnerFullName.trim(),
      learner_english_name: input.learnerEnglishName.trim(),
      learner_date_of_birth: input.learnerDateOfBirth,
      learner_gender: input.learnerGender ?? null,
      video_platforms: input.videoPlatforms?.length ? input.videoPlatforms : ["ZOOM"],
      english_level: input.englishLevel ?? null,
      purposes: input.purposes ?? [],
      survey_notes: input.surveyNotes?.trim() || null,
      status: "pending",
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error) {
    throw new Error(`student_registration_review_create_failed: ${error.message}`);
  }

  const review = rowToReview(data as StudentRegistrationReviewRow);
  patchStudentRegistrationCache(review);
  return { ...review, purposes: review.purposes ? [...review.purposes] : undefined };
}

export async function updateStudentRegistrationSurveyInDb(
  id: string,
  input: Pick<RegisterStudentReviewInput, "englishLevel" | "purposes" | "surveyNotes">
) {
  const supabase = createPrivilegedClient();
  const { data, error } = await supabase
    .from("student_registration_reviews")
    .update({
      english_level: input.englishLevel ?? null,
      purposes: input.purposes ?? [],
      survey_notes: input.surveyNotes?.trim() || null,
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`student_registration_review_survey_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const review = rowToReview(data as StudentRegistrationReviewRow);
  patchStudentRegistrationCache(review);
  return review;
}

export async function updateStudentRegistrationStatusInDb(
  id: string,
  status: RegistrationStatus,
  reviewedBy?: string
): Promise<StudentRegistrationReview | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_registration_reviews")
    .update({
      status,
      reviewed_at: new Date().toISOString(),
      ...(reviewedBy ? { reviewed_by: reviewedBy } : {}),
    })
    .eq("id", id)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`student_registration_review_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const review = rowToReview(data as StudentRegistrationReviewRow);
  patchStudentRegistrationCache(review);
  return { ...review, purposes: review.purposes ? [...review.purposes] : undefined };
}
