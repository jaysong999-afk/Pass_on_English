import { warmPricingPlanCache } from "@/lib/pricing-plans/repository";
import { bootstrapActiveEnrollmentSchedules } from "@/lib/lesson-scheduler";

/** Server-only: load pricing plans from Supabase then sync in-memory schedules. */
export async function ensureSchedulesBootstrapped(): Promise<void> {
  await warmPricingPlanCache();
  bootstrapActiveEnrollmentSchedules();
}
