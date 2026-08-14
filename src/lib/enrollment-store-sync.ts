import type { PaymentRecord, StudentEnrollment } from "@/types";
import {
  getEnrollmentCache,
  getPaymentCache,
  patchEnrollmentInCache,
  setEnrollmentCache,
  setPaymentCache,
} from "@/lib/enrollments/enrollment-cache";

function cloneEnrollment(enrollment: StudentEnrollment): StudentEnrollment {
  return {
    ...enrollment,
    adjustments: enrollment.adjustments ? [...enrollment.adjustments] : undefined,
  };
}

export function getAllEnrollments() {
  return getEnrollmentCache().map(cloneEnrollment);
}

export function getEnrollmentById(id: string) {
  const enrollment = getEnrollmentCache().find((e) => e.id === id);
  return enrollment ? cloneEnrollment(enrollment) : undefined;
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
    (e) =>
      e.status === "pending_payment" &&
      (e.paymentStatus === "pending" || e.paymentStatus === "reported")
  );
}

export function getAwaitingDepositEnrollments() {
  return getAllEnrollments().filter(
    (e) => e.status === "pending_payment" && e.paymentStatus === "pending"
  );
}

export function getPaymentRecordsByStudent(studentId: string): PaymentRecord[] {
  return getPaymentCache().filter((p) => p.studentId === studentId);
}

export function getPaymentByEnrollmentId(enrollmentId: string): PaymentRecord | undefined {
  const payment = getPaymentCache().find((p) => p.enrollmentId === enrollmentId);
  return payment ? { ...payment } : undefined;
}

export function updateEnrollmentEndDate(
  enrollmentId: string,
  endDate: string
): StudentEnrollment | null {
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;
  patchEnrollmentInCache({ ...current, endDate });
  return getEnrollmentById(enrollmentId) ?? null;
}

export function updateEnrollmentTeacher(
  enrollmentId: string,
  teacherId: string,
  teacherName: string
): StudentEnrollment | null {
  const current = getEnrollmentById(enrollmentId);
  if (!current) return null;
  patchEnrollmentInCache({ ...current, teacherId, teacherName });
  return getEnrollmentById(enrollmentId) ?? null;
}

export function reassignEnrollmentsTeacher(
  fromTeacherId: string,
  toTeacherId: string,
  toTeacherName: string
): number {
  let count = 0;
  for (const enrollment of getEnrollmentCache()) {
    if (
      enrollment.teacherId === fromTeacherId &&
      (enrollment.status === "active" || enrollment.status === "expiring_soon")
    ) {
      patchEnrollmentInCache({
        ...enrollment,
        teacherId: toTeacherId,
        teacherName: toTeacherName,
      });
      count += 1;
    }
  }
  return count;
}

export function resetEnrollments() {
  setEnrollmentCache([]);
  setPaymentCache([]);
}

export function getEnrollmentSeed(): StudentEnrollment[] {
  return [];
}
