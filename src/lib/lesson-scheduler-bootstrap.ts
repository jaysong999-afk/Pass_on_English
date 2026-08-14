import { warmPricingPlanCache } from "@/lib/pricing-plans/repository";
import { expireEnrollmentHoldsInDb, ensureRenewalOffersInDb, warmEnrollmentCache } from "@/lib/enrollments/repository";
import { warmLessonCache } from "@/lib/lessons/repository";
import { warmRescheduleCache } from "@/lib/reschedule/repository";
import { restoreOccupiedWeeklyAvailabilityInDb, warmAllTeacherAvailabilityCache } from "@/lib/teacher-availability/repository";
import { bootstrapActiveEnrollmentSchedulesInDb } from "@/lib/lessons/schedule-service";
import { warmLearningCache } from "@/lib/learning/repository";
import { warmSalaryCache } from "@/lib/teacher-salary/repository";
import { warmFaqCache } from "@/lib/faq/repository";
import { warmDashboardSettingsCache } from "@/lib/admin/dashboard-settings/repository";
import { warmTeacherApplicationCache } from "@/lib/teacher-applications/repository";
import { warmAdminReviewLogCache } from "@/lib/admin/admin-review-log-repository";
import { warmAdminLessonOperationLogCache } from "@/lib/admin/admin-lesson-operation-log-repository";
import { warmTeacherPayrollPenaltyCache } from "@/lib/teacher-payroll-penalty-repository";
import { warmSalaryBonusPolicyCache } from "@/lib/teacher-salary-policy-repository";
import { warmTeacherSalaryAdjustmentCache } from "@/lib/teacher-salary-adjustment-repository";
import { warmTeacherStudentContextCache } from "@/lib/teacher-student-context-repository";
import { warmTeacherProfileCache } from "@/lib/teachers/repository";
import { warmStudentRegistrationCache } from "@/lib/student-registrations/repository";
import { warmChatCache } from "@/lib/chat/repository";
import { warmFinanceCache } from "@/lib/finance/repository";
import { warmStudentDirectoryCache } from "@/lib/students/repository";
import { warmAdminMessagingCache } from "@/lib/admin/messages/repository";

let enrollmentSchedulesSynced = false;

async function runWarm(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (error) {
    console.error(`[ensureSchedulesBootstrapped] ${label}`, error);
  }
}

/** Server-only: load domain caches from Supabase then sync enrollment schedules. */
export async function ensureSchedulesBootstrapped(): Promise<void> {
  await runWarm("pricing plans", warmPricingPlanCache);
  await runWarm("enrollments", warmEnrollmentCache);
  await runWarm("student directory", warmStudentDirectoryCache);
  await runWarm("admin messaging", warmAdminMessagingCache);
  await runWarm("lessons", warmLessonCache);
  await runWarm("reschedule", warmRescheduleCache);
  await runWarm("restore occupied availability", () => restoreOccupiedWeeklyAvailabilityInDb());
  await runWarm("teacher availability", warmAllTeacherAvailabilityCache);
  await runWarm("learning", warmLearningCache);
  await runWarm("salary", warmSalaryCache);
  await runWarm("faq", warmFaqCache);
  await runWarm("dashboard settings", warmDashboardSettingsCache);
  await runWarm("teacher applications", warmTeacherApplicationCache);
  await runWarm("admin review logs", () => warmAdminReviewLogCache());
  await runWarm("admin lesson operation logs", warmAdminLessonOperationLogCache);
  await runWarm("teacher payroll penalties", warmTeacherPayrollPenaltyCache);
  await runWarm("salary bonus policy", warmSalaryBonusPolicyCache);
  await runWarm("salary adjustments", warmTeacherSalaryAdjustmentCache);
  await runWarm("teacher student context", warmTeacherStudentContextCache);
  await runWarm("teacher profiles", warmTeacherProfileCache);
  await runWarm("student registration reviews", warmStudentRegistrationCache);
  await runWarm("chat", warmChatCache);
  await runWarm("finance", warmFinanceCache);

  if (!enrollmentSchedulesSynced) {
    await runWarm("enrollment schedules", bootstrapActiveEnrollmentSchedulesInDb);
    enrollmentSchedulesSynced = true;
  }

  await runWarm("renewal offers", () => ensureRenewalOffersInDb());
  await runWarm("expire enrollment holds", () => expireEnrollmentHoldsInDb());
}

/** Lighter bootstrap for public/marketing pages. */
export async function ensurePublicContentBootstrapped(): Promise<void> {
  await runWarm("faq", warmFaqCache);
  await runWarm("teacher profiles", warmTeacherProfileCache);
  await runWarm("teacher availability", warmAllTeacherAvailabilityCache);
  await runWarm("pricing plans", warmPricingPlanCache);
}
