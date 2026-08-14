import type { TeacherPayrollPenalty } from "@/types";

let penaltyCache: TeacherPayrollPenalty[] = [];

export function setTeacherPayrollPenaltyCache(penalties: TeacherPayrollPenalty[]) {
  penaltyCache = penalties.map((p) => ({ ...p }));
}

export function getTeacherPayrollPenaltyCache() {
  return penaltyCache.map((p) => ({ ...p }));
}

export function upsertTeacherPayrollPenaltyCache(penalty: TeacherPayrollPenalty) {
  const index = penaltyCache.findIndex(
    (p) => p.teacherId === penalty.teacherId && p.month === penalty.month
  );
  if (index === -1) {
    penaltyCache.push({ ...penalty });
  } else {
    penaltyCache[index] = { ...penalty };
  }
}

export function removeTeacherPayrollPenaltyCache(teacherId: string, month: string) {
  penaltyCache = penaltyCache.filter((p) => !(p.teacherId === teacherId && p.month === month));
}

export function clearTeacherPayrollPenaltyCache() {
  penaltyCache = [];
}
