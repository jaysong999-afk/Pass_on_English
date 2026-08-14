import type { TeacherPayoutAccount, TeacherSalaryStatement, SalaryPayoutStatus } from "@/types";
import { CANONICAL_TIMEZONE } from "@/lib/availability/constants";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";
import { lessonCountsForPayroll } from "@/lib/admin/lesson-payroll-utils";
import {
  isPerfectAttendanceForfeited,
  isQuarterlyBonusReset,
} from "@/lib/teacher-payroll-penalty-store";
import {
  calcQuarterlyBonusFromHours,
  getSalaryBonusPolicy,
} from "@/lib/teacher-salary-policy-store";
import { getAdjustmentTotals } from "@/lib/teacher-salary-adjustment-store";
import { getTeacherById, getAllTeachers, updateTeacherHourlyRatePhp } from "@/lib/teacher-profile-store";
import { getTeacherLessons } from "@/lib/teacher-lesson-store";

export const PAYOUT_ACCOUNTS: Record<string, TeacherPayoutAccount> = {
  "teacher-1": {
    type: "bank",
    label: "BDO Savings",
    accountNumber: "**** 4821",
    accountName: "Sarah Mitchell",
  },
  "teacher-2": {
    type: "gcash",
    label: "GCash",
    accountNumber: "09XX XXX 5678",
    accountName: "James Rivera",
  },
};

export function monthKeyFromDate(date: Date): string {
  return getDateKeyInTimezone(date, CANONICAL_TIMEZONE).slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isSalaryMonthEnded(month: string): boolean {
  return month < monthKeyFromDate(new Date());
}

export function lessonsInMonth(teacherId: string, month: string) {
  return getTeacherLessons(teacherId).filter((l) => {
    if (l.status !== "completed") return false;
    if (!lessonCountsForPayroll(l, teacherId)) return false;
    const key = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE).slice(0, 7);
    return key === month;
  });
}

function rollingQuarterlyHours(teacherId: string, month: string): number {
  const policy = getSalaryBonusPolicy();
  let total = 0;
  for (let i = 0; i < policy.quarterlyPeriodMonths; i++) {
    const key = addMonths(month, -i);
    const lessons = lessonsInMonth(teacherId, key);
    total += lessons.reduce((sum, l) => sum + l.durationMinutes / 60, 0);
  }
  return Math.round(total * 10) / 10;
}

export function computeAmounts(
  teacherId: string,
  month: string,
  totalHours: number,
  hourlyRate: number
) {
  const policy = getSalaryBonusPolicy();
  const { bonusTotal, penaltyTotal } = getAdjustmentTotals(teacherId, month);
  const baseSalary = Math.round(totalHours * hourlyRate);
  const perfectAttendanceBonus = isPerfectAttendanceForfeited(teacherId, month)
    ? 0
    : Math.round(totalHours * policy.perfectAttendancePerHourPhp);
  const quarterlyBonus = isQuarterlyBonusReset(teacherId, month)
    ? 0
    : calcQuarterlyBonusFromHours(rollingQuarterlyHours(teacherId, month));
  return {
    baseSalary,
    perfectAttendanceBonus,
    quarterlyBonus,
    otherIncentives: bonusTotal,
    deductions: penaltyTotal,
  };
}

export function getPayoutAccount(teacherId: string): TeacherPayoutAccount {
  const teacher = getTeacherById(teacherId);
  return (
    PAYOUT_ACCOUNTS[teacherId] ?? {
      type: "bank",
      label: "Bank Account",
      accountNumber: "—",
      accountName: teacher?.displayName ?? "Teacher",
    }
  );
}

export function buildLiveEstimate(teacherId: string, month: string): TeacherSalaryStatement | null {
  const teacher = getTeacherById(teacherId);
  if (!teacher) return null;

  const completed = lessonsInMonth(teacherId, month);
  const totalHours =
    Math.round(completed.reduce((sum, l) => sum + l.durationMinutes / 60, 0) * 10) / 10;
  const hourlyRate = teacher.hourlyRatePhp;
  const amounts = computeAmounts(teacherId, month, totalHours, hourlyRate);

  return {
    id: `pay-live-${month}-${teacherId}`,
    teacherId,
    teacherName: teacher.displayName,
    month,
    status: "estimated",
    completedClasses: completed.length,
    totalHours,
    hourlyRate,
    ...amounts,
    paymentDate: undefined,
    payoutAccount: getPayoutAccount(teacherId),
    isLiveEstimate: true,
  };
}

export function getBonusPolicy() {
  const policy = getSalaryBonusPolicy();
  const tiers = policy.quarterlyTiers
    .map((t) => {
      const range =
        t.maxHours === null ? `${t.minHours}h+` : `${t.minHours}–${t.maxHours}h`;
      return `${range} → ₱${t.amountPhp.toLocaleString()}`;
    })
    .join(" | ");
  return {
    perfectAttendance: `Perfect attendance bonus: ₱${policy.perfectAttendancePerHourPhp}/hr (no unapproved absences or schedule changes)`,
    quarterly: `${policy.quarterlyPeriodMonths}-month rolling total: ${tiers}`,
    config: policy,
  };
}

export function statementTotal(s: TeacherSalaryStatement): number {
  return (
    s.baseSalary +
    s.perfectAttendanceBonus +
    s.quarterlyBonus +
    s.otherIncentives -
    s.deductions
  );
}

export function getVerificationLessons(teacherId: string, month: string) {
  return getTeacherLessons(teacherId)
    .filter((l) => {
      const key = getDateKeyInTimezone(new Date(l.scheduledAt), CANONICAL_TIMEZONE).slice(0, 7);
      return key === month;
    })
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((l) => ({
      id: l.id,
      scheduledAt: l.scheduledAt,
      studentName: l.studentName ?? "—",
      durationMinutes: l.durationMinutes,
      durationHours: Math.round((l.durationMinutes / 60) * 10) / 10,
      status: l.status,
      countsForPayroll: lessonCountsForPayroll(l, teacherId),
    }));
}

export function previewBulkHourlyRateUpdate(hourlyRatePhp: number, teacherIds?: string[]) {
  const eligible = getAllTeachers().filter(
    (t) => t.status === "active" || t.status === "on_leave"
  );
  const targets = teacherIds?.length
    ? eligible.filter((t) => teacherIds.includes(t.id))
    : eligible;
  const differing = targets
    .filter((t) => t.hourlyRatePhp !== hourlyRatePhp)
    .map((t) => ({
      id: t.id,
      name: t.displayName,
      currentRate: t.hourlyRatePhp,
    }));
  return {
    targetIds: targets.map((t) => t.id),
    differing,
    hasDifferingRates: differing.length > 0,
  };
}

export function applyBulkHourlyRateUpdate(hourlyRatePhp: number, teacherIds?: string[]) {
  const preview = previewBulkHourlyRateUpdate(hourlyRatePhp, teacherIds);
  for (const id of preview.targetIds) {
    updateTeacherHourlyRatePhp(id, hourlyRatePhp);
  }
  return preview;
}

export function updateTeacherHourlyRate(teacherId: string, hourlyRatePhp: number) {
  return updateTeacherHourlyRatePhp(teacherId, hourlyRatePhp);
}

type DbSalaryStatus = "estimated" | "processing" | "paid";

export function dbStatusToApp(
  dbStatus: DbSalaryStatus,
  isLiveEstimate: boolean
): SalaryPayoutStatus {
  if (isLiveEstimate) return "estimated";
  if (dbStatus === "estimated") return "confirmed";
  if (dbStatus === "paid") return "paid";
  return dbStatus;
}

export function appStatusToDb(
  status: SalaryPayoutStatus,
  isLiveEstimate?: boolean
): { status: DbSalaryStatus; is_live_estimate: boolean } {
  if (isLiveEstimate || status === "estimated") {
    return { status: "estimated", is_live_estimate: !!isLiveEstimate };
  }
  if (status === "confirmed") {
    return { status: "estimated", is_live_estimate: false };
  }
  if (status === "processing") {
    return { status: "processing", is_live_estimate: false };
  }
  return { status: "paid", is_live_estimate: false };
}

export function cloneStatement(s: TeacherSalaryStatement): TeacherSalaryStatement {
  return { ...s, payoutAccount: { ...s.payoutAccount } };
}
