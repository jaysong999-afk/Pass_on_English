export const locales = ["ko", "zh-CN"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "ko";

export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

/** Public landing / student UI locales only */
export const studentLocales = locales;

/** Teacher portal UI language (fixed) */
export const teacherLocale = "en" as const;

/** Admin portal UI language (fixed) */
export const adminLocale = "ko" as const;
