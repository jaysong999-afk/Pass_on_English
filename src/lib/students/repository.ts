import type {
  AccountHolder,
  AccountType,
  CefrLevel,
  CountryCode,
  CoursePurpose,
  Learner,
  PaymentStatus,
  Student,
} from "@/types";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store-sync";
import { createBootstrapDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStudentDirectoryCache,
  getStudentDirectoryEntryById,
  setStudentDirectoryCache,
  type StudentDirectoryEntry,
} from "@/lib/students/student-directory-cache";

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

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  account_type: AccountType | null;
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

function mapRowToLearner(
  row: StudentRow,
  meta?: {
    paymentStatus?: PaymentStatus;
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
    purposes: row.purposes?.length ? (row.purposes as CoursePurpose[]) : undefined,
    surveyNotes: row.onboarding_note ?? undefined,
    trialUsed: row.trial_used,
    trialScheduledAt: meta?.trialScheduledAt,
    trialLessonId: meta?.trialLessonId,
    trialDurationMinutes: meta?.trialDurationMinutes,
    paymentStatus: meta?.paymentStatus ?? "pending",
    createdAt: row.created_at,
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

async function fetchProfileMap(holderIds: string[]) {
  const map = new Map<string, ProfileRow>();
  if (holderIds.length === 0) return map;

  const supabase = await createClient();
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
  row: StudentRow,
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
    accountType: profile.account_type ?? "self",
    createdAt: profile.created_at,
  };
}

export async function warmStudentDirectoryCache(): Promise<void> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, account_holder_id, full_name, english_name, date_of_birth, country, english_level, purposes, onboarding_note, trial_used, is_active, created_at"
    )
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`students_directory_fetch_failed: ${error.message}`);
  }

  const rows = (data ?? []) as StudentRow[];
  const studentIds = rows.map((row) => row.id);
  const holderIds = [...new Set(rows.map((row) => row.account_holder_id))];

  const [enrollmentMeta, trialLessons, profileMap, emailMap] = await Promise.all([
    fetchEnrollmentMeta(studentIds),
    fetchTrialLessons(studentIds),
    fetchProfileMap(holderIds),
    fetchAccountEmails(holderIds),
  ]);

  const next: StudentDirectoryEntry[] = rows.map((row) => {
    const trial = trialLessons.get(row.id);
    const learner = mapRowToLearner(row, {
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
