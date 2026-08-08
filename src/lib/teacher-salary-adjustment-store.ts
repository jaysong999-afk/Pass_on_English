import type { TeacherSalaryAdjustment } from "@/types";

const adjustments: TeacherSalaryAdjustment[] = [];

export function getAdjustmentsForTeacherMonth(
  teacherId: string,
  month: string
): TeacherSalaryAdjustment[] {
  return adjustments
    .filter((a) => a.teacherId === teacherId && a.month === month)
    .map((a) => ({ ...a }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getAdjustmentTotals(teacherId: string, month: string) {
  const items = getAdjustmentsForTeacherMonth(teacherId, month);
  const bonusTotal = items
    .filter((a) => a.type === "bonus")
    .reduce((sum, a) => sum + a.amountPhp, 0);
  const penaltyTotal = items
    .filter((a) => a.type === "penalty")
    .reduce((sum, a) => sum + a.amountPhp, 0);
  return { bonusTotal, penaltyTotal, items };
}

export function addSalaryAdjustment(input: {
  teacherId: string;
  month: string;
  type: "bonus" | "penalty";
  amountPhp: number;
  reason: string;
  createdBy?: string;
}): TeacherSalaryAdjustment {
  const item: TeacherSalaryAdjustment = {
    id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    teacherId: input.teacherId,
    month: input.month,
    type: input.type,
    amountPhp: Math.abs(input.amountPhp),
    reason: input.reason.trim(),
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy ?? "admin",
  };
  adjustments.unshift(item);
  return { ...item };
}

/** @internal */
export function resetSalaryAdjustmentStore() {
  adjustments.length = 0;
}
