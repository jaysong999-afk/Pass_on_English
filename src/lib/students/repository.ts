import type {
  AccountHolder,
  AccountType,
  CountryCode,
  Learner,
  Student,
} from "@/types";
import { countryToTimezone } from "@/lib/account-location";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store-sync";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStudentDirectoryCache,
  getStudentDirectoryEntryById,
  setStudentDirectoryCache,
  type StudentDirectoryEntry,
} from "@/lib/students/student-directory-cache";
import { studentDbRowToLearner, type StudentDbRow } from "@/lib/students/db-types";
import {
  fetchLatestEnrollmentMetaByStudent,
  fetchUpcomingTrialLessonsByStudent,
} from "@/lib/students/db-readers";

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  account_type: AccountType | null;
  created_at: string;
}

async function fetchProfileMap(holderIds: string[]) {
  const map = new Map<string, ProfileRow>();
  if (holderIds.length === 0) return map;

  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, account_type, created_at")
    .in("id", holderIds);

  if (error) {
    throw new Error(`profiles_fetch_failed: ${error.message}`);
  }

  for (const row of (data ?? []) as ProfileRow[]) {
    map.set(row.id, row);
  }

  return map;
}

async function fetchAccountEmails(holderIds: string[]) {
  const emails = new Map<string, string>();
  if (holderIds.length === 0) return emails;

  const admin = createAdminClient();
  await Promise.all(
    holderIds.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id);
        if (!error && data.user?.email) {
          emails.set(id, data.user.email);
        }
      } catch {
        /* optional — service role may be unavailable in some envs */
      }
    })
  );

  return emails;
}

function buildStudentProfile(
  row: StudentDbRow,
  learner: Learner,
  accountEmail?: string
): Student {
  const enrollments = getEnrollmentsByStudent(row.id).sort((a, b) =>
    b.startDate.localeCompare(a.startDate)
  );
  const primary =
    enrollments.find(
      (e) =>
        e.status === "active" ||
        e.status === "expiring_soon" ||
        e.status === "pending_payment"
    ) ?? enrollments[0];

  return {
    id: row.id,
    fullName: learner.fullName,
    englishName: learner.englishName,
    email: accountEmail,
    dateOfBirth: learner.dateOfBirth,
    gender: learner.gender,
    country: (row.country ?? "KR") as CountryCode,
    englishLevel: learner.englishLevel ?? "A1",
    purposes: learner.purposes ?? [],
    trialUsed: learner.trialUsed,
    paymentStatus: primary?.paymentStatus ?? learner.paymentStatus,
    planLabel: primary?.planLabel,
    teacherName: primary?.teacherName,
  };
}

function buildAccountHolder(
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
    timezone: countryToTimezone(country),
    accountType: profile.account_type ?? "self",
    createdAt: profile.created_at,
  };
}

export async function warmStudentDirectoryCache(): Promise<void> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, gender, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at, video_platforms"
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`students_directory_fetch_failed: ${error.message}`);
  }

  const rows = (data ?? []) as StudentDbRow[];
  const studentIds = rows.map((row) => row.id);
  const holderIds = [...new Set(rows.map((row) => row.account_holder_id))];

  const [enrollmentMeta, trialLessons, profileMap, emailMap] = await Promise.all([
    fetchLatestEnrollmentMetaByStudent(studentIds),
    fetchUpcomingTrialLessonsByStudent(studentIds),
    fetchProfileMap(holderIds),
    fetchAccountEmails(holderIds),
  ]);

  const next: StudentDirectoryEntry[] = rows.map((row) => {
    const trial = trialLessons.get(row.id);
    const learner = studentDbRowToLearner(row, {
      paymentStatus: enrollmentMeta.get(row.id)?.paymentStatus,
      trialScheduledAt: trial?.scheduled_at,
      trialLessonId: trial?.id,
      trialDurationMinutes: trial?.duration_minutes,
    });
    const email = emailMap.get(row.account_holder_id) ?? "";
    const student = buildStudentProfile(row, learner, email);
    const profile = profileMap.get(row.account_holder_id);
    const accountHolder = profile
      ? buildAccountHolder(profile, email, student.country)
      : undefined;

    return {
      student,
      learner,
      accountHolder,
      isActive: row.is_active,
    };
  });

  setStudentDirectoryCache(next);
}

export function getStudentDirectoryEntry(id: string): StudentDirectoryEntry | undefined {
  return getStudentDirectoryEntryById(id);
}

export function getAllStudentDirectoryEntries(): StudentDirectoryEntry[] {
  return getStudentDirectoryCache().map((entry) => ({
    ...entry,
    student: { ...entry.student },
    learner: { ...entry.learner },
    accountHolder: entry.accountHolder ? { ...entry.accountHolder } : undefined,
  }));
}
