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

const logsByCategory: AdminReviewLogsByCategory = {
  reschedule: [],
  teacher_signup: [],
  student_signup: [],
  payment_activation: [],
};

function appendLog(
  category: AdminReviewCategory,
  input: Omit<AdminReviewLogEntry, "id" | "at" | "category"> & { at?: string }
): AdminReviewLogEntry {
  const entry: AdminReviewLogEntry = {
    ...input,
    category,
    id: `review-log-${category}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: input.at ?? new Date().toISOString(),
  };
  logsByCategory[category].unshift(entry);
  return { ...entry };
}

export function appendAdminReviewLog(
  input: Omit<AdminReviewLogEntry, "id" | "at"> & { at?: string }
): AdminReviewLogEntry {
  return appendLog(input.category, input);
}

export function getAdminReviewLogsByCategory(limit = 100): AdminReviewLogsByCategory {
  return {
    reschedule: logsByCategory.reschedule.slice(0, limit).map((entry) => ({ ...entry })),
    teacher_signup: logsByCategory.teacher_signup.slice(0, limit).map((entry) => ({ ...entry })),
    student_signup: logsByCategory.student_signup.slice(0, limit).map((entry) => ({ ...entry })),
    payment_activation: logsByCategory.payment_activation
      .slice(0, limit)
      .map((entry) => ({ ...entry })),
  };
}

export function getAdminReviewLogsForCategory(
  category: AdminReviewCategory,
  limit = 100
): AdminReviewLogEntry[] {
  return logsByCategory[category].slice(0, limit).map((entry) => ({ ...entry }));
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

/** @internal */
export function resetAdminReviewLogStore() {
  logsByCategory.reschedule = [];
  logsByCategory.teacher_signup = [];
  logsByCategory.student_signup = [];
  logsByCategory.payment_activation = [];
}
