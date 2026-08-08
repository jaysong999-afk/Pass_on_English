import type { PaymentRecord, StudentEnrollment } from "@/types";
import {
  formatPlanLabel,
  getPricingPlanById,
} from "@/lib/pricing-plan-store";
import type { Locale } from "@/lib/i18n/config";
import { getActiveLearner, updateLearnerEnrollmentMeta } from "@/lib/account-store";
import { computeContractEndDate, addDaysToDateKey } from "@/lib/contract-schedule";
import type { DayLabel } from "@/lib/availability/types";

const SEED: StudentEnrollment[] = [
  {
    id: "enroll-1-prev",
    studentId: "student-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    planId: "plan-1",
    planLabel: "주5회(월~금) 20분 (20회)",
    curriculum: "일상회화",
    sessionsTotal: 20,
    sessionsRemaining: 0,
    startDate: "2026-06-01",
    endDate: "2026-06-30",
    status: "completed",
    paymentStatus: "confirmed",
    amountKrw: 87000,
    adjustments: [],
  },
  {
    id: "enroll-1",
    studentId: "student-1",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    planId: "plan-1",
    planLabel: "주5회(월~금) 20분 (20회)",
    curriculum: "일상회화",
    sessionsTotal: 20,
    sessionsRemaining: 3,
    startDate: "2026-07-01",
    endDate: "2026-08-28",
    status: "expiring_soon",
    paymentStatus: "confirmed",
    amountKrw: 87000,
    preferredSlotTime: "10:00",
    preferredSlotDay: "Mon",
    adjustments: [],
  },
  {
    id: "enroll-2",
    studentId: "student-2",
    teacherId: "teacher-2",
    teacherName: "James Rivera",
    planId: "plan-2",
    planLabel: "월·수·금 20분 (12회)",
    curriculum: "비즈니스 영어",
    sessionsTotal: 12,
    sessionsRemaining: 1,
    startDate: "2026-07-07",
    endDate: "2026-07-28",
    status: "active",
    paymentStatus: "confirmed",
    amountKrw: 90000,
    preferredSlotTime: "09:00",
    preferredSlotDay: "Mon",
    adjustments: [],
  },
  {
    id: "enroll-pending-1",
    studentId: "student-4",
    teacherId: "teacher-1",
    teacherName: "Sarah Mitchell",
    planId: "plan-1",
    planLabel: "주5회(월~금) 20분 (20회)",
    curriculum: "파닉스",
    sessionsTotal: 20,
    sessionsRemaining: 20,
    startDate: "2026-08-01",
    endDate: "2026-08-28",
    status: "pending_payment",
    paymentStatus: "reported",
    amountKrw: 87000,
    preferredSlotTime: "10:00",
    preferredSlotDay: "Mon",
    adjustments: [],
  },
];

let enrollments: StudentEnrollment[] = structuredClone(SEED);

const paymentRecords: PaymentRecord[] = [];

function clampSessions(total: number, remaining: number) {
  const safeTotal = Math.max(1, total);
  const safeRemaining = Math.min(Math.max(0, remaining), safeTotal);
  return { sessionsTotal: safeTotal, sessionsRemaining: safeRemaining };
}


function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getAllEnrollments() {
  return enrollments.map((e) => ({ ...e, adjustments: [...(e.adjustments ?? [])] }));
}

export function getEnrollmentById(id: string) {
  const e = enrollments.find((x) => x.id === id);
  return e ? { ...e, adjustments: [...(e.adjustments ?? [])] } : undefined;
}

export function getEnrollmentsByStudent(studentId: string) {
  return getAllEnrollments().filter((e) => e.studentId === studentId);
}

export function getActiveEnrollmentsByTeacher(teacherId: string) {
  return getAllEnrollments().filter(
    (e) =>
      e.teacherId === teacherId &&
      (e.status === "active" || e.status === "expiring_soon") &&
      e.sessionsRemaining > 0
  );
}

export function getPendingPaymentEnrollments() {
  return getAllEnrollments().filter(
    (e) => e.status === "pending_payment" && e.paymentStatus === "reported"
  );
}

export interface CreateEnrollmentInput {
  studentId: string;
  teacherId: string;
  teacherName: string;
  planId: string;
  curriculum?: string;
  depositorName: string;
  amountKrw: number;
  locale?: Locale;
  preferredSlotTime?: string;
  preferredSlotDay?: string;
}

export function createEnrollment(input: CreateEnrollmentInput): StudentEnrollment {
  const plan = getPricingPlanById(input.planId);
  if (!plan) {
    throw new Error("plan_not_found");
  }

  const existingPending = enrollments.find(
    (e) =>
      e.studentId === input.studentId &&
      e.status === "pending_payment" &&
      e.paymentStatus === "reported"
  );
  if (existingPending) {
    return { ...existingPending, adjustments: [...(existingPending.adjustments ?? [])] };
  }

  const now = new Date();
  const startDate = toDateKey(now);
  const scheduleDays = (plan.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
  const endDate = computeContractEndDate(startDate, plan.sessionsCount, scheduleDays);

  const enrollment: StudentEnrollment = {
    id: `enroll-${Date.now()}`,
    studentId: input.studentId,
    teacherId: input.teacherId,
    teacherName: input.teacherName,
    planId: input.planId,
    planLabel: formatPlanLabel(plan, input.locale ?? "ko"),
    curriculum: input.curriculum?.trim() || "General English",
    sessionsTotal: plan.sessionsCount,
    sessionsRemaining: plan.sessionsCount,
    startDate,
    endDate,
    status: "pending_payment",
    paymentStatus: "reported",
    amountKrw: input.amountKrw,
    preferredSlotTime: input.preferredSlotTime ?? "10:00",
    preferredSlotDay: input.preferredSlotDay,
    adjustments: [],
  };

  enrollments.push(enrollment);

  paymentRecords.push({
    id: `pay-${Date.now()}`,
    studentId: input.studentId,
    enrollmentId: enrollment.id,
    label: `${enrollment.planLabel} — ${input.teacherName}`,
    amountKrw: input.amountKrw,
    paidAt: startDate,
    status: "reported",
    depositorName: input.depositorName,
  });

  if (getActiveLearner().id === input.studentId) {
    updateLearnerEnrollmentMeta(input.studentId, {
      paymentStatus: "reported",
      planLabel: enrollment.planLabel,
      teacherName: input.teacherName,
    });
  }

  return { ...enrollment, adjustments: [] };
}

export interface CreateRenewalEnrollmentInput {
  fromEnrollmentId: string;
  depositorName: string;
  amountKrw: number;
  locale?: Locale;
}

export function createRenewalEnrollment(input: CreateRenewalEnrollmentInput): StudentEnrollment {
  const previous = getEnrollmentById(input.fromEnrollmentId);
  if (!previous) {
    throw new Error("enrollment_not_found");
  }

  if (!["active", "expiring_soon", "completed"].includes(previous.status)) {
    throw new Error("not_renewable");
  }

  const plan = getPricingPlanById(previous.planId);
  if (!plan) {
    throw new Error("plan_not_found");
  }

  const existingPending = enrollments.find(
    (e) =>
      e.studentId === previous.studentId &&
      e.status === "pending_payment" &&
      e.paymentStatus === "reported"
  );
  if (existingPending) {
    return { ...existingPending, adjustments: [...(existingPending.adjustments ?? [])] };
  }

  const todayKey = toDateKey(new Date());
  const startDate =
    previous.endDate >= todayKey
      ? addDaysToDateKey(previous.endDate, 1)
      : todayKey;
  const scheduleDays = (plan.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
  const endDate = computeContractEndDate(startDate, plan.sessionsCount, scheduleDays);

  const enrollment: StudentEnrollment = {
    id: `enroll-${Date.now()}`,
    studentId: previous.studentId,
    teacherId: previous.teacherId,
    teacherName: previous.teacherName,
    planId: previous.planId,
    planLabel: formatPlanLabel(plan, input.locale ?? "ko"),
    curriculum: previous.curriculum,
    sessionsTotal: plan.sessionsCount,
    sessionsRemaining: plan.sessionsCount,
    startDate,
    endDate,
    status: "pending_payment",
    paymentStatus: "reported",
    amountKrw: input.amountKrw,
    preferredSlotTime: previous.preferredSlotTime ?? "10:00",
    preferredSlotDay: previous.preferredSlotDay,
    renewedFromEnrollmentId: previous.id,
    adjustments: [],
  };

  enrollments.push(enrollment);

  paymentRecords.push({
    id: `pay-${Date.now()}`,
    studentId: previous.studentId,
    enrollmentId: enrollment.id,
    label: `${enrollment.planLabel} (재수강) — ${previous.teacherName}`,
    amountKrw: input.amountKrw,
    paidAt: todayKey,
    status: "reported",
    depositorName: input.depositorName,
  });

  if (getActiveLearner().id === previous.studentId) {
    updateLearnerEnrollmentMeta(previous.studentId, {
      paymentStatus: "reported",
      planLabel: enrollment.planLabel,
      teacherName: previous.teacherName,
    });
  }

  return { ...enrollment, adjustments: [] };
}

export function confirmEnrollmentPayment(
  enrollmentId: string,
  adminName = "관리자"
): StudentEnrollment | null {
  const index = enrollments.findIndex((e) => e.id === enrollmentId);
  if (index === -1) return null;

  const current = enrollments[index];
  if (current.paymentStatus === "confirmed") {
    return { ...current, adjustments: [...(current.adjustments ?? [])] };
  }

  const updated: StudentEnrollment = {
    ...current,
    status: "active",
    paymentStatus: "confirmed",
  };
  enrollments[index] = updated;

  const payIndex = paymentRecords.findIndex((p) => p.enrollmentId === enrollmentId);
  if (payIndex >= 0) {
    paymentRecords[payIndex] = { ...paymentRecords[payIndex], status: "confirmed" };
  }

  if (getActiveLearner().id === current.studentId) {
    updateLearnerEnrollmentMeta(current.studentId, {
      paymentStatus: "confirmed",
      planLabel: current.planLabel,
      teacherName: current.teacherName,
    });
  }

  void adminName;
  return { ...updated, adjustments: [...(updated.adjustments ?? [])] };
}

export function rejectEnrollmentPayment(
  enrollmentId: string,
  adminName = "관리자"
): StudentEnrollment | null {
  const index = enrollments.findIndex((e) => e.id === enrollmentId);
  if (index === -1) return null;

  const current = enrollments[index];
  const updated: StudentEnrollment = {
    ...current,
    status: "pending_payment",
    paymentStatus: "rejected",
  };
  enrollments[index] = updated;

  const payIndex = paymentRecords.findIndex((p) => p.enrollmentId === enrollmentId);
  if (payIndex >= 0) {
    paymentRecords[payIndex] = { ...paymentRecords[payIndex], status: "rejected" };
  }

  if (getActiveLearner().id === current.studentId) {
    updateLearnerEnrollmentMeta(current.studentId, { paymentStatus: "rejected" });
  }

  void adminName;
  return { ...updated, adjustments: [...(updated.adjustments ?? [])] };
}

export function getPaymentRecordsByStudent(studentId: string): PaymentRecord[] {
  return paymentRecords.filter((p) => p.studentId === studentId);
}

export interface AdjustSessionsInput {
  sessionsRemaining?: number;
  sessionsTotal?: number;
  deltaRemaining?: number;
  deltaTotal?: number;
  reason?: string;
  adminName?: string;
}

export function adjustEnrollmentSessions(
  enrollmentId: string,
  input: AdjustSessionsInput
): StudentEnrollment | null {
  const index = enrollments.findIndex((e) => e.id === enrollmentId);
  if (index === -1) return null;

  const current = enrollments[index];
  let nextTotal = input.sessionsTotal ?? current.sessionsTotal;
  let nextRemaining = input.sessionsRemaining ?? current.sessionsRemaining;

  if (input.deltaTotal !== undefined) {
    nextTotal = current.sessionsTotal + input.deltaTotal;
  }
  if (input.deltaRemaining !== undefined) {
    nextRemaining = current.sessionsRemaining + input.deltaRemaining;
  }

  const clamped = clampSessions(nextTotal, nextRemaining);
  const deltaRemaining = clamped.sessionsRemaining - current.sessionsRemaining;

  if (
    clamped.sessionsTotal === current.sessionsTotal &&
    clamped.sessionsRemaining === current.sessionsRemaining
  ) {
    return { ...current, adjustments: [...(current.adjustments ?? [])] };
  }

  const adjustment = {
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

  const updated: StudentEnrollment = {
    ...current,
    ...clamped,
    adjustments: [adjustment, ...(current.adjustments ?? [])].slice(0, 20),
  };

  enrollments[index] = updated;
  return { ...updated, adjustments: [...updated.adjustments!] };
}

export function updateEnrollmentTeacher(
  enrollmentId: string,
  teacherId: string,
  teacherName: string
): StudentEnrollment | null {
  const index = enrollments.findIndex((e) => e.id === enrollmentId);
  if (index === -1) return null;
  enrollments[index] = { ...enrollments[index], teacherId, teacherName };
  return { ...enrollments[index] };
}

export function updateEnrollmentEndDate(
  enrollmentId: string,
  endDate: string
): StudentEnrollment | null {
  const index = enrollments.findIndex((e) => e.id === enrollmentId);
  if (index === -1) return null;
  enrollments[index] = { ...enrollments[index], endDate };
  return { ...enrollments[index] };
}

/** @deprecated split 이관 시 syncEnrollmentsAfterBulkReassign 사용 */
export function reassignEnrollmentsTeacher(
  fromTeacherId: string,
  toTeacherId: string,
  toTeacherName: string
): number {
  let count = 0;
  enrollments = enrollments.map((e) => {
    if (
      e.teacherId === fromTeacherId &&
      (e.status === "active" || e.status === "expiring_soon")
    ) {
      count += 1;
      return { ...e, teacherId: toTeacherId, teacherName: toTeacherName };
    }
    return e;
  });
  return count;
}

/** 테스트/개발용 — 시드 데이터로 초기화 */
export function resetEnrollments() {
  enrollments = structuredClone(SEED);
  paymentRecords.length = 0;
}

export function getEnrollmentSeed() {
  return SEED;
}
