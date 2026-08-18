import { createClient } from "@/lib/supabase/server";
import type {
  StudentEnrollmentMetaDbRow,
  TrialLessonDbRow,
} from "@/lib/students/db-types";
import type { PaymentStatus } from "@/types";

export async function fetchLatestEnrollmentMetaByStudent(studentIds: string[]) {
  const meta = new Map<string, { paymentStatus: PaymentStatus }>();
  if (studentIds.length === 0) return meta;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select("student_id, payment_status, created_at")
    .in("student_id", studentIds)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`enrollments_meta_fetch_failed: ${error.message}`);

  for (const row of (data ?? []) as StudentEnrollmentMetaDbRow[]) {
    if (!meta.has(row.student_id)) {
      meta.set(row.student_id, { paymentStatus: row.payment_status });
    }
  }
  return meta;
}

export async function fetchUpcomingTrialLessonsByStudent(studentIds: string[]) {
  const trials = new Map<string, TrialLessonDbRow>();
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

  if (error) throw new Error(`trial_lessons_fetch_failed: ${error.message}`);

  for (const row of (data ?? []) as TrialLessonDbRow[]) {
    if (!trials.has(row.student_id)) trials.set(row.student_id, row);
  }
  return trials;
}
