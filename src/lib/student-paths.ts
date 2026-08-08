import { useLocale } from "next-intl";
import type { Locale } from "@/lib/i18n/config";

export function studentBasePath(locale: Locale | string) {
  return `/${locale}/student`;
}

export function useStudentBasePath() {
  const locale = useLocale();
  return studentBasePath(locale);
}

export function studentPath(locale: Locale | string, segment = "") {
  const base = studentBasePath(locale);
  if (!segment) return base;
  return segment.startsWith("/") ? `${base}${segment}` : `${base}/${segment}`;
}
