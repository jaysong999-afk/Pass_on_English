import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PricingSection } from "@/components/landing/PricingSection";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingSections";
import { buildLocalizedMetadata } from "@/lib/i18n/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return buildLocalizedMetadata(locale, "pricing", "/pricing");
}

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("pricing");

  return (
    <div className={`min-h-screen locale-${locale}`}>
      <LandingHeader locale={locale} />
      <main className="pt-4">
        <PricingSection locale={locale} standalone />
        <div className="landing-container -mt-8 pb-16 text-center">
          <Link
            href={`/${locale}/signup`}
            className="inline-flex h-12 items-center rounded-2xl bg-brand-600 px-8 text-base font-bold text-white shadow-lg shadow-brand-600/25 hover:bg-brand-700"
          >
            {t("cta")}
          </Link>
        </div>
      </main>
      <LandingFooter locale={locale} />
    </div>
  );
}
