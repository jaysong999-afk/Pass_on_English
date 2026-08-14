import type { StudentEnrollment } from "@/types";
import { LESSON_MINUTES } from "@/lib/availability/constants";
import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { normalizeSlotStart } from "@/lib/availability/time-utils";
import { getCachedPricingPlanById } from "@/lib/pricing-plan-cache";

const DEFAULT_SLOT_TIME = "10:00" as SlotStartTime;

export function buildEnrollmentSlotTime(enrollment: StudentEnrollment): SlotStartTime {
  return normalizeSlotStart(enrollment.preferredSlotTime ?? DEFAULT_SLOT_TIME);
}

export function getEnrollmentScheduleDays(enrollment: StudentEnrollment): DayLabel[] {
  if (enrollment.scheduleDays && enrollment.scheduleDays.length > 0) {
    return enrollment.scheduleDays as DayLabel[];
  }
  const plan = getCachedPricingPlanById(enrollment.planId);
  if (plan?.scheduleDays && plan.scheduleDays.length > 0) {
    return plan.scheduleDays as DayLabel[];
  }
  if (enrollment.preferredSlotDay) {
    return [enrollment.preferredSlotDay as DayLabel];
  }
  return ["Mon", "Wed", "Fri"];
}

export function getEnrollmentSessionMinutes(enrollment: StudentEnrollment): number {
  if (enrollment.sessionMinutes && enrollment.sessionMinutes > 0) {
    return enrollment.sessionMinutes;
  }
  const plan = getCachedPricingPlanById(enrollment.planId);
  return plan?.sessionMinutes ?? LESSON_MINUTES;
}

export function formatEnrollmentSlotLabel(enrollment: StudentEnrollment): string {
  const time = buildEnrollmentSlotTime(enrollment);
  const days = getEnrollmentScheduleDays(enrollment);
  return `${days.join("·")} ${time}`;
}
