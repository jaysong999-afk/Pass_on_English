import type { Lesson } from "@/types";

export function lessonCountsForPayroll(lesson: Lesson, payrollTeacherId: string): boolean {
  if (lesson.status !== "completed") return false;
  if (lesson.unpaidForTeacher || lesson.teacherNoShow) return false;
  const payee = lesson.payrollTeacherId ?? lesson.teacherId;
  return payee === payrollTeacherId;
}
