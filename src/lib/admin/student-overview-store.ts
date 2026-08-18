import type { CountryCode, PaymentStatus, StudentGender } from "@/types";
import { getEnrollmentsByStudent } from "@/lib/enrollment-store-sync";
import { getAllStudentDirectoryEntries } from "@/lib/students/student-directory-store-sync";
import { getStudentDisplayName } from "@/lib/student-display-name";
import { sumSessionBalance } from "@/lib/sessions";

export interface AdminStudentListItem {
  id: string;
  displayName: string;
  legalName: string;
  country: CountryCode;
  gender?: StudentGender;
  planLabel?: string;
  teacherName?: string;
  paymentStatus: PaymentStatus;
  sessionsRemaining: number;
  sessionsTotal: number;
  isActive: boolean;
}

function isCurrentlyEnrolled(studentId: string, rowActive: boolean): boolean {
  if (!rowActive) return false;
  const enrollments = getEnrollmentsByStudent(studentId);
  return enrollments.some(
    (e) =>
      e.status === "active" ||
      e.status === "expiring_soon" ||
      e.status === "pending_payment"
  );
}

export function getAdminStudentListItems(tab: "active" | "past" = "active"): AdminStudentListItem[] {
  const items = getAllStudentDirectoryEntries().map((entry) => {
    const enrollments = getEnrollmentsByStudent(entry.student.id).sort((a, b) =>
      b.startDate.localeCompare(a.startDate)
    );
    const openEnrollments = enrollments.filter((e) => e.status !== "completed");
    const balance = sumSessionBalance(openEnrollments);
    const primary =
      openEnrollments.find(
        (e) =>
          e.status === "active" ||
          e.status === "expiring_soon" ||
          e.status === "pending_payment"
      ) ?? enrollments[0];

    const isActive = isCurrentlyEnrolled(entry.student.id, entry.isActive);

    return {
      id: entry.student.id,
      displayName: getStudentDisplayName(entry.student),
      legalName: entry.student.fullName,
      country: entry.student.country,
      gender: entry.student.gender,
      planLabel: primary?.planLabel ?? entry.student.planLabel,
      teacherName: primary?.teacherName ?? entry.student.teacherName,
      paymentStatus: primary?.paymentStatus ?? entry.student.paymentStatus,
      sessionsRemaining: balance.remaining,
      sessionsTotal: balance.total,
      isActive,
    };
  });

  return items
    .filter((item) => (tab === "active" ? item.isActive : !item.isActive))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, "ko"));
}
