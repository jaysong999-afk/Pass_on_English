import type {
  AdminReviewAction,
  AdminReviewCategory,
  AdminReviewLogEntry,
} from "@/types";

export interface AdminReviewLogsByCategory {
  reschedule: AdminReviewLogEntry[];
  teacher_signup: AdminReviewLogEntry[];
  student_signup: AdminReviewLogEntry[];
  payment_activation: AdminReviewLogEntry[];
}

const EMPTY: AdminReviewLogsByCategory = {
  reschedule: [],
  teacher_signup: [],
  student_signup: [],
  payment_activation: [],
};

let logsByCategory: AdminReviewLogsByCategory = {
  reschedule: [],
  teacher_signup: [],
  student_signup: [],
  payment_activation: [],
};

export function setAdminReviewLogCache(logs: AdminReviewLogEntry[]) {
  logsByCategory = {
    reschedule: [],
    teacher_signup: [],
    student_signup: [],
    payment_activation: [],
  };
  for (const entry of logs) {
    logsByCategory[entry.category].push({ ...entry });
  }
}

export function prependAdminReviewLogCache(entry: AdminReviewLogEntry) {
  logsByCategory[entry.category].unshift({ ...entry });
}

export function getAdminReviewLogCache(): AdminReviewLogsByCategory {
  return {
    reschedule: logsByCategory.reschedule.map((e) => ({ ...e })),
    teacher_signup: logsByCategory.teacher_signup.map((e) => ({ ...e })),
    student_signup: logsByCategory.student_signup.map((e) => ({ ...e })),
    payment_activation: logsByCategory.payment_activation.map((e) => ({ ...e })),
  };
}

export function clearAdminReviewLogCache() {
  logsByCategory = { ...EMPTY, reschedule: [], teacher_signup: [], student_signup: [], payment_activation: [] };
}

export function categoryLabel(category: AdminReviewCategory): string {
  const labels: Record<AdminReviewCategory, string> = {
    reschedule: "수업 시간 변경",
    teacher_signup: "신규 선생님",
    student_signup: "신규 학생",
    payment_activation: "입금 · 수업 활성화",
  };
  return labels[category];
}

export function actionLabel(action: AdminReviewAction): string {
  const labels: Record<AdminReviewAction, string> = {
    approved: "승인",
    rejected: "거절",
    confirmed: "확인",
    activated: "활성화",
  };
  return labels[action];
}
