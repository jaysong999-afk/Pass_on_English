import { LandingHeader, LandingFooter } from "@/components/landing/LandingSections";
import { AboutPageContent } from "@/components/landing/AboutPageContent";

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  return (
    <div className={`min-h-screen locale-${locale}`}>
      <LandingHeader locale={locale} />
      <main>
        <AboutPageContent locale={locale} />
      </main>
      <LandingFooter />
    </div>
  );
}
