import { NextIntlClientProvider } from "next-intl";
import type { Metadata } from "next";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { isValidLocale } from "@/lib/i18n/config";
import { PwaInstallBanner } from "@/components/shared/PwaInstallBanner";
import { buildLocalizedMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return buildLocalizedMetadata(locale, "home");
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) notFound();
  setRequestLocale(locale);

  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider messages={messages}>
      <div className={`locale-${locale}`}>{children}</div>
      <PwaInstallBanner />
    </NextIntlClientProvider>
  );
}
