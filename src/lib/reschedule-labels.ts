import type { LessonRescheduleRequest, RescheduleRequestStatus } from "@/types";

export function rescheduleStatusLabel(
  status: RescheduleRequestStatus,
  locale: "en" | "ko" | "zh" = "en"
): string {
  const labels: Record<RescheduleRequestStatus, Record<typeof locale, string>> = {
    pending_student_approval: {
      en: "Awaiting student approval",
      ko: "학생 승인 대기",
      zh: "等待学生确认",
    },
    pending_teacher_approval: {
      en: "Awaiting teacher approval",
      ko: "선생님 승인 대기",
      zh: "等待老师确认",
    },
    approved: {
      en: "Approved & scheduled",
      ko: "승인 완료 · 스케줄 반영",
      zh: "已确认并更新",
    },
    rejected: {
      en: "Rejected",
      ko: "거절됨",
      zh: "已拒绝",
    },
    cancelled: {
      en: "Cancelled",
      ko: "취소됨",
      zh: "已取消",
    },
  };
  return labels[status][locale];
}

export function initiatorLabel(
  initiator: LessonRescheduleRequest["initiator"],
  locale: "en" | "ko" | "zh" = "en"
): string {
  if (initiator === "teacher") {
    return locale === "ko" ? "선생님 요청" : locale === "zh" ? "老师申请" : "Teacher request";
  }
  return locale === "ko" ? "학생 요청" : locale === "zh" ? "学生申请" : "Student request";
}

export function canAdminApprove(request: LessonRescheduleRequest): boolean {
  return (
    request.status === "pending_student_approval" ||
    request.status === "pending_teacher_approval"
  );
}

export function canApprove(
  request: LessonRescheduleRequest,
  role: "teacher" | "student"
): boolean {
  if (role === "student") return request.status === "pending_student_approval";
  return request.status === "pending_teacher_approval";
}

export function canCancel(
  request: LessonRescheduleRequest,
  role: "teacher" | "student"
): boolean {
  const isPending =
    request.status === "pending_student_approval" ||
    request.status === "pending_teacher_approval";
  return isPending && request.initiator === role;
}

export function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string {
  if (!value) return "";
  return value.length === 16 ? `${value}:00` : value;
}
