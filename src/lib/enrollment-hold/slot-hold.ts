import type { DayLabel, SlotStartTime } from "@/lib/availability/types";
import { occupiedSlotStarts, normalizeSlotStart } from "@/lib/availability/time-utils";
import { canBookSessionOnAllPlanDays } from "@/lib/availability/slot-continuity";
import { getCachedPricingPlanById } from "@/lib/pricing-plan-cache";
import type { StudentEnrollment } from "@/types";
import {
  releaseTeacherWeeklySlotsForPlan,
  reserveTeacherWeeklySlotsForPlan,
} from "@/lib/teacher-booked-slots";
import {
  releaseTeacherWeeklySlotsInDb,
  reserveTeacherWeeklySlotsInDb,
} from "@/lib/teacher-availability/repository";

export function enrollmentPlanDays(enrollment: StudentEnrollment): DayLabel[] {
  const plan = getCachedPricingPlanById(enrollment.planId);
  return (plan?.scheduleDays ?? ["Mon", "Wed", "Fri"]) as DayLabel[];
}

export function enrollmentSessionMinutes(enrollment: StudentEnrollment): number {
  const plan = getCachedPricingPlanById(enrollment.planId);
  return plan?.sessionMinutes && plan.sessionMinutes > 0 ? plan.sessionMinutes : 20;
}

export function enrollmentSlotTime(enrollment: StudentEnrollment): SlotStartTime {
  return normalizeSlotStart((enrollment.preferredSlotTime ?? "10:00") as SlotStartTime);
}

export function assertEnrollmentSlotAvailable(
  enrollment: Pick<StudentEnrollment, "teacherId" | "planId" | "preferredSlotTime">,
  ignore?: { studentId?: string; studentName?: string }
): void {
  const planDays = enrollmentPlanDays(enrollment as StudentEnrollment);
  const sessionMinutes = enrollmentSessionMinutes(enrollment as StudentEnrollment);
  const startTime = enrollmentSlotTime(enrollment as StudentEnrollment);

  if (
    !canBookSessionOnAllPlanDays(
      enrollment.teacherId,
      planDays,
      startTime,
      sessionMinutes,
      ignore
    )
  ) {
    throw new Error("slot_no_longer_available");
  }
}

/**
 * Persist that a student occupies a weekly session. Teacher working hours are
 * not deleted — other students are blocked by enrollment/lesson occupancy.
 */
export async function holdEnrollmentSlotsInDb(
  enrollment: StudentEnrollment,
  studentName?: string
): Promise<void> {
  const planDays = enrollmentPlanDays(enrollment);
  const sessionMinutes = enrollmentSessionMinutes(enrollment);
  const startTime = enrollmentSlotTime(enrollment);

  await reserveTeacherWeeklySlotsInDb(enrollment.teacherId, {
    planDays,
    startTime,
    sessionMinutes,
    studentName,
    studentId: enrollment.studentId,
  });
}

export async function releaseEnrollmentSlotsInDb(
  enrollment: StudentEnrollment
): Promise<void> {
  const planDays = enrollmentPlanDays(enrollment);
  const sessionMinutes = enrollmentSessionMinutes(enrollment);
  const startTime = enrollmentSlotTime(enrollment);

  await releaseTeacherWeeklySlotsInDb(enrollment.teacherId, {
    planDays,
    startTime,
    sessionMinutes,
  });

  releaseTeacherWeeklySlotsForPlan(
    enrollment.teacherId,
    planDays,
    startTime,
    sessionMinutes
  );
}

/** In-memory only (e.g. before DB row exists). */
export function holdEnrollmentSlotsInMemory(
  enrollment: Pick<StudentEnrollment, "teacherId" | "planId" | "preferredSlotTime" | "studentId">,
  studentName?: string
): void {
  const planDays = enrollmentPlanDays(enrollment as StudentEnrollment);
  const sessionMinutes = enrollmentSessionMinutes(enrollment as StudentEnrollment);
  const startTime = enrollmentSlotTime(enrollment as StudentEnrollment);

  reserveTeacherWeeklySlotsForPlan(
    enrollment.teacherId,
    planDays,
    startTime,
    studentName,
    sessionMinutes,
    enrollment.studentId
  );
}

export function occupiedBlocksForEnrollment(enrollment: StudentEnrollment): Array<{
  day: DayLabel;
  start: SlotStartTime;
}> {
  const planDays = enrollmentPlanDays(enrollment);
  const sessionMinutes = enrollmentSessionMinutes(enrollment);
  const blocks = occupiedSlotStarts(enrollmentSlotTime(enrollment), sessionMinutes);
  const slots: Array<{ day: DayLabel; start: SlotStartTime }> = [];
  for (const day of planDays) {
    for (const start of blocks) {
      slots.push({ day, start });
    }
  }
  return slots;
}
