import type {
  AccountHolder,
  AccountSession,
  AccountType,
  CefrLevel,
  CountryCode,
  CoursePurpose,
  Learner,
  PaymentStatus,
  RegistrationStatus,
} from "@/types";
import { registerStudentForReviewInDb } from "@/lib/student-registrations/repository";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { createClient, getBearerAccessToken } from "@/lib/supabase/server";
import { createPrivilegedClient } from "@/lib/supabase/admin";
import {
  createRegisteredStudentAuth,
  updateRegisteredProfile,
  type RegisterAccountDbInput,
} from "@/lib/accounts/register-account";
import {
  patchAccountSessionCache,
  setAccountSessionCache,
} from "@/lib/account-session-cache";
import type {
  AddLearnerInput,
  BookTrialInput,
  LearnerSurveyInput,
  RegisterAccountInput,
} from "@/lib/account-store.types";

interface ProfileRow {
  id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  account_type: AccountType | null;
  active_student_id: string | null;
  created_at: string;
}

interface StudentRow {
  id: string;
  account_holder_id: string;
  full_name: string | null;
  english_name: string;
  date_of_birth: string;
  country: "KR" | "CN" | null;
  english_level: string | null;
  purposes: string[] | null;
  onboarding_note: string | null;
  trial_used: boolean;
  is_active: boolean;
  created_at: string;
}

interface EnrollmentMetaRow {
  student_id: string;
  payment_status: PaymentStatus;
}

interface TrialLessonRow {
  student_id: string;
  id: string;
  scheduled_at: string;
  duration_minutes?: number;
}

function mapDbCountry(country: CountryCode): "KR" | "CN" | null {
  if (country === "KR" || country === "CN") return country;
  return null;
}

function resolveAccountCountry(
  students: StudentRow[],
  metadataCountry?: string
): CountryCode {
  const fromStudent = students.find((s) => s.country)?.country;
  if (fromStudent === "KR" || fromStudent === "CN") return fromStudent;
  if (metadataCountry === "KR" || metadataCountry === "CN" || metadataCountry === "OTHER") {
    return metadataCountry;
  }
  return "KR";
}

function rowToLearner(
  row: StudentRow,
  meta?: {
    paymentStatus?: PaymentStatus;
    registrationStatus?: RegistrationStatus;
    trialScheduledAt?: string;
    trialLessonId?: string;
    trialDurationMinutes?: number;
  }
): Learner {
  return {
    id: row.id,
    accountHolderId: row.account_holder_id,
    fullName: row.full_name?.trim() || row.english_name,
    englishName: row.english_name,
    dateOfBirth: row.date_of_birth,
    englishLevel: (row.english_level as CefrLevel | null) ?? undefined,
    purposes: row.purposes?.length
      ? (row.purposes as CoursePurpose[])
      : undefined,
    surveyNotes: row.onboarding_note ?? undefined,
    trialUsed: row.trial_used,
    trialScheduledAt: meta?.trialScheduledAt,
    trialLessonId: meta?.trialLessonId,
    trialDurationMinutes: meta?.trialDurationMinutes,
    paymentStatus: meta?.paymentStatus ?? "pending",
    registrationStatus: meta?.registrationStatus ?? "pending",
    createdAt: row.created_at,
  };
}

function rowToAccountHolder(
  profile: ProfileRow,
  email: string,
  country: CountryCode
): AccountHolder {
  return {
    id: profile.id,
    fullName: profile.full_name?.trim() || email,
    email,
    phone: profile.phone?.trim() || "",
    country,
    accountType: profile.account_type ?? "self",
    createdAt: profile.created_at,
  };
}

async function fetchEnrollmentMeta(studentIds: string[]) {
  const meta = new Map<string, { paymentStatus: PaymentStatus }>();
  if (studentIds.length === 0) return meta;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("student_id, payment_status, created_at")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`enrollments_meta_fetch_failed: ${error.message}`);
  }

  for (const row of (data ?? []) as EnrollmentMetaRow[]) {
    if (!meta.has(row.student_id)) {
      meta.set(row.student_id, { paymentStatus: row.payment_status });
    }
  }

  return meta;
}

async function fetchTrialLessons(studentIds: string[]) {
  const trials = new Map<string, TrialLessonRow>();
  if (studentIds.length === 0) return trials;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .select("id, student_id, scheduled_at, duration_minutes, status")
    .in("student_id", studentIds)
    .eq("is_trial", true)
    .eq("status", "scheduled")
    .gte("scheduled_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
    .order("scheduled_at", { ascending: true });

  if (error) {
    throw new Error(`trial_lessons_fetch_failed: ${error.message}`);
  }

  for (const row of (data ?? []) as TrialLessonRow[]) {
    if (!trials.has(row.student_id)) {
      trials.set(row.student_id, row);
    }
  }

  return trials;
}

async function buildAccountSession(
  profile: ProfileRow,
  email: string,
  students: StudentRow[],
  metadataCountry?: string
): Promise<AccountSession> {
  const studentIds = students.map((s) => s.id);
  const [enrollmentMeta, trialLessons] = await Promise.all([
    fetchEnrollmentMeta(studentIds),
    fetchTrialLessons(studentIds),
  ]);

  const learners = students.map((row) => {
    const trial = trialLessons.get(row.id);
    return rowToLearner(row, {
      paymentStatus: enrollmentMeta.get(row.id)?.paymentStatus,
      trialScheduledAt: trial?.scheduled_at,
      trialLessonId: trial?.id,
      trialDurationMinutes: trial?.duration_minutes,
    });
  });

  const activeLearnerId =
    profile.active_student_id && learners.some((l) => l.id === profile.active_student_id)
      ? profile.active_student_id
      : learners[0]?.id ?? "";

  const account = rowToAccountHolder(
    profile,
    email,
    resolveAccountCountry(students, metadataCountry)
  );

  return { account, learners, activeLearnerId };
}

function isMissingAuthSession(error: { message?: string; name?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.name === "AuthSessionMissingError" ||
    error.status === 401 ||
    message.includes("auth session missing") ||
    message.includes("jwt") ||
    message.includes("not authenticated")
  );
}

async function requireAuthUser() {
  const supabase = await createClient();
  const accessToken = await getBearerAccessToken();
  const {
    data: { user },
    error,
  } = accessToken
    ? await supabase.auth.getUser(accessToken)
    : await supabase.auth.getUser();

  if (error) {
    if (isMissingAuthSession(error)) {
      return { supabase, user: null as null };
    }
    throw new Error(`auth_get_user_failed: ${error.message}`);
  }

  return { supabase, user };
}

export async function loadAccountSession(): Promise<AccountSession | null> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, account_type, active_student_id, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`profile_fetch_failed: ${profileError.message}`);
  }
  if (!profile) return null;

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
    )
    .eq("account_holder_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (studentsError) {
    throw new Error(`students_fetch_failed: ${studentsError.message}`);
  }

  const metadataCountry = user.user_metadata?.country as string | undefined;
  const session = await buildAccountSession(
    profile as ProfileRow,
    user.email ?? "",
    (students ?? []) as StudentRow[],
    metadataCountry
  );

  setAccountSessionCache(session);
  return session;
}

export async function ensureAccountSession(): Promise<AccountSession | null> {
  return loadAccountSession();
}

export async function getAccountSessionFromDb(): Promise<AccountSession | null> {
  return loadAccountSession();
}

export async function getActiveLearnerFromDb(): Promise<Learner | null> {
  const session = await loadAccountSession();
  if (!session?.activeLearnerId) return null;
  return session.learners.find((l) => l.id === session.activeLearnerId) ?? null;
}

export async function getLearnerByIdFromDb(id: string): Promise<Learner | null> {
  const session = await loadAccountSession();
  if (!session) return null;
  return session.learners.find((l) => l.id === id) ?? null;
}

export async function setActiveLearnerInDb(learnerId: string): Promise<Learner | null> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return null;

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("id", learnerId)
    .eq("account_holder_id", user.id)
    .maybeSingle();

  if (studentError) {
    throw new Error(`student_lookup_failed: ${studentError.message}`);
  }
  if (!student) return null;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ active_student_id: learnerId })
    .eq("id", user.id);

  if (updateError) {
    throw new Error(`active_student_update_failed: ${updateError.message}`);
  }

  const session = await loadAccountSession();
  if (!session) return null;
  return session.learners.find((l) => l.id === learnerId) ?? null;
}

export async function registerAccountInDb(
  input: RegisterAccountDbInput
): Promise<AccountSession> {
  const { supabase, userId } = await createRegisteredStudentAuth(input);

  await updateRegisteredProfile(supabase, userId, input);

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      account_holder_id: userId,
      full_name: input.learnerFullName.trim(),
      english_name: input.learnerEnglishName.trim(),
      date_of_birth: input.learnerDateOfBirth,
      country: mapDbCountry(input.country),
      trial_used: false,
    })
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
    )
    .single();

  if (studentError) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
    if (serviceKey && serviceKey !== "placeholder-service-key") {
      const admin = createPrivilegedClient();
      const { data: adminStudent, error: adminStudentError } = await admin
        .from("students")
        .insert({
          account_holder_id: userId,
          full_name: input.learnerFullName.trim(),
          english_name: input.learnerEnglishName.trim(),
          date_of_birth: input.learnerDateOfBirth,
          country: mapDbCountry(input.country),
          trial_used: false,
        })
        .select(
          "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
        )
        .single();

      if (adminStudentError) {
        throw new Error(`student_create_failed: ${adminStudentError.message}`);
      }

      const { error: adminActiveError } = await admin
        .from("profiles")
        .update({ active_student_id: adminStudent.id })
        .eq("id", userId);

      if (adminActiveError) {
        throw new Error(`active_student_set_failed: ${adminActiveError.message}`);
      }

      await registerStudentForReviewInDb({
        ...input,
        learnerId: adminStudent.id,
      });

      const session = await loadAccountSession();
      if (!session) {
        throw new Error("account_session_load_failed");
      }
      return session;
    }

    throw new Error(`student_create_failed: ${studentError.message}`);
  }

  const { error: activeError } = await supabase
    .from("profiles")
    .update({ active_student_id: student.id })
    .eq("id", userId);

  if (activeError) {
    throw new Error(`active_student_set_failed: ${activeError.message}`);
  }

  await registerStudentForReviewInDb({
    ...input,
    learnerId: student.id,
  });

  const session = await loadAccountSession();
  if (!session) {
    throw new Error("account_session_load_failed");
  }

  return session;
}

export async function addLearnerInDb(input: AddLearnerInput): Promise<Learner> {
  const { supabase, user } = await requireAuthUser();
  if (!user) {
    throw new Error("auth_required");
  }

  const session = await loadAccountSession();
  const country = session?.account.country ?? "KR";

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      account_holder_id: user.id,
      full_name: input.fullName.trim(),
      english_name: input.englishName.trim(),
      date_of_birth: input.dateOfBirth,
      country: mapDbCountry(country),
      trial_used: false,
    })
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
    )
    .single();

  if (studentError) {
    throw new Error(`student_create_failed: ${studentError.message}`);
  }

  const { error: activeError } = await supabase
    .from("profiles")
    .update({ active_student_id: student.id })
    .eq("id", user.id);

  if (activeError) {
    throw new Error(`active_student_set_failed: ${activeError.message}`);
  }

  if (session) {
    await registerStudentForReviewInDb({
      accountType: session.account.accountType,
      fullName: session.account.fullName,
      email: session.account.email,
      phone: session.account.phone,
      country: session.account.country,
      learnerFullName: input.fullName.trim(),
      learnerEnglishName: input.englishName.trim(),
      learnerDateOfBirth: input.dateOfBirth,
      learnerId: student.id,
    });
  }

  await loadAccountSession();
  return rowToLearner(student as StudentRow);
}

export async function updateLearnerSurveyInDb(
  learnerId: string,
  input: LearnerSurveyInput
): Promise<Learner | null> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("students")
    .update({
      english_level: input.englishLevel,
      purposes: input.purposes,
      onboarding_note: input.surveyNotes?.trim() || null,
    })
    .eq("id", learnerId)
    .eq("account_holder_id", user.id)
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`student_survey_update_failed: ${error.message}`);
  }
  if (!data) return null;

  await loadAccountSession();
  return rowToLearner(data as StudentRow);
}

export async function bookTrialForLearnerInDb(
  learnerId: string,
  input: BookTrialInput
): Promise<Learner | null> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return null;

  const { data: existing, error: existingError } = await supabase
    .from("students")
    .select("trial_used")
    .eq("id", learnerId)
    .eq("account_holder_id", user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(`student_lookup_failed: ${existingError.message}`);
  }
  if (!existing || existing.trial_used) return null;

  const { data, error } = await supabase
    .from("students")
    .update({ trial_used: true })
    .eq("id", learnerId)
    .eq("account_holder_id", user.id)
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`student_trial_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const learner = rowToLearner(data as StudentRow, {
    trialScheduledAt: input.scheduledAt,
    trialLessonId: input.trialLessonId,
    trialDurationMinutes: input.durationMinutes,
  });

  const session = await loadAccountSession();
  if (session) {
    patchAccountSessionCache({
      ...session,
      learners: session.learners.map((l) =>
        l.id === learnerId
          ? {
              ...l,
              trialUsed: true,
              trialScheduledAt: input.scheduledAt,
              trialLessonId: input.trialLessonId,
              trialDurationMinutes: input.durationMinutes ?? l.trialDurationMinutes,
            }
          : l
      ),
    });
  }

  return learner;
}

/** Student country for teacher context, enrollments, etc. */
export async function fetchStudentCountryInDb(
  studentId: string
): Promise<CountryCode | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select("country")
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    throw new Error(`student_country_fetch_failed: ${error.message}`);
  }

  const country = data?.country;
  if (country === "KR" || country === "CN") return country;
  return null;
}

export async function fetchProfileAvatarUrlInDb(
  profileId: string
): Promise<string | undefined> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", profileId)
    .maybeSingle();

  const url = data?.avatar_url?.trim();
  return url || undefined;
}

export async function fetchStudentAvatarUrlInDb(
  studentId: string
): Promise<string | undefined> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("account_holder_id")
    .eq("id", studentId)
    .maybeSingle();

  if (!data?.account_holder_id) return undefined;
  return fetchProfileAvatarUrlInDb(data.account_holder_id);
}

export async function fetchStudentDisplayNameInDb(
  studentId: string,
  fallback = studentId
): Promise<string> {
  try {
    const { getStudentDirectoryEntryById } = await import("@/lib/students/student-directory-cache");
    const cached = getStudentDirectoryEntryById(studentId);
    if (cached) return getStudentDisplayName(cached.student);
  } catch {
    /* directory cache not loaded */
  }

  try {
    const cached = (await import("@/lib/account-store-sync")).getLearnerById(studentId);
    if (cached) return getStudentDisplayName(cached);
  } catch {
    /* session cache not loaded */
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .select("english_name, full_name")
    .eq("id", studentId)
    .maybeSingle();

  if (error) {
    throw new Error(`student_name_fetch_failed: ${error.message}`);
  }

  if (!data) return fallback;
  return getStudentDisplayName({
    englishName: data.english_name,
    fullName: data.full_name?.trim() || fallback,
  });
}
