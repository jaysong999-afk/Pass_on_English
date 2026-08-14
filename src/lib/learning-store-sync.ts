import type { LessonFeedback, MonthlyGrowthReport } from "@/types";
import { getFeedbackCache, getReportCache } from "@/lib/learning/learning-cache";

function cloneFeedback(f: LessonFeedback): LessonFeedback {
  return { ...f };
}

function cloneReport(r: MonthlyGrowthReport): MonthlyGrowthReport {
  return { ...r };
}

export function getFeedbacksByStudent(studentId: string) {
  return getFeedbackCache()
    .filter((f) => f.studentId === studentId)
    .sort((a, b) => new Date(b.lessonDate).getTime() - new Date(a.lessonDate).getTime())
    .map(cloneFeedback);
}

export function getFeedbacksByTeacher(teacherId: string) {
  return getFeedbackCache()
    .filter((f) => f.teacherId === teacherId)
    .sort((a, b) => new Date(b.lessonDate).getTime() - new Date(a.lessonDate).getTime())
    .map(cloneFeedback);
}

export function getFeedbacksByTeacherMonth(
  teacherId: string,
  month: string,
  studentId?: string
) {
  return getFeedbacksByTeacher(teacherId).filter((f) => {
    const key = f.lessonDate.slice(0, 7);
    if (key !== month) return false;
    if (studentId && studentId !== "all" && f.studentId !== studentId) return false;
    return true;
  });
}

export function getReportsByStudent(studentId: string) {
  return getReportCache()
    .filter((r) => r.studentId === studentId)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map(cloneReport);
}

export function getReportsByTeacher(teacherId: string) {
  return getReportCache()
    .filter((r) => r.teacherId === teacherId)
    .sort((a, b) => b.month.localeCompare(a.month))
    .map(cloneReport);
}

export function getFeedbackByLesson(lessonId: string) {
  const item = getFeedbackCache().find((f) => f.lessonId === lessonId);
  return item ? cloneFeedback(item) : undefined;
}

export function getLastFeedbackForStudent(studentId: string, beforeIso?: string) {
  const list = getFeedbacksByStudent(studentId);
  if (!beforeIso) return list[0];
  const before = new Date(beforeIso).getTime();
  return list.find((f) => new Date(f.lessonDate).getTime() < before);
}

export function countUnreadForStudent(studentId: string) {
  const unreadFb = getFeedbackCache().filter(
    (f) => f.studentId === studentId && !f.readAt
  ).length;
  const unreadRpt = getReportCache().filter(
    (r) => r.studentId === studentId && !r.readAt
  ).length;
  return unreadFb + unreadRpt;
}
