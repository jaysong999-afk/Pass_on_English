import { getPublicTeachers } from "@/lib/teacher-profile-store-sync";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";
import { HeroSection } from "@/components/landing/HeroSection";
import { StatsBar } from "@/components/landing/StatsBar";
import { TeacherTrustSection } from "@/components/landing/TeacherTrustSection";
import { LessonFlowSection } from "@/components/landing/LessonFlowSection";
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
  await ensurePublicContentBootstrapped();
  const teachers = getPublicTeachers();

  return (
    <div className={`min-h-screen locale-${locale}`}>
      <LandingHeader locale={locale} />

      <main>
        <HeroSection locale={locale} />
        <StatsBar />
        <FeaturesSection />
        <TeacherTrustSection />
        <TeachersSection teachers={teachers} locale={locale} />
        <LessonFlowSection />
        <CurriculumSection />
        <PricingSection locale={locale} />
        <HowItWorksSection />
        <FaqSection />
        <CtaBand locale={locale} />
      </main>

      <LandingFooter locale={locale} />
    </div>
  );
}
