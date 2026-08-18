import { appendAdminReviewLogInDb, getAdminReviewLogsByCategorySync } from "@/lib/admin/admin-review-log-repository";
import {
  getPendingStudentRegistrations,
  getStudentRegistrationById,
} from "@/lib/admin/student-registration-store-sync";
import {
  updateStudentRegistrationStatusInDb,
} from "@/lib/student-registrations/repository";
import {
  getPendingTeacherApplications,
} from "@/lib/admin/teacher-application-store";
import {
  getTeacherApplicationByIdInDb,
  getTeacherApplicationTeacherIdInDb,
  listTeacherApplicationsInDb,
  updateTeacherApplicationStatusInDb,
} from "@/lib/teacher-applications/repository";
import {
  confirmEnrollmentPaymentInDb,
  rejectEnrollmentPaymentInDb,
} from "@/lib/enrollments/repository";
import {
  getEnrollmentById,
  getPaymentByEnrollmentId,
  getPendingPaymentEnrollments,
} from "@/lib/enrollment-store-sync";
import { getStudentDirectoryEntry } from "@/lib/students/student-directory-store-sync";
import { getStudentDisplayName } from "@/lib/student-display-name";
import {
  getAllRescheduleRequests,
} from "@/lib/reschedule-store-sync";
import { countReschedulesRequiringAdminAttention } from "@/lib/reschedule/admin-monitoring";
import { updateLearnerRegistrationStatus } from "@/lib/account-store-sync";
import { updateTeacherStatusInDb, warmTeacherProfileCache } from "@/lib/teachers/repository";
import { decorateEnrollmentRenewal, getRenewalWindowState, isRenewalSystemAutoOffer } from "@/lib/enrollments/renewal-window";
import { getAllLessons } from "@/lib/teacher-lesson-store-sync";
import { getAllEnrollments } from "@/lib/enrollment-store-sync";
import type { AdminReviewLogEntry, StudentEnrollment } from "@/types";

export interface AdminPaymentReviewItem extends StudentEnrollment {
  studentName: string;
  studentLegalName?: string;
  depositorName?: string;
  accountHolderName?: string;
  renewalUnapplied?: boolean;
}

function paymentReviewLabel(enrollment: StudentEnrollment): Omit<
  AdminPaymentReviewItem,
  keyof StudentEnrollment
> {
  const entry = getStudentDirectoryEntry(enrollment.studentId);
  const payment = getPaymentByEnrollmentId(enrollment.id);
  const legalName = entry?.student.fullName.trim();
  const studentName = entry
    ? getStudentDisplayName(entry.student)
    : legalName || enrollment.studentId;
  const accountHolderName = entry?.accountHolder?.fullName.trim();
  const depositorName = payment?.depositorName?.trim() || undefined;
  return {
    studentName,
    studentLegalName: legalName && legalName !== studentName ? legalName : undefined,
    depositorName,
    accountHolderName:
      accountHolderName && accountHolderName !== studentName && accountHolderName !== legalName
        ? accountHolderName
        : undefined,
    renewalUnapplied: Boolean(
      enrollment.renewedFromEnrollmentId &&
        enrollment.paymentStatus === "pending" &&
        !depositorName &&
        isRenewalSystemAutoOffer(enrollment, getAllLessons(), getAllEnrollments()) &&
        getRenewalWindowState(enrollment, getAllLessons()).status === "student_closed"
    ),
  };
}

function toPaymentReviewItem(enrollment: StudentEnrollment): AdminPaymentReviewItem {
  return {
    ...decorateEnrollmentRenewal(enrollment),
    ...paymentReviewLabel(enrollment),
  };
}

export function getAdminReviewSnapshot() {
  const reschedule = getAllRescheduleRequests();
  return {
    reschedule,
    rescheduleAttentionCount: countReschedulesRequiringAdminAttention(reschedule),
    teacherApplications: getPendingTeacherApplications(),
    studentRegistrations: getPendingStudentRegistrations(),
    paymentEnrollments: getPendingPaymentEnrollments().map(toPaymentReviewItem),
    logs: getAdminReviewLogsByCategory(),
  };
}

export function getAdminReviewLogs() {
  return getAdminReviewLogsByCategory();
}

export function getAdminReviewLogsByCategory(limit = 100) {
  return getAdminReviewLogsByCategorySync(limit);
}

export async function processAdminReviewAction(input: {
  category: "reschedule" | "teacher_signup" | "student_signup" | "payment_activation";
  action: "approve" | "reject" | "confirm" | "activate";
  targetId: string;
  adminName?: string;
}): Promise<{ error?: string; log?: AdminReviewLogEntry }> {
  const adminName = input.adminName?.trim() || "관리자";

  if (input.category === "reschedule") {
    return { error: "invalid_action" };
  }

  if (input.category === "teacher_signup") {
    const application = await getTeacherApplicationByIdInDb(input.targetId);
    if (!application) return { error: "not_found" };
    if (application.status !== "pending") return { error: "not_pending" };

    if (input.action === "approve") {
      const teacherId = await getTeacherApplicationTeacherIdInDb(input.targetId);
      if (!teacherId) {
        return { error: "profile_incomplete" };
      }

      const updatedTeacher = await updateTeacherStatusInDb(teacherId, "active");
      if (!updatedTeacher) {
        return { error: "teacher_not_found" };
      }

      await updateTeacherApplicationStatusInDb(input.targetId, "approved");
      await warmTeacherProfileCache();
      await listTeacherApplicationsInDb();

      const log = await appendAdminReviewLogInDb({
        category: "teacher_signup",
        action: "approved",
        targetId: input.targetId,
        targetLabel: application.fullName,
        detail: application.email,
        adminName,
      });
      return { log };
    }
    if (input.action === "reject") {
      const teacherId = await getTeacherApplicationTeacherIdInDb(input.targetId);
      if (teacherId) {
        await updateTeacherStatusInDb(teacherId, "terminated");
        await warmTeacherProfileCache();
      }

      await updateTeacherApplicationStatusInDb(input.targetId, "rejected");
      await listTeacherApplicationsInDb();

      const log = await appendAdminReviewLogInDb({
        category: "teacher_signup",
        action: "rejected",
        targetId: input.targetId,
        targetLabel: application.fullName,
        adminName,
      });
      return { log };
    }
    return { error: "invalid_action" };
  }

  if (input.category === "student_signup") {
    const registration = getStudentRegistrationById(input.targetId);
    if (!registration) return { error: "not_found" };
    if (registration.status !== "pending") return { error: "not_pending" };

    if (input.action === "confirm") {
      await updateStudentRegistrationStatusInDb(input.targetId, "confirmed");
      updateLearnerRegistrationStatus(input.targetId, "confirmed");
      const log = await appendAdminReviewLogInDb({
        category: "student_signup",
        action: "confirmed",
        targetId: input.targetId,
        targetLabel: registration.learnerEnglishName,
        detail: `${registration.accountHolderName} (${registration.accountEmail})`,
        adminName,
      });
      return { log };
    }
    if (input.action === "reject") {
      await updateStudentRegistrationStatusInDb(input.targetId, "rejected");
      updateLearnerRegistrationStatus(input.targetId, "rejected");
      const log = await appendAdminReviewLogInDb({
        category: "student_signup",
        action: "rejected",
        targetId: input.targetId,
        targetLabel: registration.learnerEnglishName,
        adminName,
      });
      return { log };
    }
    return { error: "invalid_action" };
  }

  if (input.category === "payment_activation") {
    const enrollment = getEnrollmentById(input.targetId);
    if (!enrollment) return { error: "not_found" };
    const review = toPaymentReviewItem(enrollment);
    const studentLabel = review.studentLegalName
      ? `${review.studentName} (${review.studentLegalName})`
      : review.studentName;
    const depositorDetail = review.depositorName
      ? `입금자 ${review.depositorName} · `
      : "";

    if (input.action === "activate") {
      try {
        const confirmed = await confirmEnrollmentPaymentInDb(input.targetId, adminName);
        if (!confirmed) return { error: "not_found" };
      } catch (error) {
        const message = error instanceof Error ? error.message : "activate_failed";
        if (message === "hold_expired") return { error: "hold_expired" };
        throw error;
      }
      const log = await appendAdminReviewLogInDb({
        category: "payment_activation",
        action: "activated",
        targetId: input.targetId,
        targetLabel: `${studentLabel} · ${enrollment.planLabel}`,
        detail: `${depositorDetail}${enrollment.amountKrw.toLocaleString("ko-KR")}원`,
        adminName,
      });
      return { log };
    }
    if (input.action === "reject") {
      await rejectEnrollmentPaymentInDb(input.targetId, adminName);
      const log = await appendAdminReviewLogInDb({
        category: "payment_activation",
        action: "rejected",
        targetId: input.targetId,
        targetLabel: `${studentLabel} · ${enrollment.planLabel}`,
        detail: `${depositorDetail}${enrollment.amountKrw.toLocaleString("ko-KR")}원 · 신청 취소·시간대 해제`,
        adminName,
      });
      return { log };
    }
    return { error: "invalid_action" };
  }

  return { error: "invalid_category" };
}
