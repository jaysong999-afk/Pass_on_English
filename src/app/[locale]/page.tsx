import { getPublicTeachers } from "@/lib/teacher-profile-store";
import { HeroSection } from "@/components/landing/HeroSection";
import { StatsBar } from "@/components/landing/StatsBar";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { CurriculumSection } from "@/components/landing/CurriculumSection";
import { PricingSection } from "@/components/landing/PricingSection";
import { TeachersSection } from "@/components/landing/TeachersSection";
import { HowItWorksSection } from "@/components/landing/HowItWorksSection";
import { FaqSection } from "@/components/landing/FaqSection";
import { CtaBand } from "@/components/landing/CtaBand";
import { LandingHeader, LandingFooter } from "@/components/landing/LandingSections";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const teachers = getPublicTeachers();

  return (
    <div className={`min-h-screen locale-${locale}`}>
      <LandingHeader locale={locale} />

      <main>
        <HeroSection locale={locale} />
        <StatsBar />
        <FeaturesSection />
        <CurriculumSection />
        <PricingSection locale={locale} />
        <TeachersSection teachers={teachers} locale={locale} />
        <HowItWorksSection />
        <FaqSection />
        <CtaBand locale={locale} />
      </main>

      <LandingFooter />
    </div>
  );
}
