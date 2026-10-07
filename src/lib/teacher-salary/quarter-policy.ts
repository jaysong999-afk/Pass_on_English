export const FIXED_QUARTER_FIRST_PAYOUT_MONTH = "2027-01";

export function addSalaryMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getQuarterlyBonusEarningMonths(payoutMonth: string): string[] {
  const payoutMonthNumber = Number(payoutMonth.slice(5, 7));
  if (![1, 4, 7, 10].includes(payoutMonthNumber)) return [];
  return [-3, -2, -1].map((delta) => addSalaryMonths(payoutMonth, delta));
}

export function isFixedQuarterlyBonusPayoutMonth(month: string): boolean {
  return (
    month >= FIXED_QUARTER_FIRST_PAYOUT_MONTH &&
    getQuarterlyBonusEarningMonths(month).length === 3
  );
}
