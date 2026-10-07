import { getTeacherPayrollPenaltyEventCache } from "@/lib/teacher-payroll-penalty-event-cache";

export function getActiveNoShowDeductionTotal(teacherId: string, month: string): number {
  return getTeacherPayrollPenaltyEventCache()
    .filter(
      (event) =>
        event.teacherId === teacherId &&
        event.salaryMonth === month &&
        event.status === "active"
    )
    .reduce((total, event) => total + event.deductionAmountPhp, 0);
}

export function getPenaltyEventsForTeacher(teacherId: string) {
  return getTeacherPayrollPenaltyEventCache()
    .filter((event) => event.teacherId === teacherId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function getPenaltyEventsForTeacherMonth(teacherId: string, month: string) {
  return getPenaltyEventsForTeacher(teacherId).filter((event) => event.salaryMonth === month);
}
