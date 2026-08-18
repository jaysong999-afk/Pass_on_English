/** Server-side hold duration (includes admin processing buffer). */
export const PAYMENT_HOLD_HOURS = 15;

/** Shown to students in UI copy. */
export const PAYMENT_DISPLAY_HOURS = 12;

export function computePaymentDeadline(from: Date = new Date()): Date {
  return new Date(from.getTime() + PAYMENT_HOLD_HOURS * 60 * 60 * 1000);
}

/** Hold clock for trial-first enrollments starts when the free lesson ends. */
export function computePaymentDeadlineAfterTrial(
  trialScheduledAt: string,
  durationMinutes: number
): Date {
  const end = new Date(new Date(trialScheduledAt).getTime() + durationMinutes * 60 * 1000);
  return computePaymentDeadline(end);
}

/** Instant the 15h hold actually begins (confirm time, trial end, or last-lesson end). */
export function paymentHoldStartsAt(deadlineAt: string | Date): Date {
  return new Date(new Date(deadlineAt).getTime() - PAYMENT_HOLD_HOURS * 60 * 60 * 1000);
}

export function addHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

/** Student-facing payment deadline (12h after hold start). Hold itself lasts 15h. */
export function studentPaymentDeadlineAt(holdDeadlineAt: string | Date): Date {
  return addHours(paymentHoldStartsAt(holdDeadlineAt), PAYMENT_DISPLAY_HOURS);
}

export function computeHoldDeadlineFrom(start: Date): Date {
  return addHours(start, PAYMENT_HOLD_HOURS);
}

export function computeStudentDeadlineFrom(start: Date): Date {
  return addHours(start, PAYMENT_DISPLAY_HOURS);
}

/** Student-facing deadline is always 12h; the server keeps the slot for 15h. */
export function studentFacingPaymentDeadlineAt(enrollment: {
  paymentDeadlineAt?: string;
}): string | undefined {
  if (!enrollment.paymentDeadlineAt) return undefined;
  return studentPaymentDeadlineAt(enrollment.paymentDeadlineAt).toISOString();
}
