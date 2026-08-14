import { LandingHeader, LandingFooter } from "@/components/landing/LandingSections";
import { TeachersSection } from "@/components/landing/TeachersSection";
import { getPublicTeachers } from "@/lib/teacher-profile-store";
import { ensurePublicContentBootstrapped } from "@/lib/lesson-scheduler-bootstrap";

export default async function PublicTeachersPage({
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
      <main className="pt-4">
        <TeachersSection teachers={teachers} locale={locale} />
      </main>
      <LandingFooter />
    </div>
  );
}
