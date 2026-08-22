import type {
  EnrollmentStatus,
  PaymentRecord,
  PaymentStatus,
  SessionAdjustment,
  StudentEnrollment,
} from "@/types";
import type { Locale } from "@/lib/i18n/config";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { formatPlanLabel } from "@/lib/pricing-plan-display";
import { getCachedPricingPlanById } from "@/lib/pricing-plan-cache";
import { getTeacherFromCache } from "@/lib/teachers/teacher-profile-cache";
import { getAccountSessionCache } from "@/lib/account-session-cache";
import { updateLearnerEnrollmentMeta } from "@/lib/account-store-sync";
import {
  computeContractEndDate,
  addDaysToDateKey,
  nextScheduledDateOnOrAfter,
} from "@/lib/contract-schedule";
import { createBootstrapDbClient, createRequestDbClient } from "@/lib/supabase/db-client";
import { createClient } from "@/lib/supabase/server";
import { recordEnrollmentPaymentFinanceTransactionInDb } from "@/lib/finance/repository";
import {
  fetchStudentCountryInDb,
  fetchStudentDisplayNameInDb,
} from "@/lib/accounts/repository";
import {
  getEnrollmentCache,
  getPaymentCache,
  patchEnrollmentInCache,
  pushPaymentToCache,
  setEnrollmentCache,
  setPaymentCache,
} from "@/lib/enrollments/enrollment-cache";
import {
  getAllEnrollments,
  getEnrollmentById,
  getEnrollmentsByStudent,
  getActiveEnrollmentsByTeacher,
  getPendingPaymentEnrollments,
  getPaymentRecordsByStudent,
  updateEnrollmentEndDate,
  updateEnrollmentTeacher,
  reassignEnrollmentsTeacher,
  resetEnrollments,
} from "@/lib/enrollment-store-sync";
import { scheduleLessonsForConfirmedEnrollmentInDb } from "@/lib/lessons/schedule-service";
import { listFuturePaidLessonsForEnrollmentInDb } from "@/lib/lessons/repository";
import {
  computeHoldDeadlineFrom,
  computePaymentDeadline,
  computePaymentDeadlineAfterTrial,
  studentFacingPaymentDeadlineAt,
} from "@/lib/enrollment-hold/constants";
import { getAllLessons } from "@/lib/teacher-lesson-store-sync";
import {
  getEnrollmentLastLessonEnd,
  getRenewalWindowState,
  hasUpcomingPaidLesson,
  isRenewableEnrollmentStatus,
  isRenewalSystemAutoOffer,
  listRenewalHoldsFor,
} from "@/lib/enrollments/renewal-window";
import {
  assertEnrollmentSlotAvailable,
  holdEnrollmentSlotsInDb,
  releaseEnrollmentSlotsInDb,
} from "@/lib/enrollment-hold/slot-hold";
import {
  attachLessonEnrollmentInDb,
  createTrialLessonInDb,
  findPendingTrialLessonInDb,
} from "@/lib/lessons/repository";
import { bookTrialForLearnerInDb } from "@/lib/accounts/repository";
import { reserveTeacherWeeklySlotsInDb, restoreOccupiedWeeklyAvailabilityInDb } from "@/lib/teacher-availability/repository";
import { nextPlanSlotOccurrenceIso } from "@/lib/teacher-availability";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";

interface EnrollmentRow {
  id: string;
  student_id: string;
  teacher_id: string;
  plan_id: string;
  status: EnrollmentStatus;
  payment_status: PaymentStatus;
  currency: string;
  total_amount: number;
  sessions_total: number;
  sessions_completed: number;
  sessions_remaining: number | null;
  curriculum: string | null;
  preferred_slot_time: string | null;
  preferred_slot_day: string | null;
  session_adjustments: SessionAdjustment[] | null;
  renewed_from_enrollment_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  confirmed_at?: string | null;
  payment_deadline_at?: string | null;
  cancel_reason?: string | null;
  is_trial?: boolean | null;
  teacher?:
    | { display_name: string | null }
    | Array<{ display_name: string | null }>
    | null;
}

interface PaymentRow {
  id: string;
  enrollment_id: string | null;
  student_id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  depositor_name: string | null;
  reported_at: string | null;
  confirmed_at: string | null;
  created_at: string;
}

const ENROLLMENT_SELECT = `
  id,
  student_id,
  teacher_id,
  plan_id,
  status,
  payment_status,
  currency,
  total_amount,
  sessions_total,
  sessions_completed,
  sessions_remaining,
  curriculum,
  preferred_slot_time,
  preferred_slot_day,
  session_adjustments,
  renewed_from_enrollment_id,
  started_at,
  ended_at,
  created_at,
  confirmed_at,
  payment_deadline_at,
  cancel_reason,
  is_trial,
  teacher:teachers!enrollments_teacher_id_fkey(display_name)
`;

function toDateKey(value: string | null | undefined): string {
  if (!value) return getDateKeyInTimezone(new Date(), CANONICAL_TIMEZONE);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return getDateKeyInTimezone(new Date(value), CANONICAL_TIMEZONE);
}

function normalizeSessionAdjustments(value: unknown): SessionAdjustment[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is SessionAdjustment => {
    if (!item || typeof item !== "object") return false;
    const adjustment = item as Partial<SessionAdjustment>;
    return (
      typeof adjustment.id === "string" &&
      typeof adjustment.at === "string" &&
      Number.isFinite(new Date(adjustment.at).getTime()) &&
      typeof adjustment.adminName === "string" &&
      typeof adjustment.deltaRemaining === "number" &&
      typeof adjustment.previousRemaining === "number" &&
      typeof adjustment.newRemaining === "number" &&
      typeof adjustment.previousTotal === "number" &&
      typeof adjustment.newTotal === "number"
    );
  });
}

function rowToEnrollment(row: EnrollmentRow, planLabel?: string): StudentEnrollment {
  const plan = getCachedPricingPlanById(row.plan_id);
  const teacher = getTeacherFromCache(row.teacher_id);
  const joinedTeacher = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher;
  return {
    id: row.id,
    studentId: row.student_id,
    teacherId: row.teacher_id,
    teacherName: joinedTeacher?.display_name?.trim() || teacher?.displayName || "Teacher",
    teacherAvatarUrl: teacher?.avatarUrl,
    planId: row.plan_id,
    planLabel: planLabel ?? (plan ? formatPlanLabel(plan, "ko") : row.plan_id),
    curriculum: row.curriculum?.trim() || "General English",
    sessionsTotal: row.sessions_total,
    sessionsRemaining: row.sessions_remaining ?? row.sessions_total - row.sessions_completed,
    startDate: toDateKey(row.started_at),
    endDate: toDateKey(row.ended_at),
    status: row.status,
    paymentStatus: row.payment_status,
    amountKrw: row.total_amount,
    preferredSlotTime: row.preferred_slot_time ?? undefined,
    preferredSlotDay: row.preferred_slot_day ?? undefined,
    scheduleDays: plan?.scheduleDays?.length ? [...plan.scheduleDays] : undefined,
    sessionMinutes: plan?.sessionMinutes,
    renewedFromEnrollmentId: row.renewed_from_enrollment_id ?? undefined,
    adjustments: normalizeSessionAdjustments(row.session_adjustments),
    confirmedAt: row.confirmed_at ?? undefined,
    paymentDeadlineAt: row.payment_deadline_at ?? undefined,
    cancelReason: row.cancel_reason ?? undefined,
    includesTrial: Boolean(row.is_trial),
  };
}

function rowToPayment(row: PaymentRow, label?: string): PaymentRecord {
  return {
    id: row.id,
    studentId: row.student_id,
    enrollmentId: row.enrollment_id ?? undefined,
    label: label ?? "Payment",
    amountKrw: row.amount,
    paidAt: toDateKey(row.reported_at ?? row.created_at),
    status: row.status,
    depositorName: row.depositor_name ?? undefined,
  };
}

function cloneEnrollment(enrollment: StudentEnrollment): StudentEnrollment {
  return {
    ...enrollment,
    adjustments: enrollment.adjustments ? [...enrollment.adjustments] : undefined,
  };
}

function clampSessions(total: number, remaining: number) {
  const safeTotal = Math.max(1, total);
  const safeRemaining = Math.min(Math.max(0, remaining), safeTotal);
  return { sessionsTotal: safeTotal, sessionsRemaining: safeRemaining };
}

async function fetchEnrollmentRows(): Promise<EnrollmentRow[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase.from("enrollments").select(ENROLLMENT_SELECT);
  if (error) {
    throw new Error(`enrollments_fetch_failed: ${error.message}`);
  }
  return (data ?? []) as EnrollmentRow[];
}

async function fetchPaymentRows(): Promise<PaymentRow[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase.from("payments").select("*");
  if (error) {
    throw new Error(`payments_fetch_failed: ${error.message}`);
  }
  return (data ?? []) as PaymentRow[];
}

export {
  getAllEnrollments,
  getEnrollmentById,
  getEnrollmentsByStudent,
  getActiveEnrollmentsByTeacher,
  getPendingPaymentEnrollments,
  getPaymentRecordsByStudent,
  updateEnrollmentEndDate,
  updateEnrollmentTeacher,
  reassignEnrollmentsTeacher,
  resetEnrollments,
};

export async function warmEnrollmentCache(): Promise<StudentEnrollment[]> {
  const [rows, payments] = await Promise.all([fetchEnrollmentRows(), fetchPaymentRows()]);
  const enrollments = rows.map((row) => rowToEnrollment(row));
  setEnrollmentCache(enrollments);

  const paymentRecords = payments.map((row) => {
    const enrollment = enrollments.find((e) => e.id === row.enrollment_id);
    const label = enrollment
      ? `${enrollment.planLabel} — ${enrollment.teacherName}`
      : "Payment";
    return rowToPayment(row, label);
  });
  setPaymentCache(paymentRecords);

  await dedupeAllRenewalHoldsInDb();
  await syncEnrollmentCompletionStatusInDb();

  return getEnrollmentCache();
}

export interface CreateEnrollmentInput {
  studentId: string;
  teacherId: string;
  teacherName: string;
  planId: string;
  curriculum?: string;
  amountKrw: number;
  locale?: Locale;
  preferredSlotTime?: string;
  preferredSlotDay?: string;
  studentName?: string;
  /** First-time learners: create the free trial lesson when they confirm the application. */
  bookTrial?: boolean;
}

function findActiveHoldEnrollment(studentId: string): StudentEnrollment | undefined {
  return getEnrollmentCache().find(
    (e) =>
      e.studentId === studentId &&
      e.status === "pending_payment" &&
      (e.paymentStatus === "pending" || e.paymentStatus === "reported")
  );
}

function renewalHoldPriority(
  hold: StudentEnrollment,
  lessons = getAllLessons(),
  enrollments = getEnrollmentCache()
): number {
  let score = 0;
  if (hold.paymentStatus === "reported") score += 100;
  if (!isRenewalSystemAutoOffer(hold, lessons, enrollments)) score += 50;
  if (hold.confirmedAt) score += new Date(hold.confirmedAt).getTime() / 1_000_000_000_000;
  return score;
}

function pickCanonicalRenewalHold(
  holds: StudentEnrollment[],
  lessons = getAllLessons(),
  enrollments = getEnrollmentCache()
): StudentEnrollment | undefined {
  if (holds.length === 0) return undefined;
  return [...holds].sort(
    (a, b) => renewalHoldPriority(b, lessons, enrollments) - renewalHoldPriority(a, lessons, enrollments)
  )[0];
}

async function fetchRenewalHoldsForParentInDb(
  fromEnrollmentId: string
): Promise<StudentEnrollment[]> {
  const supabase = createBootstrapDbClient();
  const { data, error } = await supabase
    .from("enrollments")
    .select(ENROLLMENT_SELECT)
    .eq("renewed_from_enrollment_id", fromEnrollmentId)
    .eq("status", "pending_payment")
    .in("payment_status", ["pending", "reported"]);

  if (error) throw new Error(`renewal_hold_fetch_failed: ${error.message}`);

  const holds: StudentEnrollment[] = [];
  for (const row of (data ?? []) as EnrollmentRow[]) {
    const enrollment = rowToEnrollment(row);
    patchEnrollmentInCache(enrollment);
    holds.push(enrollment);
  }
  return holds;
}

/** Keep one pending renewal hold per parent enrollment; cancel duplicate rows. */
export async function dedupeRenewalHoldsForParentInDb(
  fromEnrollmentId: string
): Promise<StudentEnrollment | null> {
  const holds = await fetchRenewalHoldsForParentInDb(fromEnrollmentId);
  if (holds.length <= 1) return holds[0] ?? null;

  const canonical = pickCanonicalRenewalHold(holds);
  if (!canonical) return null;

  for (const duplicate of holds) {
    if (duplicate.id === canonical.id) continue;
    await cancelEnrollmentHoldInDb(duplicate.id, "duplicate_renewal_hold");
  }

  return getEnrollmentById(canonical.id) ?? canonical;
}

export async function dedupeAllRenewalHoldsInDb(): Promise<number> {
  const parentIds = new Set<string>();
  for (const enrollment of getEnrollmentCache()) {
    if (enrollment.renewedFromEnrollmentId && enrollment.status === "pending_payment") {
      parentIds.add(enrollment.renewedFromEnrollmentId);
    }
  }

  let deduped = 0;
  for (const parentId of parentIds) {
    const before = listRenewalHoldsFor(parentId, getEnrollmentCache()).length;
    await dedupeRenewalHoldsForParentInDb(parentId);
    const after = listRenewalHoldsFor(parentId, getEnrollmentCache()).length;
    if (before > after) deduped += before - after;
  }
  return deduped;
}

async function resolveRenewalHoldForParentInDb(
  previous: StudentEnrollment,
  source: "student" | "system",
  now: Date
): Promise<StudentEnrollment | null> {
  const holds = await fetchRenewalHoldsForParentInDb(previous.id);
  if (holds.length === 0) return null;

  const canonical = (await dedupeRenewalHoldsForParentInDb(previous.id)) ?? pickCanonicalRenewalHold(holds);
  if (!canonical) return null;

  if (source === "student") {
    return markRenewalStudentAppliedInDb(canonical.id, now);
  }
  return getEnrollmentById(canonical.id) ?? canonical;
}

export async function confirmNewEnrollmentInDb(
  input: CreateEnrollmentInput
): Promise<StudentEnrollment> {
  const existingHold = findActiveHoldEnrollment(input.studentId);
  if (existingHold) return cloneEnrollment(existingHold);

  const plan = getCachedPricingPlanById(input.planId);
  if (!plan) throw new Error("plan_not_found");

  let pendingTrial = await findPendingTrialLessonInDb(input.studentId);
  const trialOwnsSlot = pendingTrial && pendingTrial.teacherId === input.teacherId;

  assertEnrollmentSlotAvailable(
    {
      teacherId: input.teacherId,
      planId: input.planId,
      preferredSlotTime: input.preferredSlotTime,
    },
    trialOwnsSlot
      ? { studentId: input.studentId, studentName: input.studentName }
      : undefined
  );

  if (!pendingTrial && input.bookTrial) {
    const slotTime = (input.preferredSlotTime ?? "10:00") as SlotStartTime;
    const durationMinutes =
      plan.sessionMinutes && plan.sessionMinutes > 0 ? plan.sessionMinutes : 20;
    const scheduleDays = (plan.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
    const scheduledAt = nextPlanSlotOccurrenceIso(scheduleDays, slotTime);
    pendingTrial = await createTrialLessonInDb({
      teacherId: input.teacherId,
      teacherName: input.teacherName,
      studentId: input.studentId,
      studentName: input.studentName ?? "Student",
      scheduledAt,
      durationMinutes,
    });
    if (scheduleDays.length > 0) {
      await reserveTeacherWeeklySlotsInDb(input.teacherId, {
        planDays: scheduleDays,
        startTime: slotTime,
        sessionMinutes: durationMinutes,
        studentName: input.studentName,
        studentId: input.studentId,
      });
    }
    await bookTrialForLearnerInDb(input.studentId, {
      scheduledAt,
      trialLessonId: pendingTrial.id,
      durationMinutes,
    });
  }

  const includesTrial = Boolean(pendingTrial);

  const now = new Date();
  const deadline = pendingTrial
    ? computePaymentDeadlineAfterTrial(
        pendingTrial.scheduledAt,
        pendingTrial.durationMinutes
      )
    : computePaymentDeadline(now);
  const startDate = pendingTrial
    ? addDaysToDateKey(
        getDateKeyInTimezone(new Date(pendingTrial.scheduledAt), CANONICAL_TIMEZONE),
        1
      )
    : getDateKeyInTimezone(now, CANONICAL_TIMEZONE);
  const scheduleDays = (plan.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
  const endDate = computeContractEndDate(startDate, plan.sessionsCount, scheduleDays);
  const planLabel = formatPlanLabel(plan, input.locale ?? "ko");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .insert({
      student_id: input.studentId,
      teacher_id: input.teacherId,
      plan_id: input.planId,
      status: "pending_payment",
      payment_status: "pending",
      currency: "KRW",
      total_amount: input.amountKrw,
      sessions_total: plan.sessionsCount,
      sessions_remaining: plan.sessionsCount,
      is_trial: includesTrial,
      curriculum: input.curriculum?.trim() || "General English",
      preferred_slot_time: input.preferredSlotTime ?? "10:00",
      preferred_slot_day: input.preferredSlotDay ?? null,
      session_adjustments: [],
      started_at: `${startDate}T00:00:00+09:00`,
      ended_at: `${endDate}T23:59:59+09:00`,
      confirmed_at: now.toISOString(),
      payment_deadline_at: deadline.toISOString(),
    })
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_create_failed: ${error.message}`);

  const enrollment = rowToEnrollment(
    { ...(data as unknown as EnrollmentRow), teacher: { display_name: input.teacherName } },
    planLabel
  );

  if (pendingTrial) {
    await attachLessonEnrollmentInDb(pendingTrial.id, enrollment.id);
  }

  try {
    await holdEnrollmentSlotsInDb(enrollment, input.studentName);
  } catch (holdError) {
    await supabase
      .from("enrollments")
      .update({
        status: "cancelled",
        cancel_reason: "slot_hold_failed",
      })
      .eq("id", enrollment.id);
    throw holdError;
  }

  patchEnrollmentInCache(enrollment);

  const session = getAccountSessionCache();
  if (session?.activeLearnerId === input.studentId) {
    updateLearnerEnrollmentMeta(input.studentId, {
      paymentStatus: "pending",
      planLabel,
      teacherName: input.teacherName,
    });
  }

  return cloneEnrollment(enrollment);
}

/** @deprecated Use confirmNewEnrollmentInDb + reportEnrollmentPaymentInDb */
export async function createEnrollmentInDb(input: CreateEnrollmentInput & { depositorName: string }): Promise<StudentEnrollment> {
  void input.depositorName;
  throw new Error("deprecated: use confirmNewEnrollmentInDb and reportEnrollmentPaymentInDb");
}

export function createEnrollment(input: CreateEnrollmentInput): StudentEnrollment {
  void input;
  throw new Error("deprecated: use createEnrollmentInDb");
}

export interface CreateRenewalEnrollmentInput {
  fromEnrollmentId: string;
  amountKrw: number;
  locale?: Locale;
  studentName?: string;
}

export async function confirmRenewalEnrollmentInDb(
  input: CreateRenewalEnrollmentInput,
  options?: { source?: "student" | "system"; now?: Date }
): Promise<StudentEnrollment> {
  const previous = getEnrollmentById(input.fromEnrollmentId);
  if (!previous) throw new Error("enrollment_not_found");
  if (!isRenewableEnrollmentStatus(previous.status)) {
    throw new Error("not_renewable");
  }

  const now = options?.now ?? new Date();
  const source = options?.source ?? "student";

  const resolved = await resolveRenewalHoldForParentInDb(previous, source, now);
  if (resolved) return cloneEnrollment(resolved);

  const existingHold = findActiveHoldEnrollment(previous.studentId);
  if (existingHold) return cloneEnrollment(existingHold);

  const lastLessonEnd = getEnrollmentLastLessonEnd(previous, getAllLessons());
  const window = getRenewalWindowState(previous, getAllLessons(), now);
  if (!lastLessonEnd) throw new Error("renewal_window_not_open");

  if (source === "system") {
    if (hasUpcomingPaidLesson(previous, getAllLessons(), now) || lastLessonEnd.getTime() > now.getTime()) {
      throw new Error("renewal_window_not_open");
    }
    if (!window.canAdminActivate) {
      throw new Error(
        window.status === "not_open" || window.status === "ineligible"
          ? "renewal_window_not_open"
          : "renewal_window_closed"
      );
    }
    await markEnrollmentCompletedIfCourseEnded(previous);
  } else if (!window.canStudentApply) {
    throw new Error(
      window.status === "not_open" || window.status === "ineligible"
        ? "renewal_window_not_open"
        : "renewal_window_closed"
    );
  }

  const plan = getCachedPricingPlanById(previous.planId);
  if (!plan) throw new Error("plan_not_found");

  assertEnrollmentSlotAvailable(
    {
      teacherId: previous.teacherId,
      planId: previous.planId,
      preferredSlotTime: previous.preferredSlotTime,
    },
    { studentId: previous.studentId, studentName: input.studentName }
  );

  const holdStart = lastLessonEnd;
  const deadline = computeHoldDeadlineFrom(holdStart);
  const todayKey = getDateKeyInTimezone(now, CANONICAL_TIMEZONE);
  const scheduleDays = (plan.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
  const lastLessonDateKey = getDateKeyInTimezone(lastLessonEnd, CANONICAL_TIMEZONE);
  const previousCourseEnd =
    previous.endDate > lastLessonDateKey ? previous.endDate : lastLessonDateKey;
  const earliestContinuationDate =
    previousCourseEnd >= todayKey ? addDaysToDateKey(previousCourseEnd, 1) : todayKey;
  const startDate = nextScheduledDateOnOrAfter(earliestContinuationDate, scheduleDays);
  const endDate = computeContractEndDate(startDate, plan.sessionsCount, scheduleDays);
  const planLabel = formatPlanLabel(plan, input.locale ?? "ko");

  const supabase =
    source === "system" ? createBootstrapDbClient() : await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .insert({
      student_id: previous.studentId,
      teacher_id: previous.teacherId,
      plan_id: previous.planId,
      status: "pending_payment",
      payment_status: "pending",
      currency: "KRW",
      total_amount: input.amountKrw,
      sessions_total: plan.sessionsCount,
      sessions_remaining: plan.sessionsCount,
      curriculum: previous.curriculum,
      preferred_slot_time: previous.preferredSlotTime ?? "10:00",
      preferred_slot_day: previous.preferredSlotDay ?? null,
      session_adjustments: [],
      renewed_from_enrollment_id: previous.id,
      started_at: `${startDate}T00:00:00+09:00`,
      ended_at: `${endDate}T23:59:59+09:00`,
      confirmed_at: (source === "system" ? holdStart : now).toISOString(),
      payment_deadline_at: deadline.toISOString(),
    })
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_renew_failed: ${error.message}`);

  const enrollment = rowToEnrollment(
    { ...(data as unknown as EnrollmentRow), teacher: { display_name: previous.teacherName } },
    planLabel
  );

  try {
    await holdEnrollmentSlotsInDb(enrollment, input.studentName);
  } catch (holdError) {
    await supabase
      .from("enrollments")
      .update({
        status: "cancelled",
        cancel_reason: "slot_hold_failed",
      })
      .eq("id", enrollment.id);
    throw holdError;
  }

  patchEnrollmentInCache(enrollment);

  const session = getAccountSessionCache();
  if (session?.activeLearnerId === previous.studentId) {
    updateLearnerEnrollmentMeta(previous.studentId, {
      paymentStatus: "pending",
      planLabel,
      teacherName: previous.teacherName,
    });
  }

  const deduped = await dedupeRenewalHoldsForParentInDb(previous.id);
  return cloneEnrollment(deduped ?? enrollment);
}

/** @deprecated Use confirmRenewalEnrollmentInDb + reportEnrollmentPaymentInDb */
export async function createRenewalEnrollmentInDb(
  input: CreateRenewalEnrollmentInput & { depositorName: string }
): Promise<StudentEnrollment> {
  void input.depositorName;
  throw new Error("deprecated: use confirmRenewalEnrollmentInDb and reportEnrollmentPaymentInDb");
}

export function createRenewalEnrollment(input: CreateRenewalEnrollmentInput & { depositorName: string }): StudentEnrollment {
  void input;
  throw new Error("deprecated: use confirmRenewalEnrollmentInDb");
}

export async function reportEnrollmentPaymentInDb(
  enrollmentId: string,
  depositorName: string
): Promise<StudentEnrollment> {
  const current = getEnrollmentById(enrollmentId);
  if (!current) throw new Error("enrollment_not_found");
  if (current.status !== "pending_payment") throw new Error("not_pending");
  if (current.paymentStatus === "confirmed") return cloneEnrollment(current);
  if (current.paymentStatus === "reported") return cloneEnrollment(current);

  const now = new Date();
  const studentDeadlineAt = studentFacingPaymentDeadlineAt(current);
  if (studentDeadlineAt && new Date(studentDeadlineAt) <= now) {
    throw new Error("payment_deadline_passed");
  }
  if (
    current.renewedFromEnrollmentId &&
    !getRenewalWindowState(current, getAllLessons(), now).canStudentReportPayment
  ) {
    throw new Error("payment_deadline_passed");
  }

  if (
    current.renewedFromEnrollmentId &&
    isRenewalSystemAutoOffer(current, getAllLessons(), getEnrollmentCache())
  ) {
    await markRenewalStudentAppliedInDb(enrollmentId, now);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({ payment_status: "reported" })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_report_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);

  const existingPayment = getPaymentCache().find((p) => p.enrollmentId === enrollmentId);
  if (existingPayment) {
    await supabase
      .from("payments")
      .update({
        status: "reported",
        depositor_name: depositorName,
        reported_at: now.toISOString(),
      })
      .eq("enrollment_id", enrollmentId);
    setPaymentCache(
      getPaymentCache().map((p) =>
        p.enrollmentId === enrollmentId
          ? { ...p, status: "reported", depositorName, paidAt: now.toISOString().slice(0, 10) }
          : p
      )
    );
  } else {
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        enrollment_id: enrollmentId,
        student_id: current.studentId,
        amount: current.amountKrw,
        currency: "KRW",
        status: "reported",
        depositor_name: depositorName,
        reported_at: now.toISOString(),
      })
      .select("*")
      .single();

    if (paymentError) throw new Error(`payment_create_failed: ${paymentError.message}`);

    pushPaymentToCache(
      rowToPayment(
        payment as PaymentRow,
        `${current.planLabel} — ${current.teacherName}`
      )
    );
  }

  const session = getAccountSessionCache();
  if (session?.activeLearnerId === current.studentId) {
    updateLearnerEnrollmentMeta(current.studentId, {
      paymentStatus: "reported",
      planLabel: current.planLabel,
      teacherName: current.teacherName,
    });
  }

  return cloneEnrollment(enrollment);
}

export async function cancelEnrollmentHoldInDb(
  enrollmentId: string,
  reason = "student_cancelled"
): Promise<StudentEnrollment | null> {
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;
  if (current.status !== "pending_payment") return null;
  if (current.paymentStatus !== "pending") {
    throw new Error("cannot_cancel_after_payment_report");
  }

  await releaseEnrollmentSlotsInDb(current);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({
      status: "cancelled",
      cancel_reason: reason,
    })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_cancel_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);

  const session = getAccountSessionCache();
  if (session?.activeLearnerId === current.studentId) {
    updateLearnerEnrollmentMeta(current.studentId, { paymentStatus: "rejected" });
  }

  return cloneEnrollment(enrollment);
}

export async function expireEnrollmentHoldsInDb(now = new Date()): Promise<number> {
  const due = getEnrollmentCache().filter(
    (e) =>
      e.status === "pending_payment" &&
      (e.paymentStatus === "pending" || e.paymentStatus === "reported") &&
      e.paymentDeadlineAt &&
      new Date(e.paymentDeadlineAt) <= now
  );

  let count = 0;
  for (const enrollment of due) {
    try {
      await releaseEnrollmentSlotsInDb(enrollment);
      const supabase = createBootstrapDbClient();
      const { error } = await supabase
        .from("enrollments")
        .update({
          status: "cancelled",
          payment_status: "rejected",
          cancel_reason: "payment_timeout",
        })
        .eq("id", enrollment.id);

      if (error) {
        console.error("[expireEnrollmentHoldsInDb]", enrollment.id, error.message);
        continue;
      }

      patchEnrollmentInCache({
        ...enrollment,
        status: "cancelled",
        paymentStatus: "rejected",
        cancelReason: "payment_timeout",
      });

      await supabase
        .from("payments")
        .update({ status: "rejected" })
        .eq("enrollment_id", enrollment.id);

      count += 1;
    } catch (error) {
      console.error("[expireEnrollmentHoldsInDb]", enrollment.id, error);
    }
  }

  return count;
}

async function markRenewalStudentAppliedInDb(
  enrollmentId: string,
  confirmedAt: Date
): Promise<StudentEnrollment> {
  const current = getEnrollmentById(enrollmentId);
  if (!current) throw new Error("enrollment_not_found");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({ confirmed_at: confirmedAt.toISOString() })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_renew_apply_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);
  return enrollment;
}

async function markEnrollmentCompletedIfCourseEnded(
  enrollment: StudentEnrollment
): Promise<void> {
  if (enrollment.status === "completed") return;
  const supabase = createBootstrapDbClient();
  const { error } = await supabase
    .from("enrollments")
    .update({
      status: "completed",
      sessions_remaining: 0,
    })
    .eq("id", enrollment.id);
  if (error) {
    console.error("[markEnrollmentCompletedIfCourseEnded]", enrollment.id, error.message);
    return;
  }
  patchEnrollmentInCache({
    ...enrollment,
    status: "completed",
    sessionsRemaining: 0,
  });
}

/** Mark active courses completed once sessions are used up and no future lessons remain. */
export async function syncEnrollmentCompletionStatusInDb(
  now = new Date()
): Promise<number> {
  const todayKey = getDateKeyInTimezone(now, CANONICAL_TIMEZONE);
  let completed = 0;

  for (const enrollment of getEnrollmentCache()) {
    if (enrollment.status !== "active" && enrollment.status !== "expiring_soon") continue;

    const future = await listFuturePaidLessonsForEnrollmentInDb(
      enrollment.id,
      enrollment.studentId,
      enrollment.teacherId
    );
    if (future.length > 0) continue;

    const periodEnded = enrollment.endDate < todayKey;
    const noSessionsLeft = enrollment.sessionsRemaining <= 0;
    if (!periodEnded && !noSessionsLeft) continue;

    await markEnrollmentCompletedIfCourseEnded(enrollment);
    completed += 1;
  }

  return completed;
}

/** Open 15h slot holds for enrollments whose last lesson has ended, even if the student has not clicked 재수강. */
export async function ensureRenewalOffersInDb(now = new Date()): Promise<number> {
  let opened = 0;
  for (const enrollment of getEnrollmentCache()) {
    if (!isRenewableEnrollmentStatus(enrollment.status)) continue;
    if (
      getEnrollmentCache().some(
        (row) =>
          row.renewedFromEnrollmentId === enrollment.id &&
          (row.status === "active" || row.status === "expiring_soon")
      )
    ) {
      continue;
    }

    const lessons = getAllLessons();
    if (hasUpcomingPaidLesson(enrollment, lessons, now)) continue;

    const window = getRenewalWindowState(enrollment, lessons, now);
    const existingHold = await dedupeRenewalHoldsForParentInDb(enrollment.id);
    if (existingHold) {
      if (window.canAdminActivate) {
        await markEnrollmentCompletedIfCourseEnded(enrollment);
      }
      continue;
    }
    if (findActiveHoldEnrollment(enrollment.studentId)) continue;
    if (!window.canAdminActivate) continue;

    try {
      const studentName = await fetchStudentDisplayNameInDb(
        enrollment.studentId,
        enrollment.planLabel
      );
      await confirmRenewalEnrollmentInDb(
        {
          fromEnrollmentId: enrollment.id,
          amountKrw: enrollment.amountKrw,
          locale: "ko",
          studentName,
        },
        { source: "system", now }
      );
      opened += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message === "renewal_window_not_open" ||
        message === "renewal_window_closed" ||
        message === "slot_no_longer_available" ||
        message === "not_renewable"
      ) {
        continue;
      }
      console.error("[ensureRenewalOffersInDb]", enrollment.id, error);
    }
  }
  return opened;
}

export async function confirmEnrollmentPaymentInDb(
  enrollmentId: string,
  adminName = "관리자"
): Promise<StudentEnrollment | null> {
  void adminName;
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;
  if (current.cancelReason === "merged_into_original") {
    return (
      (current.renewedFromEnrollmentId
        ? getEnrollmentById(current.renewedFromEnrollmentId)
        : null) ?? current
    );
  }
  if (current.paymentStatus === "confirmed") {
    await scheduleLessonsForConfirmedEnrollmentInDb(enrollmentId);
    await restoreOccupiedWeeklyAvailabilityInDb(current.teacherId);
    return getEnrollmentById(enrollmentId) ?? current;
  }
  if (current.status !== "pending_payment") return null;
  if (current.paymentDeadlineAt && new Date(current.paymentDeadlineAt) <= new Date()) {
    throw new Error("hold_expired");
  }

  const supabase = await createRequestDbClient();

  async function persistConfirmedPayment() {
    const existingPayment = getPaymentCache().find((p) => p.enrollmentId === enrollmentId);
    const confirmedAt = new Date().toISOString();
    if (existingPayment) {
      await supabase
        .from("payments")
        .update({
          status: "confirmed",
          confirmed_at: confirmedAt,
        })
        .eq("enrollment_id", enrollmentId);
      setPaymentCache(
        getPaymentCache().map((p) =>
          p.enrollmentId === enrollmentId ? { ...p, status: "confirmed" } : p
        )
      );
    } else {
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .insert({
          enrollment_id: enrollmentId,
          student_id: current!.studentId,
          amount: current!.amountKrw,
          currency: "KRW",
          status: "confirmed",
          confirmed_at: confirmedAt,
        })
        .select("*")
        .single();

      if (paymentError) throw new Error(`payment_create_failed: ${paymentError.message}`);

      pushPaymentToCache(
        rowToPayment(payment as PaymentRow, `${current!.planLabel} — ${current!.teacherName}`)
      );
    }

    const session = getAccountSessionCache();
    if (session?.activeLearnerId === current!.studentId) {
      updateLearnerEnrollmentMeta(current!.studentId, {
        paymentStatus: "confirmed",
        planLabel: current!.planLabel,
        teacherName: current!.teacherName,
      });
    }
  }

  const { data, error } = await supabase
    .from("enrollments")
    .update({
      status: "active",
      payment_status: "confirmed",
    })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_confirm_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);
  await persistConfirmedPayment();

  await scheduleLessonsForConfirmedEnrollmentInDb(enrollmentId);
  await restoreOccupiedWeeklyAvailabilityInDb(current.teacherId);

  const confirmedEnrollment = getEnrollmentById(enrollmentId) ?? enrollment;
  const studentName = await fetchStudentDisplayNameInDb(
    current.studentId,
    current.planLabel
  );
  const country = (await fetchStudentCountryInDb(current.studentId)) ?? "KR";
  await recordEnrollmentPaymentFinanceTransactionInDb(
    confirmedEnrollment,
    studentName,
    country
  );

  return confirmedEnrollment;
}

export function confirmEnrollmentPayment(
  enrollmentId: string,
  adminName = "관리자"
): StudentEnrollment | null {
  void enrollmentId;
  void adminName;
  throw new Error("deprecated: use confirmEnrollmentPaymentInDb");
}

export async function rejectEnrollmentPaymentInDb(
  enrollmentId: string,
  adminName = "관리자"
): Promise<StudentEnrollment | null> {
  void adminName;
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;

  await releaseEnrollmentSlotsInDb(current);

  const supabase = await createRequestDbClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({
      status: "cancelled",
      payment_status: "rejected",
      cancel_reason: "admin_rejected",
    })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_reject_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);

  await supabase.from("payments").update({ status: "rejected" }).eq("enrollment_id", enrollmentId);

  setPaymentCache(
    getPaymentCache().map((p) =>
      p.enrollmentId === enrollmentId ? { ...p, status: "rejected" } : p
    )
  );

  const session = getAccountSessionCache();
  if (session?.activeLearnerId === current.studentId) {
    updateLearnerEnrollmentMeta(current.studentId, { paymentStatus: "rejected" });
  }

  return cloneEnrollment(enrollment);
}

export function rejectEnrollmentPayment(
  enrollmentId: string,
  adminName = "관리자"
): StudentEnrollment | null {
  void enrollmentId;
  void adminName;
  throw new Error("deprecated: use rejectEnrollmentPaymentInDb");
}

export interface AdjustSessionsInput {
  sessionsRemaining?: number;
  sessionsTotal?: number;
  deltaRemaining?: number;
  deltaTotal?: number;
  reason?: string;
  adminName?: string;
}

export async function adjustEnrollmentSessionsInDb(
  enrollmentId: string,
  input: AdjustSessionsInput
): Promise<StudentEnrollment | null> {
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;

  let nextTotal = input.sessionsTotal ?? current.sessionsTotal;
  let nextRemaining = input.sessionsRemaining ?? current.sessionsRemaining;

  if (input.deltaTotal !== undefined) nextTotal = current.sessionsTotal + input.deltaTotal;
  if (input.deltaRemaining !== undefined) {
    nextRemaining = current.sessionsRemaining + input.deltaRemaining;
  }

  const clamped = clampSessions(nextTotal, nextRemaining);
  const deltaRemaining = clamped.sessionsRemaining - current.sessionsRemaining;

  if (
    clamped.sessionsTotal === current.sessionsTotal &&
    clamped.sessionsRemaining === current.sessionsRemaining
  ) {
    return cloneEnrollment(current);
  }

  const adjustment: SessionAdjustment = {
    id: `adj-${Date.now()}`,
    at: new Date().toISOString(),
    adminName: input.adminName ?? "관리자",
    deltaRemaining,
    previousRemaining: current.sessionsRemaining,
    newRemaining: clamped.sessionsRemaining,
    previousTotal: current.sessionsTotal,
    newTotal: clamped.sessionsTotal,
    reason: input.reason?.trim() || undefined,
  };

  const adjustments = [adjustment, ...(current.adjustments ?? [])].slice(0, 20);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({
      sessions_total: clamped.sessionsTotal,
      sessions_remaining: clamped.sessionsRemaining,
      session_adjustments: adjustments,
    })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_adjust_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);
  return cloneEnrollment(enrollment);
}

export function adjustEnrollmentSessions(
  enrollmentId: string,
  input: AdjustSessionsInput
): StudentEnrollment | null {
  void enrollmentId;
  void input;
  throw new Error("deprecated: use adjustEnrollmentSessionsInDb");
}

export async function updateEnrollmentEndDateInDb(
  enrollmentId: string,
  endDate: string
): Promise<StudentEnrollment | null> {
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("enrollments")
    .update({ ended_at: `${endDate}T23:59:59+09:00` })
    .eq("id", enrollmentId)
    .select(ENROLLMENT_SELECT)
    .single();

  if (error) throw new Error(`enrollment_end_date_failed: ${error.message}`);

  const enrollment = rowToEnrollment(data as unknown as EnrollmentRow, current.planLabel);
  patchEnrollmentInCache(enrollment);
  return cloneEnrollment(enrollment);
}
