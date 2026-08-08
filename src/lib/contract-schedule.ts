import { CANONICAL_TIMEZONE, DAY_LABEL_TO_DOW } from "@/lib/availability/constants";
import type { DayLabel } from "@/lib/availability/types";
import { getDateKeyInTimezone } from "@/lib/availability/timezone";

export function dayLabelForDateKey(dateKey: string): DayLabel {
  const short = new Intl.DateTimeFormat("en-US", {
    timeZone: CANONICAL_TIMEZONE,
    weekday: "short",
  }).format(new Date(`${dateKey}T12:00:00+09:00`));
  const map: Record<string, DayLabel> = {
    Mon: "Mon",
    Tue: "Tue",
    Wed: "Wed",
    Thu: "Thu",
    Fri: "Fri",
    Sat: "Sat",
    Sun: "Sun",
  };
  return map[short] ?? "Mon";
}

/** startDate부터 scheduleDays에 sessionCount회가 채워지는 마지막 날 */
export function computeContractEndDate(
  startDate: string,
  sessionCount: number,
  scheduleDays: DayLabel[]
): string {
  if (sessionCount <= 0) return startDate;

  const cursor = new Date(`${startDate}T12:00:00+09:00`);
  let created = 0;
  let lastDate = startDate;
  const maxDays = Math.max(sessionCount * 7, 365);

  for (let i = 0; i < maxDays && created < sessionCount; i++) {
    const dateKey = getDateKeyInTimezone(cursor, CANONICAL_TIMEZONE);
    const dayLabel = dayLabelForDateKey(dateKey);
    if (scheduleDays.includes(dayLabel)) {
      created += 1;
      lastDate = dateKey;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return lastDate;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const cursor = new Date(`${dateKey}T12:00:00+09:00`);
  cursor.setDate(cursor.getDate() + days);
  return getDateKeyInTimezone(cursor, CANONICAL_TIMEZONE);
}

export function sortScheduleDays(days: DayLabel[]): DayLabel[] {
  return [...days].sort((a, b) => DAY_LABEL_TO_DOW[a] - DAY_LABEL_TO_DOW[b]);
}
