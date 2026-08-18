import { PolicyPage } from "@/components/landing/PolicyPage";
import { buildLocalizedMetadata } from "@/lib/i18n/metadata";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; return buildLocalizedMetadata(locale, "refund", "/refund-policy"); }
export default async function Page({ params }: { params: Promise<{ locale: string }> }) { const { locale } = await params; return <PolicyPage locale={locale} kind="refund" />; }
