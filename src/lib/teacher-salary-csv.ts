import type { AdminSalaryRow } from "@/lib/admin/teacher-salary-overview-store";

function formatSalaryMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const date = new Date(Number(year), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function escapeCsvCell(value: string | number): string {
  const safe = String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildSalaryOverviewCsvRows(
  month: string,
  rows: AdminSalaryRow[]
): string {
  const header = [
    "Month",
    "Teacher",
    "Classes",
    "Hours",
    "Hourly Rate (PHP)",
    "Base Salary (PHP)",
    "Perfect Attendance Bonus (PHP)",
    "Quarterly Bonus (PHP)",
    "Other Incentives (PHP)",
    "Deductions (PHP)",
    "Total (PHP)",
    "Status",
    "Needs Review",
    "KRW Transfer",
    "Confirmed At",
    "Completed At",
  ];

  const data = rows.map((r) => [
    formatSalaryMonthLabel(month),
    r.teacherName,
    r.completedClasses,
    r.totalHours,
    r.hourlyRate,
    r.baseSalary,
    r.perfectAttendanceBonus,
    r.quarterlyBonus,
    r.otherIncentives,
    r.deductions,
    r.total,
    r.status,
    r.needsReview ? "Yes" : "No",
    r.krwTransferAmount ?? "",
    r.adminConfirmedAt?.slice(0, 10) ?? "",
    r.completedAt?.slice(0, 10) ?? "",
  ]);

  return [header, ...data]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n");
}

export function salaryCsvFilename(month: string): string {
  return `teacher-salary-${month}.csv`;
}
