import { warmPricingPlanCache } from "@/lib/pricing-plans/repository";
import {
  dedupeAllRenewalHoldsInDb,
  expireEnrollmentHoldsInDb,
  ensureRenewalOffersInDb,
  syncEnrollmentCompletionStatusInDb,
  warmEnrollmentCache,
} from "@/lib/enrollments/repository";
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
let maintenanceInitialized = false;
let maintenanceInitialization: Promise<void> | null = null;
let lastMaintenanceRefreshAt = 0;
const MAINTENANCE_REFRESH_MS = 15 * 60 * 1000;

const initializedReadModels = new Set<string>();
const readModelInitializations = new Map<string, Promise<void>>();

/**
 * Populate a process-local read model once and share concurrent initialization.
 * Repository mutations patch their related caches, so request handlers do not
 * need to download every table again on each request.
 */
async function ensureReadModel(label: string, fn: () => Promise<unknown>): Promise<void> {
  if (initializedReadModels.has(label)) return;

  const pending = readModelInitializations.get(label);
  if (pending) {
    await pending;
    return;
  }

  const initialization = (async () => {
    await fn();
    initializedReadModels.add(label);
  })();
  readModelInitializations.set(label, initialization);

  try {
    await initialization;
  } catch (error) {
    console.error(`[ensureReadModelsBootstrapped] ${label}`, error);
  } finally {
    readModelInitializations.delete(label);
  }
}

/** Server-only: populate in-memory read models without changing persisted state. */
export async function ensureReadModelsBootstrapped(): Promise<void> {
  await Promise.all([
    ensureReadModel("pricing plans", warmPricingPlanCache),
    ensureReadModel("enrollments", warmEnrollmentCache),
    ensureReadModel("student directory", warmStudentDirectoryCache),
    ensureReadModel("admin messaging", warmAdminMessagingCache),
    ensureReadModel("lessons", warmLessonCache),
    ensureReadModel("reschedule", warmRescheduleCache),
    ensureReadModel("teacher availability", warmAllTeacherAvailabilityCache),
    ensureReadModel("learning", warmLearningCache),
    ensureReadModel("salary", warmSalaryCache),
    ensureReadModel("faq", warmFaqCache),
    ensureReadModel("dashboard settings", warmDashboardSettingsCache),
    ensureReadModel("teacher applications", warmTeacherApplicationCache),
    ensureReadModel("admin review logs", () => warmAdminReviewLogCache()),
    ensureReadModel("admin lesson operation logs", warmAdminLessonOperationLogCache),
    ensureReadModel("teacher payroll penalties", warmTeacherPayrollPenaltyCache),
    ensureReadModel("salary bonus policy", warmSalaryBonusPolicyCache),
    ensureReadModel("salary adjustments", warmTeacherSalaryAdjustmentCache),
    ensureReadModel("teacher student context", warmTeacherStudentContextCache),
    ensureReadModel("teacher profiles", warmTeacherProfileCache),
    ensureReadModel("student registration reviews", warmStudentRegistrationCache),
    ensureReadModel("chat", warmChatCache),
    ensureReadModel("finance", warmFinanceCache),
  ]);
}

/**
 * Backward-compatible name used by existing request handlers. This is now
 * deliberately read-only; persisted maintenance runs only through
 * runScheduleMaintenanceInDb.
 */
export const ensureSchedulesBootstrapped = ensureReadModelsBootstrapped;

export const ensurePricingPlansBootstrapped = () =>
  ensureReadModel("pricing plans", warmPricingPlanCache);
export const ensureEnrollmentsBootstrapped = () =>
  ensureReadModel("enrollments", warmEnrollmentCache);
export const ensureLessonsBootstrapped = () =>
  ensureReadModel("lessons", warmLessonCache);
export const ensureReschedulesBootstrapped = () =>
  ensureReadModel("reschedule", warmRescheduleCache);
export const ensureLearningBootstrapped = () =>
  ensureReadModel("learning", warmLearningCache);
export const ensureSalaryBootstrapped = () =>
  ensureReadModel("salary", warmSalaryCache);
export const ensureTeacherProfilesBootstrapped = () =>
  ensureReadModel("teacher profiles", warmTeacherProfileCache);
export const ensureTeacherAvailabilityBootstrapped = () =>
  ensureReadModel("teacher availability", warmAllTeacherAvailabilityCache);
export const ensureDashboardSettingsBootstrapped = () =>
  ensureReadModel("dashboard settings", warmDashboardSettingsCache);
export const ensureFaqBootstrapped = () =>
  ensureReadModel("faq", warmFaqCache);
export const ensureFinanceBootstrapped = () =>
  ensureReadModel("finance", warmFinanceCache);

export async function ensureAdminStudentsBootstrapped(): Promise<void> {
  await Promise.all([
    ensureReadModel("student directory", warmStudentDirectoryCache),
    ensureEnrollmentsBootstrapped(),
  ]);
}

export async function ensureAdminMessagingBootstrapped(): Promise<void> {
  await Promise.all([
    ensureReadModel("admin messaging", warmAdminMessagingCache),
    ensureTeacherProfilesBootstrapped(),
  ]);
}

export async function ensureAdminReviewsBootstrapped(): Promise<void> {
  await Promise.all([
    ensureEnrollmentsBootstrapped(),
    ensureLessonsBootstrapped(),
    ensureReschedulesBootstrapped(),
    ensureReadModel("student directory", warmStudentDirectoryCache),
    ensureReadModel("teacher applications", warmTeacherApplicationCache),
    ensureReadModel("student registration reviews", warmStudentRegistrationCache),
    ensureReadModel("admin review logs", () => warmAdminReviewLogCache()),
    ensureTeacherProfilesBootstrapped(),
  ]);
}

export async function ensureAdminTeachersBootstrapped(): Promise<void> {
  await Promise.all([
    ensureTeacherProfilesBootstrapped(),
    ensureTeacherAvailabilityBootstrapped(),
    ensureEnrollmentsBootstrapped(),
    ensureLessonsBootstrapped(),
    ensureLearningBootstrapped(),
    ensureSalaryBootstrapped(),
    ensureReadModel("student directory", warmStudentDirectoryCache),
    ensureReadModel("teacher applications", warmTeacherApplicationCache),
    ensureReadModel("teacher payroll penalties", warmTeacherPayrollPenaltyCache),
  ]);
}

export async function ensureAdminSalaryBootstrapped(): Promise<void> {
  await Promise.all([
    ensureSalaryBootstrapped(),
    ensureLessonsBootstrapped(),
    ensureTeacherProfilesBootstrapped(),
    ensureReadModel("teacher payroll penalties", warmTeacherPayrollPenaltyCache),
    ensureReadModel("salary bonus policy", warmSalaryBonusPolicyCache),
    ensureReadModel("salary adjustments", warmTeacherSalaryAdjustmentCache),
  ]);
}

export async function ensureLessonOperationsBootstrapped(): Promise<void> {
  await Promise.all([
    ensureLessonsBootstrapped(),
    ensureEnrollmentsBootstrapped(),
    ensurePricingPlansBootstrapped(),
    ensureTeacherProfilesBootstrapped(),
    ensureTeacherAvailabilityBootstrapped(),
    ensureReadModel("student directory", warmStudentDirectoryCache),
    ensureReadModel("admin lesson operation logs", warmAdminLessonOperationLogCache),
    ensureReadModel("teacher payroll penalties", warmTeacherPayrollPenaltyCache),
  ]);
}

export async function ensureAdminDashboardBootstrapped(): Promise<void> {
  await Promise.all([
    ensureFinanceBootstrapped(),
    ensureAdminReviewsBootstrapped(),
    ensureAdminTeachersBootstrapped(),
  ]);
}

export interface ScheduleMaintenanceResult {
  opened: number;
  expired: number;
}

/** Server-only: perform scheduled repairs and lifecycle transitions. */
export async function runScheduleMaintenanceInDb(): Promise<ScheduleMaintenanceResult> {
  // Availability repair and the one-time schedule backfill need the broader
  // supporting models, but only on the first maintenance run per app process.
  // Share the promise so concurrent invocations cannot duplicate the warm-up.
  if (!maintenanceInitialized) {
    maintenanceInitialization ??= (async () => {
      await Promise.all([
        ensureEnrollmentsBootstrapped(),
        ensureLessonsBootstrapped(),
        ensurePricingPlansBootstrapped(),
        ensureReadModel("teacher availability", warmAllTeacherAvailabilityCache),
        ensureReadModel("teacher profiles", warmTeacherProfileCache),
      ]);
      await restoreOccupiedWeeklyAvailabilityInDb();
      if (!enrollmentSchedulesSynced) {
        await bootstrapActiveEnrollmentSchedulesInDb();
        enrollmentSchedulesSynced = true;
      }
      await dedupeAllRenewalHoldsInDb();
      await syncEnrollmentCompletionStatusInDb();
      lastMaintenanceRefreshAt = Date.now();
      maintenanceInitialized = true;
    })();
    await maintenanceInitialization;
  }

  // Writes made by the app update these process-local read models immediately.
  // Periodically reconcile external/manual DB changes without downloading all
  // lessons, enrollments and payments on every one-minute cron tick.
  if (Date.now() - lastMaintenanceRefreshAt >= MAINTENANCE_REFRESH_MS) {
    await Promise.all([warmEnrollmentCache(), warmLessonCache()]);
    await dedupeAllRenewalHoldsInDb();
    await syncEnrollmentCompletionStatusInDb();
    lastMaintenanceRefreshAt = Date.now();
  }

  const opened = await ensureRenewalOffersInDb();
  const expired = await expireEnrollmentHoldsInDb();
  return { opened, expired };
}

/** Lighter bootstrap for public/marketing pages. */
export async function ensurePublicContentBootstrapped(): Promise<void> {
  await Promise.all([
    ensureReadModel("faq", warmFaqCache),
    ensureReadModel("teacher profiles", warmTeacherProfileCache),
    ensureReadModel("pricing plans", warmPricingPlanCache),
  ]);
}

/** Enrollment-only: load weekly templates when the learner compares teachers. */
export async function ensureEnrollmentAvailabilityBootstrapped(): Promise<void> {
  await Promise.all([
    ensureReadModel("teacher profiles", warmTeacherProfileCache),
    ensureReadModel("teacher availability", warmAllTeacherAvailabilityCache),
  ]);
}
