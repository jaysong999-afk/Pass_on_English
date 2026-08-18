import type {
  AccountHolder,
  AccountSession,
  AccountType,
  CountryCode,
  Learner,
} from "@/types";
import {
  registerStudentForReviewInDb,
  updateStudentRegistrationSurveyInDb,
} from "@/lib/student-registrations/repository";
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
import { countryToTimezone } from "@/lib/account-location";
import { studentDbRowToLearner, type StudentDbRow } from "@/lib/students/db-types";
import {
  fetchLatestEnrollmentMetaByStudent,
  fetchUpcomingTrialLessonsByStudent,
} from "@/lib/students/db-readers";

interface ProfileRow {
  id: string;
  role: string;
  full_name: string | null;
  phone: string | null;
  country?: CountryCode | null;
  timezone?: string | null;
  account_type: AccountType | null;
  active_student_id: string | null;
  created_at: string;
}

function mapDbCountry(country: CountryCode): "KR" | "CN" | "PH" | null {
  if (country === "KR" || country === "CN" || country === "PH") return country;
  return null;
}

function resolveAccountCountry(
  profileCountry: CountryCode | null,
  students: StudentDbRow[],
  metadataCountry?: string
): CountryCode {
  if (["KR", "CN", "PH", "OTHER"].includes(profileCountry ?? "")) return profileCountry!;
  const fromStudent = students.find((s) => s.country)?.country;
  if (fromStudent === "KR" || fromStudent === "CN" || fromStudent === "PH") return fromStudent;
  if (metadataCountry === "KR" || metadataCountry === "CN" || metadataCountry === "PH" || metadataCountry === "OTHER") {
    return metadataCountry;
  }
  return "KR";
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
    timezone: profile.timezone?.trim() || countryToTimezone(country),
    accountType: profile.account_type ?? "self",
    createdAt: profile.created_at,
  };
}

async function buildAccountSession(
  profile: ProfileRow,
  email: string,
  students: StudentDbRow[],
  metadataCountry?: string,
  metadataTimezone?: string
): Promise<AccountSession> {
  const studentIds = students.map((s) => s.id);
  const [enrollmentMeta, trialLessons] = await Promise.all([
    fetchLatestEnrollmentMetaByStudent(studentIds),
    fetchUpcomingTrialLessonsByStudent(studentIds),
  ]);

  const learners = students.map((row) => {
    const trial = trialLessons.get(row.id);
    return studentDbRowToLearner(row, {
      paymentStatus: enrollmentMeta.get(row.id)?.paymentStatus,
      registrationStatus: "pending",
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
    { ...profile, timezone: profile.timezone ?? metadataTimezone ?? null },
    email,
    resolveAccountCountry(profile.country ?? null, students, metadataCountry)
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

  let { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, full_name, phone, country, timezone, account_type, active_student_id, created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError && /country|timezone/i.test(profileError.message)) {
    const fallback = await supabase
      .from("profiles")
      .select("id, role, full_name, phone, account_type, active_student_id, created_at")
      .eq("id", user.id)
      .maybeSingle();
    profile = fallback.data as typeof profile;
    profileError = fallback.error;
  }

  if (profileError) {
    throw new Error(`profile_fetch_failed: ${profileError.message}`);
  }
  if (!profile) return null;

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
    )
    .eq("account_holder_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (studentsError) {
    throw new Error(`students_fetch_failed: ${studentsError.message}`);
  }

  const metadataCountry = user.user_metadata?.country as string | undefined;
  const metadataTimezone = user.user_metadata?.timezone as string | undefined;
  const session = await buildAccountSession(
    profile as ProfileRow,
    user.email ?? "",
    (students ?? []) as StudentDbRow[],
    metadataCountry,
    metadataTimezone
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

export async function updateAccountProfileInDb(input: {
  phone?: string;
  country?: CountryCode;
  learners?: Array<{ id: string; englishName?: string; videoPlatforms?: import("@/types").VideoPlatform[] }>;
}): Promise<AccountSession | null> {
  const { supabase, user } = await requireAuthUser();
  if (!user) return null;

  const profilePatch: Record<string, string> = {};
  if (input.phone !== undefined) profilePatch.phone = input.phone.trim();
  if (input.country !== undefined) {
    profilePatch.country = input.country;
    profilePatch.timezone = countryToTimezone(input.country);
  }
  if (Object.keys(profilePatch).length > 0) {
    const { error } = await supabase.from("profiles").update(profilePatch).eq("id", user.id);
    if (error && input.country !== undefined && /country|timezone/i.test(error.message)) {
      if (input.phone !== undefined) {
        const fallback = await supabase.from("profiles").update({ phone: input.phone.trim() }).eq("id", user.id);
        if (fallback.error) throw new Error(`account_profile_update_failed: ${fallback.error.message}`);
      }
    } else if (error) {
      throw new Error(`account_profile_update_failed: ${error.message}`);
    }
  }

  if (input.country !== undefined && input.country !== "PH" && input.country !== "OTHER") {
    const { error } = await supabase
      .from("students")
      .update({ country: mapDbCountry(input.country) })
      .eq("account_holder_id", user.id);
    if (error) throw new Error(`student_country_update_failed: ${error.message}`);
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { country: input.country, timezone: countryToTimezone(input.country) },
    });
    if (metadataError) {
      const admin = createPrivilegedClient();
      const { error: adminMetadataError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { country: input.country, timezone: countryToTimezone(input.country) },
      });
      if (adminMetadataError) {
        throw new Error(`account_metadata_update_failed: ${adminMetadataError.message}`);
      }
    }
  }

  for (const learner of input.learners ?? []) {
    const englishName = learner.englishName?.trim();
    if (learner.englishName !== undefined && !englishName) throw new Error("missing_fields");
    const patch = {
      ...(englishName ? { english_name: englishName } : {}),
      ...(learner.videoPlatforms ? { video_platforms: learner.videoPlatforms } : {}),
    };
    const { data, error } = await supabase
      .from("students")
      .update(patch)
      .eq("id", learner.id)
      .eq("account_holder_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(`student_english_name_update_failed: ${error.message}`);
    if (!data) throw new Error("learner_not_found");
  }

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
      gender: input.learnerGender,
      country: mapDbCountry(input.country),
      trial_used: false,
      video_platforms: input.videoPlatforms,
    })
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
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
          gender: input.learnerGender,
          country: mapDbCountry(input.country),
          trial_used: false,
          video_platforms: input.videoPlatforms,
        })
        .select(
          "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
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
      "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
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
  return studentDbRowToLearner(student as StudentDbRow, { registrationStatus: "pending" });
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
      "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`student_survey_update_failed: ${error.message}`);
  }
  if (!data) return null;

  await updateStudentRegistrationSurveyInDb(learnerId, {
    englishLevel: input.englishLevel,
    purposes: input.purposes,
    surveyNotes: input.surveyNotes,
  });
  await loadAccountSession();
  return studentDbRowToLearner(data as StudentDbRow, { registrationStatus: "pending" });
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
      "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
    )
    .maybeSingle();

  if (error) {
    throw new Error(`student_trial_update_failed: ${error.message}`);
  }
  if (!data) return null;

  const learner = studentDbRowToLearner(data as StudentDbRow, {
    registrationStatus: "pending",
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
