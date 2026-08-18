import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { defaultLocale, isValidLocale, locales, type Locale } from "@/lib/i18n/config";

export type PublicMetadataPage =
  | "home"
  | "about"
  | "pricing"
  | "teachers"
  | "terms"
  | "privacy"
  | "refund";

export async function buildLocalizedMetadata(
  rawLocale: string,
  page: PublicMetadataPage,
  pathname = ""
): Promise<Metadata> {
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : defaultLocale;
  const t = await getTranslations({ locale, namespace: "metadata" });
  const localizedPath = pathname ? `/${locale}${pathname}` : `/${locale}`;
  const languageAlternates = Object.fromEntries(
    locales.map((item) => [item, pathname ? `/${item}${pathname}` : `/${item}`])
  );

  return {
    title: t(`${page}.title`),
    description: t(`${page}.description`),
    alternates: {
      canonical: localizedPath,
      languages: { ...languageAlternates, "x-default": pathname ? `/ko${pathname}` : "/ko" },
    },
    openGraph: {
      type: "website",
      siteName: "PassOn English",
      locale: locale === "zh-CN" ? "zh_CN" : "ko_KR",
      url: localizedPath,
      title: t(`${page}.title`),
      description: t(`${page}.description`),
    },
  };
}
