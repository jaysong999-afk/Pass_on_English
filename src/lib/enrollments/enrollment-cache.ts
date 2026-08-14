import type { PaymentRecord, StudentEnrollment } from "@/types";

let enrollmentCache: StudentEnrollment[] = [];
let paymentCache: PaymentRecord[] = [];

export function getEnrollmentCache(): StudentEnrollment[] {
  return enrollmentCache;
}

export function setEnrollmentCache(items: StudentEnrollment[]) {
  enrollmentCache = items;
}

export function patchEnrollmentInCache(enrollment: StudentEnrollment) {
  const index = enrollmentCache.findIndex((e) => e.id === enrollment.id);
  if (index === -1) {
    enrollmentCache.push(enrollment);
  } else {
    enrollmentCache[index] = enrollment;
  }
}

export function getPaymentCache(): PaymentRecord[] {
  return paymentCache;
}

export function setPaymentCache(items: PaymentRecord[]) {
  paymentCache = items;
}

export function pushPaymentToCache(record: PaymentRecord) {
  paymentCache.push(record);
}
