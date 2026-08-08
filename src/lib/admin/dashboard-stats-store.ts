import { financeData } from "@/lib/mock-data";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { getAllEnrollments } from "@/lib/enrollment-store";
import { getAllLessons } from "@/lib/teacher-lesson-store";
import { getAllTeachers } from "@/lib/teacher-profile-store";
import { getAdminReviewSnapshot } from "@/lib/admin/admin-review-store";

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

  const activeStudentIds = new Set(
    getAllEnrollments()
      .filter((e) => e.status === "active" || e.status === "expiring_soon")
      .map((e) => e.studentId)
  );

  return {
    todayLessonTotal: todayLessons.length,
    todayLessonCompleted: todayLessons.filter((l) => l.status === "completed").length,
    approvalPending,
    activeStudentCount: activeStudentIds.size,
    activeTeacherCount: getAllTeachers().filter((t) => t.status === "active").length,
    totalRevenueKrw: financeData.reduce((sum, row) => sum + row.revenueKrw, 0),
  };
}
