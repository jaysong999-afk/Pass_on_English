import type {
  Lesson,
  LessonFeedback,
  StudentEnrollment,
  Teacher,
  TeacherApplication,
  TeacherSalaryStatement,
} from "@/types";
import type { TeacherWeeklyAvailability } from "@/lib/availability/types";
import { getAllEnrollments } from "@/lib/enrollment-store-sync";
import { getFeedbacksByTeacher } from "@/lib/learning-store-sync";
import { listTeacherApplications, getTeacherApplicationById } from "@/lib/admin/teacher-application-store";
import { getTeacherWeeklyAvailability } from "@/lib/teacher-availability-store-sync";
import { getTeacherPenalties } from "@/lib/teacher-payroll-penalty-store-sync";
import { getTeacherById } from "@/lib/teacher-profile-store-sync";
import {
  getPayoutAccount,
  getSalaryStatementsForTeacher,
  getSalaryStatement,
  statementTotal,
} from "@/lib/teacher-salary-store-sync";
import { getTeacherLessons, getTodayLessons } from "@/lib/teacher-lesson-store-sync";
import { getStudentDirectoryEntry } from "@/lib/students/student-directory-store-sync";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import {
  getAdminTeacherListItems,
  type AdminTeacherListItem,
} from "@/lib/admin/teacher-overview-store";

export interface AdminTeacherDetail {
  teacher: Teacher;
  listMetrics: AdminTeacherListItem;
  availability: TeacherWeeklyAvailability;
  enrollments: StudentEnrollment[];
  students: { studentId: string; studentName: string; planLabel: string; status: string }[];
  todayLessons: Lesson[];
  upcomingLessons: Lesson[];
  recentLessons: Lesson[];
  feedbacks: LessonFeedback[];
  salaryStatements: TeacherSalaryStatement[];
  currentMonthEstimate: TeacherSalaryStatement | null;
  currentMonthEstimateTotal: number;
  payoutAccount: ReturnType<typeof getPayoutAccount>;
  penalties: ReturnType<typeof getTeacherPenalties>;
  application: TeacherApplication | null;
}

export function getAdminTeacherDetail(teacherId: string): AdminTeacherDetail | null {
  const teacher = getTeacherById(teacherId);
  if (!teacher) return null;

  const listItems = getAdminTeacherListItems();
  const listMetrics = listItems.find((t) => t.id === teacherId);
  if (!listMetrics) return null;

  const enrollments = getAllEnrollments()
    .filter((e) => e.teacherId === teacherId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const studentRows = [...new Set(
    enrollments
      .filter((e) => e.status === "active" || e.status === "expiring_soon")
      .map((e) => e.studentId)
  )].map((studentId) => {
    const enrollment = enrollments.find(
      (e) =>
        e.studentId === studentId &&
        (e.status === "active" || e.status === "expiring_soon")
    )!;
    const profile = getStudentDirectoryEntry(studentId);
    return {
      studentId,
      studentName: profile ? getStudentDisplayName(profile.student) : studentId,
      planLabel: enrollment.planLabel,
      status: enrollment.status,
    };
  });

  const now = new Date();
  const month = getDateKeyInTimezone(now, CANONICAL_TIMEZONE).slice(0, 7);
  const allLessons = getTeacherLessons(teacherId).sort(
    (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime()
  );

  const upcomingLessons = allLessons
    .filter(
      (l) =>
        l.status !== "cancelled" &&
        l.status !== "completed" &&
        new Date(l.scheduledAt) >= now
    )
    .slice(0, 20);

  const application = teacher.applicationId
    ? getTeacherApplicationById(teacher.applicationId)
    : null;

  const currentMonthEstimate = getSalaryStatement(teacherId, month);

  return {
    teacher,
    listMetrics,
    availability: getTeacherWeeklyAvailability(teacherId),
    enrollments,
    students: studentRows,
    todayLessons: getTodayLessons(teacherId, CANONICAL_TIMEZONE, now),
    upcomingLessons,
    recentLessons: allLessons.slice(0, 30),
    feedbacks: getFeedbacksByTeacher(teacherId),
    salaryStatements: getSalaryStatementsForTeacher(teacherId),
    currentMonthEstimate,
    currentMonthEstimateTotal: currentMonthEstimate ? statementTotal(currentMonthEstimate) : 0,
    payoutAccount: getPayoutAccount(teacherId),
    penalties: getTeacherPenalties(teacherId),
    application,
  };
}

export function getPendingTeacherApplications(): TeacherApplication[] {
  return listTeacherApplications().filter((a) => a.status === "pending");
}
