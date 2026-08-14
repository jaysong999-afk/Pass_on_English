import type { AdminReviewCategory, AdminReviewLogEntry } from "@/types";
import {
  actionLabel,
  categoryLabel,
  clearAdminReviewLogCache,
  getAdminReviewLogCache,
} from "@/lib/admin/admin-review-log-cache";

export type AdminReviewLogsByCategory = ReturnType<typeof getAdminReviewLogsByCategory>;

export function getAdminReviewLogsByCategory(limit = 100) {
  const cache = getAdminReviewLogCache();
  return {
    reschedule: cache.reschedule.slice(0, limit).map((entry) => ({ ...entry })),
    teacher_signup: cache.teacher_signup.slice(0, limit).map((entry) => ({ ...entry })),
    student_signup: cache.student_signup.slice(0, limit).map((entry) => ({ ...entry })),
    payment_activation: cache.payment_activation
      .slice(0, limit)
      .map((entry) => ({ ...entry })),
  };
}

export function getAdminReviewLogsForCategory(
  category: AdminReviewCategory,
  limit = 100
): AdminReviewLogEntry[] {
  return getAdminReviewLogsByCategory(limit)[category];
}

export { categoryLabel, actionLabel };

/** @internal */
export function resetAdminReviewLogStore() {
  clearAdminReviewLogCache();
}
