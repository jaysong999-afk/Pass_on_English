import type { Teacher } from "@/types";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { DOW_TO_DAY_LABEL } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { getAllEnrollments } from "@/lib/enrollment-store";
import { getPendingTeacherApplications } from "@/lib/admin/teacher-application-store";
import { getTeacherWeeklyAvailability } from "@/lib/teacher-availability-store";
import { getAllTeachers } from "@/lib/teacher-profile-store";
import {
  getSalaryStatement,
  statementTotal,
} from "@/lib/teacher-salary-store";
import { getTeacherLessons, getTodayLessons } from "@/lib/teacher-lesson-store";

export interface AdminTeacherSummaryCounts {
  active: number;
  pending: number;
  onLeave: number;
  terminated: number;
  total: number;
}

export interface AdminTeacherListItem {
  id: string;
  displayName: string;
  status: Teacher["status"];
  studentCount: number;
  todayLessonCount: number;
  monthHours: number;
  occupancyPercent: number;
  scheduledThisMonth: number;
  availabilityThisMonth: number;
  estimatedSalaryPhp: number;
}

function currentMonthKey(now = new Date()): string {
  return getDateKeyInTimezone(now, CANONICAL_TIMEZONE).slice(0, 7);
}

function countStudentsForTeacher(teacherId: string): number {
  const ids = new Set<string>();
  for (const e of getAllEnrollments()) {
    if (e.teacherId !== teacherId) continue;
    if (e.status === "active" || e.status === "expiring_soon") {
      ids.add(e.studentId);
    }
  }
  return ids.size;
}

function countMonthlyAvailabilitySlots(teacherId: string, month: string): number {
  const availability = getTeacherWeeklyAvailability(teacherId);
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d);
    const dayLabel = DOW_TO_DAY_LABEL[date.getDay()];
    count += availability.slots[dayLabel]?.length ?? 0;
  }
  return count;
}

function countMonthlyScheduledLessons(teacherId: string, month: string): number {
  return getTeacherLessons(teacherId).filter((l) => {
    if (l.status === "cancelled") return false;
    const key = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE).slice(0, 7);
    return key === month;
  }).length;
}

function monthCompletedHours(teacherId: string, month: string): number {
  const statement = getSalaryStatement(teacherId, month);
  return statement?.totalHours ?? 0;
}

export function getAdminTeacherSummaryCounts(): AdminTeacherSummaryCounts {
  const all = getAllTeachers();
  const pendingApplications = getPendingTeacherApplications().length;
  const pendingTeachers = all.filter((t) => t.status === "pending").length;

  return {
    active: all.filter((t) => t.status === "active").length,
    pending: pendingApplications + pendingTeachers,
    onLeave: all.filter((t) => t.status === "on_leave").length,
    terminated: all.filter((t) => t.status === "terminated").length,
    total: all.length + pendingApplications,
  };
}

export function getAdminTeacherListItems(now = new Date()): AdminTeacherListItem[] {
  const month = currentMonthKey(now);

  return getAllTeachers()
    .map((teacher) => {
      const availabilityThisMonth = countMonthlyAvailabilitySlots(teacher.id, month);
      const scheduledThisMonth = countMonthlyScheduledLessons(teacher.id, month);
      const occupancyPercent =
        availabilityThisMonth > 0
          ? Math.min(100, Math.round((scheduledThisMonth / availabilityThisMonth) * 100))
          : 0;
      const statement = getSalaryStatement(teacher.id, month);

      return {
        id: teacher.id,
        displayName: teacher.displayName,
        status: teacher.status,
        studentCount: countStudentsForTeacher(teacher.id),
        todayLessonCount: getTodayLessons(teacher.id, CANONICAL_TIMEZONE, now).length,
        monthHours: monthCompletedHours(teacher.id, month),
        occupancyPercent,
        scheduledThisMonth,
        availabilityThisMonth,
        estimatedSalaryPhp: statement ? statementTotal(statement) : 0,
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export const TEACHER_STATUS_LABELS: Record<Teacher["status"], string> = {
  active: "활성",
  pending: "승인 대기",
  on_leave: "휴직",
  terminated: "종료",
};

export const ADMIN_TEACHER_STATUS_OPTIONS: Teacher["status"][] = [
  "active",
  "on_leave",
  "terminated",
];
