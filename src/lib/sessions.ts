import type { SessionAdjustment, StudentEnrollment } from "@/types";
/** Format: 12회/20회 (잔여/전체) */
export function formatSessionBalance(remaining: number, total: number) {
  return `${remaining}회/${total}회`;
}

/** Format: 8회/20회(잔여 12회) — 수업 진행도 */
export function formatSessionProgress(used: number, total: number, remaining: number) {
  return `${used}회/${total}회(잔여 ${remaining}회)`;
}

export function formatSessionProgressFromEnrollment(
  enrollment: Pick<StudentEnrollment, "sessionsTotal" | "sessionsRemaining">
) {
  const used = getSessionsUsed(enrollment);
  return formatSessionProgress(used, enrollment.sessionsTotal, enrollment.sessionsRemaining);
}

export function getSessionsUsed(enrollment: Pick<StudentEnrollment, "sessionsTotal" | "sessionsRemaining">) {
  return Math.max(0, enrollment.sessionsTotal - enrollment.sessionsRemaining);
}

export function sumSessionBalance(enrollments: StudentEnrollment[]) {
  const total = enrollments.reduce((sum, e) => sum + e.sessionsTotal, 0);
  const remaining = enrollments.reduce((sum, e) => sum + e.sessionsRemaining, 0);
  return { remaining, total };
}

/** Only active courses with generated schedules — excludes payment holds. */
export function sumActiveSessionBalance(enrollments: StudentEnrollment[]) {
  return sumSessionBalance(
    enrollments.filter((e) => e.status === "active" || e.status === "expiring_soon")
  );
}

export function formatAdjustmentLine(adj: SessionAdjustment) {
  const delta = adj.deltaRemaining;
  const sign = delta > 0 ? `+${delta}` : String(delta);
  return `${sign}회 → ${adj.newRemaining}회/${adj.newTotal}회`;
}
