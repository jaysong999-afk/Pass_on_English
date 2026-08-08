import type { Locale } from "@/lib/i18n/config";
import { CANONICAL_TIMEZONE } from "./constants";
import type { DayLabel, SlotStartTime } from "./types";
import { DOW_TO_DAY_LABEL } from "./constants";

/** Teacher portal — Philippines (UTC+8) */
export const TEACHER_TIMEZONE = "Asia/Manila";

/** Student portal display by locale */
export const STUDENT_TIMEZONE: Record<Locale, string> = {
  ko: "Asia/Seoul",
  "zh-CN": "Asia/Shanghai",
};

const DAY_REFERENCE: Record<DayLabel, string> = {
  Mon: "2026-01-05",
  Tue: "2026-01-06",
  Wed: "2026-01-07",
  Thu: "2026-01-08",
  Fri: "2026-01-09",
  Sat: "2026-01-10",
  Sun: "2026-01-11",
};

const WEEKDAY_TO_DAY: Record<string, DayLabel> = {
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

/** Fixed reference instant for a KST weekly slot (storage format). */
export function kstSlotToDate(day: DayLabel, time: SlotStartTime): Date {
  return new Date(`${DAY_REFERENCE[day]}T${time}:00+09:00`);
}

export function formatSlotTimeInTimezone(
  day: DayLabel,
  time: SlotStartTime,
  timeZone: string
): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(kstSlotToDate(day, time));
}

/** Grid row labels — offset is constant across weekdays for our zones. */
export function formatGridTimeLabel(kstTime: SlotStartTime, displayTimeZone: string): string {
  return formatSlotTimeInTimezone("Mon", kstTime, displayTimeZone);
}

export function getStudentTimezone(locale: Locale): string {
  return STUDENT_TIMEZONE[locale];
}

export function getTimezoneShortLabel(timeZone: string, locale = "en"): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date());
    const offset = parts.find((p) => p.type === "timeZoneName")?.value;
    if (offset) return offset.replace("GMT", "UTC");
  } catch {
    /* fall through */
  }

  if (timeZone === "Asia/Seoul") return "KST";
  if (timeZone === "Asia/Shanghai") return "CST";
  if (timeZone === "Asia/Manila") return "PHT";
  return timeZone;
}

/** Parse lesson ISO timestamp into canonical KST weekly slot. */
export function lessonScheduledAtToKstSlot(scheduledAt: string): {
  day: DayLabel;
  start: SlotStartTime;
} {
  const date = new Date(scheduledAt);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CANONICAL_TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const day = WEEKDAY_TO_DAY[weekday] ?? "Mon";
  const start = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}` as SlotStartTime;

  return { day, start };
}

/** Next occurrence of a KST weekly slot strictly after now. */
export function nextKstSlotOccurrenceIso(dayOfWeek: number, startTime: SlotStartTime): string {
  const dayLabel = DOW_TO_DAY_LABEL[dayOfWeek];
  let candidate = kstSlotToDate(dayLabel, startTime);
  const now = new Date();

  while (candidate <= now) {
    candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  return candidate.toISOString();
}

/** YYYY-MM-DD in a given IANA timezone. */
export function getDateKeyInTimezone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDayLabelInTimezone(date: Date, timeZone: string): DayLabel {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  return WEEKDAY_TO_DAY[weekday] ?? "Mon";
}

export function formatCalendarDayHeader(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

/** Monday 00:00 local for the week containing `date`. */
export function startOfWeekMonday(date: Date = new Date()): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatWeekRange(weekStart: Date, timeZone: string): string {
  const weekEnd = addDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const startStr = new Intl.DateTimeFormat("en-US", opts).format(weekStart);
  const endStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
  }).format(weekEnd);
  return `${startStr} – ${endStr}`;
}

export function isDateKeyInWeek(dateKey: string, weekStart: Date, timeZone: string): boolean {
  const keys: string[] = [];
  for (let i = 0; i < 7; i++) {
    keys.push(getDateKeyInTimezone(addDays(weekStart, i), timeZone));
  }
  return keys.includes(dateKey);
}

export function kstSlotCellKey(dateKey: string, kstTime: SlotStartTime): string {
  return `${dateKey}|${kstTime}`;
}
