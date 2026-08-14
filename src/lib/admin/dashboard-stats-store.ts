import { getAllFinanceTransactionsFromCache } from "@/lib/finance/repository";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { getAllLessons } from "@/lib/teacher-lesson-store";
import { getAdminReviewSnapshot } from "@/lib/admin/admin-review-store";
import { getAdminStudentListItems } from "@/lib/admin/student-overview-store";
import { getAdminTeacherSummaryCounts } from "@/lib/admin/teacher-overview-store";

export interface AdminDashboardStats {
  todayLessonTotal: number;
  todayLessonCompleted: number;
  approvalPending: number;
  activeStudentCount: number;
  activeTeacherCount: number;
  totalRevenueKrw: number;
}

export function getAdminDashboardStats(now = new Date()): AdminDashboardStats {
  const snapshot = getAdminReviewSnapshot();
  const approvalPending =
    snapshot.reschedule.length +
    snapshot.teacherApplications.length +
    snapshot.studentRegistrations.length +
    snapshot.paymentEnrollments.length;

  const todayKey = getDateKeyInTimezone(now, CANONICAL_TIMEZONE);
  const todayLessons = getAllLessons().filter((lesson) => {
    if (lesson.status === "cancelled") return false;
    const lessonKey = getDateKeyInTimezone(new Date(lesson.scheduledAt), CANONICAL_TIMEZONE);
    return todayKey === lessonKey;
  });

  return {
    todayLessonTotal: todayLessons.length,
    todayLessonCompleted: todayLessons.filter((l) => l.status === "completed").length,
    approvalPending,
    activeStudentCount: getAdminStudentListItems("active").length,
    activeTeacherCount: getAdminTeacherSummaryCounts().active,
    totalRevenueKrw: getAllFinanceTransactionsFromCache()
      .filter((t) => t.type === "income")
      .reduce((sum, row) => sum + row.amountKrw, 0),
  };
}
