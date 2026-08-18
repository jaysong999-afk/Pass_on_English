import { getAllFinanceTransactionsFromCache } from "@/lib/finance/repository";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { getAllLessons } from "@/lib/teacher-lesson-store-sync";
import { getAdminReviewSnapshot } from "@/lib/admin/admin-review-store";
import { getAdminStudentListItems } from "@/lib/admin/student-overview-store";
import { getAdminTeacherSummaryCounts } from "@/lib/admin/teacher-overview-store";

export interface AdminDashboardStats {
  todayLessonTotal: number;
  todayLessonCompleted: number;
  actionRequired: number;
  activeStudentCount: number;
  activeTeacherCount: number;
  totalRevenueKrw: number;
}

export function getAdminDashboardStats(now = new Date()): AdminDashboardStats {
  const snapshot = getAdminReviewSnapshot();
  const actionRequired =
    snapshot.rescheduleAttentionCount +
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
    actionRequired,
    activeStudentCount: getAdminStudentListItems("active").length,
    activeTeacherCount: getAdminTeacherSummaryCounts().active,
    totalRevenueKrw: getAllFinanceTransactionsFromCache()
      .filter((t) => t.type === "income")
      .reduce((sum, row) => sum + row.amountKrw, 0),
  };
}
