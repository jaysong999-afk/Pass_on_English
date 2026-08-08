import { appendAdminReviewLog, getAdminReviewLogsByCategory } from "@/lib/admin/admin-review-log-store";
import {
  getPendingStudentRegistrations,
  getStudentRegistrationById,
  updateStudentRegistrationStatus,
} from "@/lib/admin/student-registration-store";
import {
  getPendingTeacherApplications,
  getTeacherApplicationById,
  updateTeacherApplicationStatus,
} from "@/lib/admin/teacher-application-store";
import {
  confirmEnrollmentPayment,
  getEnrollmentById,
  getPendingPaymentEnrollments,
  rejectEnrollmentPayment,
} from "@/lib/enrollment-store";
import { scheduleLessonsForConfirmedEnrollment } from "@/lib/lesson-scheduler";
import {
  adminApproveRescheduleRequest,
  adminRejectRescheduleRequest,
  getActiveRescheduleRequests,
  getRescheduleRequestById,
} from "@/lib/reschedule-store";
import { updateLearnerRegistrationStatus } from "@/lib/account-store";
import { getTeacherByApplicationId, updateTeacherStatus } from "@/lib/teacher-profile-store";
import { formatDate, formatTime } from "@/lib/utils";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import type { AdminReviewLogEntry } from "@/types";

export function getAdminReviewSnapshot() {
  return {
    reschedule: getActiveRescheduleRequests(),
    teacherApplications: getPendingTeacherApplications(),
    studentRegistrations: getPendingStudentRegistrations(),
    paymentEnrollments: getPendingPaymentEnrollments(),
    logs: getAdminReviewLogsByCategory(),
  };
}

export function getAdminReviewLogs() {
  return getAdminReviewLogsByCategory();
}

export function processAdminReviewAction(input: {
  category: "reschedule" | "teacher_signup" | "student_signup" | "payment_activation";
  action: "approve" | "reject" | "confirm" | "activate";
  targetId: string;
  adminName?: string;
}): { error?: string; log?: AdminReviewLogEntry } {
  const adminName = input.adminName?.trim() || "관리자";

  if (input.category === "reschedule") {
    if (input.action === "approve") {
      const before = getRescheduleRequestById(input.targetId);
      if (!before) return { error: "not_found" };
      const result = adminApproveRescheduleRequest(input.targetId);
      if (result.error) return { error: result.error };
      const log = appendAdminReviewLog({
        category: "reschedule",
        action: "approved",
        targetId: input.targetId,
        targetLabel: `${before.studentName} · ${before.teacherName}`,
        detail: `${formatDate(before.originalScheduledAt, "ko")} ${formatTime(before.originalScheduledAt, "ko", CANONICAL_TIMEZONE)} → ${formatDate(before.proposedScheduledAt, "ko")} ${formatTime(before.proposedScheduledAt, "ko", CANONICAL_TIMEZONE)}`,
        adminName,
      });
      return { log };
    }
    if (input.action === "reject") {
      const before = getRescheduleRequestById(input.targetId);
      if (!before) return { error: "not_found" };
      const result = adminRejectRescheduleRequest(input.targetId);
      if (result.error) return { error: result.error };
      const log = appendAdminReviewLog({
        category: "reschedule",
        action: "rejected",
        targetId: input.targetId,
        targetLabel: `${before.studentName} · ${before.teacherName}`,
        adminName,
      });
      return { log };
    }
    return { error: "invalid_action" };
  }

  if (input.category === "teacher_signup") {
    const application = getTeacherApplicationById(input.targetId);
    if (!application) return { error: "not_found" };
    if (application.status !== "pending") return { error: "not_pending" };

    if (input.action === "approve") {
      updateTeacherApplicationStatus(input.targetId, "approved");
      const teacher = getTeacherByApplicationId(input.targetId);
      if (teacher) {
        updateTeacherStatus(teacher.id, "active");
      }
      const log = appendAdminReviewLog({
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
      updateTeacherApplicationStatus(input.targetId, "rejected");
      const log = appendAdminReviewLog({
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
      updateStudentRegistrationStatus(input.targetId, "confirmed");
      updateLearnerRegistrationStatus(input.targetId, "confirmed");
      const log = appendAdminReviewLog({
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
      updateStudentRegistrationStatus(input.targetId, "rejected");
      updateLearnerRegistrationStatus(input.targetId, "rejected");
      const log = appendAdminReviewLog({
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

    if (input.action === "activate") {
      const confirmed = confirmEnrollmentPayment(input.targetId, adminName);
      if (!confirmed) return { error: "not_found" };
      scheduleLessonsForConfirmedEnrollment(input.targetId);
      const log = appendAdminReviewLog({
        category: "payment_activation",
        action: "activated",
        targetId: input.targetId,
        targetLabel: `${enrollment.planLabel} · ${enrollment.teacherName}`,
        detail: `${enrollment.amountKrw.toLocaleString("ko-KR")}원`,
        adminName,
      });
      return { log };
    }
    if (input.action === "reject") {
      rejectEnrollmentPayment(input.targetId, adminName);
      const log = appendAdminReviewLog({
        category: "payment_activation",
        action: "rejected",
        targetId: input.targetId,
        targetLabel: `${enrollment.planLabel} · ${enrollment.teacherName}`,
        adminName,
      });
      return { log };
    }
    return { error: "invalid_action" };
  }

  return { error: "invalid_category" };
}
