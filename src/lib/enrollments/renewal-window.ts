import type { Lesson, StudentEnrollment } from "@/types";
import {
  PAYMENT_DISPLAY_HOURS,
  PAYMENT_HOLD_HOURS,
  computeHoldDeadlineFrom,
  computeStudentDeadlineFrom,
  paymentHoldStartsAt,
} from "@/lib/enrollment-hold/constants";
import { getAllLessons } from "@/lib/teacher-lesson-store-sync";
import { getAllEnrollments } from "@/lib/enrollment-store-sync";

export type RenewalWindowStatus =
  | "ineligible"
  | "not_open"
  | "open"
  | "student_closed"
  | "expired";

export interface RenewalWindowState {
  status: RenewalWindowStatus;
  lastLessonEndedAt: string | null;
  studentDeadlineAt: string | null;
  holdDeadlineAt: string | null;
  canStudentApply: boolean;
  canStudentReportPayment: boolean;
  canAdminActivate: boolean;
}

type LessonLike = Pick<
  Lesson,
  | "enrollmentId"
  | "studentId"
  | "teacherId"
  | "isTrial"
  | "status"
  | "scheduledAt"
  | "durationMinutes"
>;

type EnrollmentLike = Pick<
  StudentEnrollment,
  | "id"
  | "studentId"
  | "teacherId"
  | "status"
  | "paymentStatus"
  | "renewedFromEnrollmentId"
  | "paymentDeadlineAt"
  | "confirmedAt"
>;

export function lessonEndAt(scheduledAt: string, durationMinutes: number): Date {
  return new Date(new Date(scheduledAt).getTime() + durationMinutes * 60 * 1000);
}

export function paidLessonsForEnrollment(
  enrollment: Pick<StudentEnrollment, "id" | "studentId" | "teacherId">,
  lessons: LessonLike[]
): LessonLike[] {
  return lessons.filter((lesson) => {
    if (lesson.isTrial) return false;
    if (lesson.status === "cancelled") return false;
    if (lesson.enrollmentId === enrollment.id) return true;
    if (lesson.enrollmentId) return false;
    return lesson.studentId === enrollment.studentId && lesson.teacherId === enrollment.teacherId;
  });
}

export function getEnrollmentLastLessonEnd(
  enrollment: Pick<StudentEnrollment, "id" | "studentId" | "teacherId">,
  lessons: LessonLike[]
): Date | null {
  let latest: Date | null = null;
  for (const lesson of paidLessonsForEnrollment(enrollment, lessons)) {
    const end = lessonEndAt(lesson.scheduledAt, lesson.durationMinutes);
    if (!latest || end.getTime() > latest.getTime()) latest = end;
  }
  return latest;
}

export function hasUpcomingPaidLesson(
  enrollment: Pick<StudentEnrollment, "id" | "studentId" | "teacherId">,
  lessons: LessonLike[],
  now: Date = new Date()
): boolean {
  return paidLessonsForEnrollment(enrollment, lessons).some(
    (lesson) => lessonEndAt(lesson.scheduledAt, lesson.durationMinutes).getTime() > now.getTime()
  );
}

export function isRenewableEnrollmentStatus(status: StudentEnrollment["status"]): boolean {
  return status === "active" || status === "expiring_soon" || status === "completed";
}

export function findRenewalHoldFor(
  fromEnrollmentId: string,
  enrollments: EnrollmentLike[]
): EnrollmentLike | undefined {
  return listRenewalHoldsFor(fromEnrollmentId, enrollments)[0];
}

export function listRenewalHoldsFor(
  fromEnrollmentId: string,
  enrollments: EnrollmentLike[]
): EnrollmentLike[] {
  return enrollments.filter(
    (enrollment) =>
      enrollment.renewedFromEnrollmentId === fromEnrollmentId &&
      enrollment.status === "pending_payment" &&
      (enrollment.paymentStatus === "pending" || enrollment.paymentStatus === "reported")
  );
}

export function hasConfirmedRenewalFor(
  fromEnrollmentId: string,
  enrollments: EnrollmentLike[]
): boolean {
  return enrollments.some(
    (enrollment) =>
      enrollment.renewedFromEnrollmentId === fromEnrollmentId &&
      (enrollment.status === "active" || enrollment.status === "expiring_soon")
  );
}

/**
 * Apply/pay window is anchored to the original course's last paid lesson:
 * open from lesson creation until last-lesson-end + 12h, admin buffer +15h.
 */
function windowFromLastLessonEnd(lastEnd: Date, now: Date): RenewalWindowState {
  const studentDeadline = computeStudentDeadlineFrom(lastEnd);
  const holdDeadline = computeHoldDeadlineFrom(lastEnd);
  const lastLessonEndedAt = lastEnd.toISOString();
  const studentDeadlineAt = studentDeadline.toISOString();
  const holdDeadlineAt = holdDeadline.toISOString();

  if (now.getTime() <= studentDeadline.getTime()) {
    return {
      status: "open",
      lastLessonEndedAt,
      studentDeadlineAt,
      holdDeadlineAt,
      canStudentApply: true,
      canStudentReportPayment: true,
      canAdminActivate: true,
    };
  }
  if (now.getTime() <= holdDeadline.getTime()) {
    return {
      status: "student_closed",
      lastLessonEndedAt,
      studentDeadlineAt,
      holdDeadlineAt,
      canStudentApply: false,
      canStudentReportPayment: false,
      canAdminActivate: true,
    };
  }
  return {
    status: "expired",
    lastLessonEndedAt,
    studentDeadlineAt,
    holdDeadlineAt,
    canStudentApply: false,
    canStudentReportPayment: false,
    canAdminActivate: false,
  };
}

function resolveLastLessonEnd(
  enrollment: EnrollmentLike,
  lessons: LessonLike[],
  enrollments: EnrollmentLike[]
): Date | null {
  // Payment holds anchor to the parent course's last lesson.
  if (enrollment.status === "pending_payment" && enrollment.renewedFromEnrollmentId) {
    const parent = enrollments.find((row) => row.id === enrollment.renewedFromEnrollmentId);
    if (parent) {
      const parentLastEnd = getEnrollmentLastLessonEnd(parent, lessons);
      if (parentLastEnd) return parentLastEnd;
    }
  }

  const lastEnd = getEnrollmentLastLessonEnd(enrollment, lessons);
  if (lastEnd) return lastEnd;

  if (enrollment.paymentDeadlineAt) {
    return paymentHoldStartsAt(enrollment.paymentDeadlineAt);
  }
  return null;
}

export function getRenewalWindowState(
  enrollment: EnrollmentLike,
  lessons: LessonLike[],
  now: Date = new Date(),
  enrollments: EnrollmentLike[] = getAllEnrollments()
): RenewalWindowState {
  const empty: RenewalWindowState = {
    status: "ineligible",
    lastLessonEndedAt: null,
    studentDeadlineAt: null,
    holdDeadlineAt: null,
    canStudentApply: false,
    canStudentReportPayment: false,
    canAdminActivate: false,
  };

  if (!enrollment.renewedFromEnrollmentId && !isRenewableEnrollmentStatus(enrollment.status)) {
    return empty;
  }

  const lastEnd = resolveLastLessonEnd(enrollment, lessons, enrollments);
  if (!lastEnd) {
    return { ...empty, status: "not_open" };
  }
  return windowFromLastLessonEnd(lastEnd, now);
}

export function hasActivatedRenewalEnrollment(
  fromEnrollmentId: string,
  enrollments: EnrollmentLike[] = getAllEnrollments()
): boolean {
  return enrollments.some(
    (row) =>
      row.renewedFromEnrollmentId === fromEnrollmentId &&
      (row.status === "active" || row.status === "expiring_soon")
  );
}

export function hasPendingRenewalApproval(
  fromEnrollmentId: string,
  enrollments: EnrollmentLike[] = getAllEnrollments()
): boolean {
  return enrollments.some(
    (row) =>
      row.renewedFromEnrollmentId === fromEnrollmentId &&
      row.status === "pending_payment" &&
      (row.paymentStatus === "pending" || row.paymentStatus === "reported")
  );
}

/** True when a renewal hold or active continuation already exists for this enrollment. */
export function hasRenewalInProgress(
  fromEnrollmentId: string,
  enrollments: EnrollmentLike[] = getAllEnrollments()
): boolean {
  return enrollments.some(
    (row) =>
      row.renewedFromEnrollmentId === fromEnrollmentId &&
      (row.status === "active" ||
        row.status === "expiring_soon" ||
        (row.status === "pending_payment" &&
          (row.paymentStatus === "pending" || row.paymentStatus === "reported")))
  );
}

export function decorateEnrollmentRenewal(
  enrollment: StudentEnrollment,
  lessons: LessonLike[] = getAllLessons(),
  enrollments: EnrollmentLike[] = getAllEnrollments(),
  now: Date = new Date()
): StudentEnrollment {
  const window = getRenewalWindowState(enrollment, lessons, now, enrollments);
  const renewalBlocked =
    enrollment.status === "active" || enrollment.status === "expiring_soon"
      ? hasActivatedRenewalEnrollment(enrollment.id, enrollments) ||
        hasPendingRenewalApproval(enrollment.id, enrollments)
      : hasRenewalInProgress(enrollment.id, enrollments);
  return {
    ...enrollment,
    canStudentRenew:
      isRenewableEnrollmentStatus(enrollment.status) &&
      !renewalBlocked &&
      window.canStudentApply,
    renewalWindowStatus: window.status,
    renewalLastLessonEndedAt: window.lastLessonEndedAt ?? undefined,
    renewalStudentDeadlineAt: window.studentDeadlineAt ?? undefined,
    renewalHoldDeadlineAt: window.holdDeadlineAt ?? undefined,
    renewalIsLastLessonHold: isLastLessonAutoHold(enrollment, lessons, enrollments),
    renewalIsSystemAutoOffer: isRenewalSystemAutoOffer(enrollment, lessons, enrollments),
  };
}

export function isLastLessonAutoHold(
  enrollment: EnrollmentLike,
  lessons: LessonLike[],
  enrollments: EnrollmentLike[] = getAllEnrollments()
): boolean {
  if (!enrollment.renewedFromEnrollmentId || !enrollment.paymentDeadlineAt) return false;
  const parent = enrollments.find((row) => row.id === enrollment.renewedFromEnrollmentId);
  if (!parent) return false;
  const lastEnd = getEnrollmentLastLessonEnd(parent, lessons);
  if (!lastEnd) return false;
  const holdStart = paymentHoldStartsAt(enrollment.paymentDeadlineAt);
  return Math.abs(holdStart.getTime() - lastEnd.getTime()) < 2 * 60 * 1000;
}

/** True when the renewal hold was auto-created at last-lesson end (student has not clicked 재수강). */
export function isRenewalSystemAutoOffer(
  enrollment: EnrollmentLike,
  lessons: LessonLike[],
  enrollments: EnrollmentLike[] = getAllEnrollments()
): boolean {
  if (!enrollment.renewedFromEnrollmentId) return false;
  const parent = enrollments.find((row) => row.id === enrollment.renewedFromEnrollmentId);
  if (!parent) return false;
  const lastEnd = getEnrollmentLastLessonEnd(parent, lessons);
  if (!lastEnd) return false;
  if (!enrollment.confirmedAt) return true;
  const confirmed = new Date(enrollment.confirmedAt).getTime();
  return Math.abs(confirmed - lastEnd.getTime()) < 2 * 60 * 1000;
}

export { PAYMENT_DISPLAY_HOURS, PAYMENT_HOLD_HOURS };

/** Student dashboard: show 재수강 on confirmed active courses when the next term is not already queued. */
export function canShowStudentRenewButton(
  enrollment: Pick<StudentEnrollment, "status" | "paymentStatus" | "canStudentRenew">
): boolean {
  if (enrollment.status === "pending_payment") return false;
  if (enrollment.status !== "active" && enrollment.status !== "expiring_soon") return false;
  if (enrollment.paymentStatus !== "confirmed") return false;
  return Boolean(enrollment.canStudentRenew);
}
