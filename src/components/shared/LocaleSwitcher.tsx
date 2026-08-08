"use client";

import { usePathname, useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

const localeLabels: Record<Locale, string> = {
  ko: "한국어",
  "zh-CN": "中文",
};

const compactLocaleLabels: Record<Locale, string> = {
  ko: "KO",
  "zh-CN": "中",
};

interface LocaleSwitcherProps {
  className?: string;
  /** Narrow headers: shorter labels and tighter padding */
  compact?: boolean;
}

export function LocaleSwitcher({ className, compact = false }: LocaleSwitcherProps) {
  const pathname = usePathname();
  const router = useRouter();

  const currentLocale = locales.find((l) => pathname.startsWith(`/${l}`)) ?? "ko";

  function switchLocale(locale: Locale) {
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000`;
    const segments = pathname.split("/");
    if (locales.includes(segments[1] as Locale)) {
      segments[1] = locale;
    } else {
      segments.splice(1, 0, locale);
    }
    router.push(segments.join("/") || `/${locale}`);
  }

  return (
    <div className={cn("flex gap-0.5 rounded-xl bg-gray-100 p-0.5", className)}>
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => switchLocale(locale)}
          className={cn(
            "rounded-lg font-medium transition-colors",
            compact ? "min-h-8 px-2 py-1 text-[11px]" : "min-h-9 px-3 py-1.5 text-xs",
            currentLocale === locale ? "bg-white text-brand-700 shadow-sm" : "text-gray-600 hover:text-gray-900"
          )}
        >
          {(compact ? compactLocaleLabels : localeLabels)[locale]}
        </button>
      ))}
    </div>
  );
}
