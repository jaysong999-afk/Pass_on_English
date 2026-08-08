import type { TeacherPayrollPenalty } from "@/types";

const penalties: TeacherPayrollPenalty[] = [
  {
    teacherId: "teacher-1",
    month: "2026-08",
    perfectAttendanceForfeited: true,
    quarterlyBonusReset: true,
    reason: "데모: lesson-demo-noshow-done",
    createdAt: "2026-08-01T09:00:00.000Z",
  },
  {
    teacherId: "teacher-3",
    month: "2026-08",
    perfectAttendanceForfeited: true,
    quarterlyBonusReset: false,
    reason: "무단 결석 1회",
    createdAt: "2026-08-02T00:00:00.000Z",
  },
];

export function getTeacherPenalties(teacherId: string): TeacherPayrollPenalty[] {
  return penalties
    .filter((p) => p.teacherId === teacherId)
    .map((p) => ({ ...p }));
}

export function getPenaltyForMonth(
  teacherId: string,
  month: string
): TeacherPayrollPenalty | undefined {
  return penalties.find((p) => p.teacherId === teacherId && p.month === month);
}

export function isPerfectAttendanceForfeited(teacherId: string, month: string): boolean {
  return Boolean(getPenaltyForMonth(teacherId, month)?.perfectAttendanceForfeited);
}

export function isQuarterlyBonusReset(teacherId: string, month: string): boolean {
  return Boolean(getPenaltyForMonth(teacherId, month)?.quarterlyBonusReset);
}

/** Teacher no-show: forfeit monthly perfect attendance + reset quarterly bonus streak */
export function applyTeacherNoShowPenalty(
  teacherId: string,
  month: string,
  reason?: string
): TeacherPayrollPenalty {
  const existing = penalties.find((p) => p.teacherId === teacherId && p.month === month);
  if (existing) {
    existing.perfectAttendanceForfeited = true;
    existing.quarterlyBonusReset = true;
    existing.reason = reason ?? existing.reason;
    return { ...existing };
  }
  const item: TeacherPayrollPenalty = {
    teacherId,
    month,
    perfectAttendanceForfeited: true,
    quarterlyBonusReset: true,
    reason,
    createdAt: new Date().toISOString(),
  };
  penalties.push(item);
  return { ...item };
}

/** Undo no-show penalty when the only reason was an admin no-show action */
export function revertTeacherNoShowPenalty(
  teacherId: string,
  month: string,
  reasonMatch?: string
): boolean {
  const index = penalties.findIndex(
    (p) =>
      p.teacherId === teacherId &&
      p.month === month &&
      (!reasonMatch || p.reason?.includes(reasonMatch))
  );
  if (index === -1) return false;
  penalties.splice(index, 1);
  return true;
}

/** @internal */
export function resetTeacherPayrollPenaltyStore() {
  penalties.length = 0;
  penalties.push(
    {
      teacherId: "teacher-1",
      month: "2026-08",
      perfectAttendanceForfeited: true,
      quarterlyBonusReset: true,
      reason: "데모: lesson-demo-noshow-done",
      createdAt: "2026-08-01T09:00:00.000Z",
    },
    {
      teacherId: "teacher-3",
      month: "2026-08",
      perfectAttendanceForfeited: true,
      quarterlyBonusReset: false,
      reason: "무단 결석 1회",
      createdAt: "2026-08-02T00:00:00.000Z",
    }
  );
}
