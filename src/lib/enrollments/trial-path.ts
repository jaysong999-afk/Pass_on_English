import type { Lesson } from "@/types";
import { computePaymentDeadlineAfterTrial } from "@/lib/enrollment-hold/constants";

/**
 * Two enrollment flows — keep them separate:
 * - trial_first: first-time learner books one free lesson, then pays for the plan's N sessions
 *   (trial is extra, not counted in N). Payment hold starts when the trial ends.
 * - paid_only: returning learner / trial already used / renewal. No trial copy or booking.
 *   Payment hold starts when they confirm the application.
 */
export type EnrollmentPath = "trial_first" | "paid_only";

export function resolveEnrollmentPath(input: {
  mode: "new" | "renew";
  trialUsed: boolean;
  pendingTrialScheduledAt?: string | null;
}): EnrollmentPath {
  if (input.mode === "renew") return "paid_only";
  if (isUpcomingTrial(input.pendingTrialScheduledAt)) return "trial_first";
  if (!input.trialUsed) return "trial_first";
  return "paid_only";
}

export function isUpcomingTrial(scheduledAt?: string | null): boolean {
  if (!scheduledAt) return false;
  return new Date(scheduledAt).getTime() > Date.now() - 60 * 1000;
}

export function trialLessonEndAt(scheduledAt: string, durationMinutes: number): Date {
  return new Date(new Date(scheduledAt).getTime() + durationMinutes * 60 * 1000);
}

/** Trial still drives hold/deadline if it has not ended, or the post-trial hold window is open. */
export function isTrialRelevantForHold(
  scheduledAt: string,
  durationMinutes: number,
  now: Date = new Date()
): boolean {
  return computePaymentDeadlineAfterTrial(scheduledAt, durationMinutes).getTime() > now.getTime();
}

export function isPaidEnrollmentLesson(lesson: Pick<Lesson, "isTrial">): boolean {
  return !lesson.isTrial;
}
