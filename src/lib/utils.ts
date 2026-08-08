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

export function formatDate(date: string | Date, locale = "ko") {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

export function formatTime(date: string | Date, locale = "ko", timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(date));
}

export function formatLessonTimeRange(
  scheduledAt: string | Date,
  durationMinutes: number,
  locale = "ko",
  timeZone?: string
): string {
  const start = new Date(scheduledAt);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return `${formatTime(start, locale, timeZone)} – ${formatTime(end, locale, timeZone)}`;
}
