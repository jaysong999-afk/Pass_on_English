import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency: "KRW" | "CNY" | "PHP") {
  if (currency === "KRW") return `${amount.toLocaleString()}원`;
  if (currency === "CNY") return `${amount}元`;
  return `₱${amount.toLocaleString()}`;
}

export function formatDate(date: string | Date, locale = "ko", timeZone = "Asia/Seoul") {
  const value =
    typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? new Date(`${date}T12:00:00+09:00`)
      : new Date(date);
  if (!Number.isFinite(value.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(value);
}

export function formatTime(date: string | Date, locale = "ko", timeZone?: string) {
  const value = new Date(date);
  if (!Number.isFinite(value.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(value);
}

export function formatLessonTimeRange(
  scheduledAt: string | Date,
  durationMinutes: number,
  locale = "ko",
  timeZone?: string
): string {
  const start = new Date(scheduledAt);
  if (!Number.isFinite(start.getTime())) return "—";
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return `${formatTime(start, locale, timeZone)} – ${formatTime(end, locale, timeZone)}`;
}
